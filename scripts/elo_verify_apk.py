#!/usr/bin/env python3
"""Valida Android package, versao e assinatura ANTES de disponibilizar APK white-label.

Usa SDK Android instalado no GitHub Actions. Chave privada nunca e transmitida.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from elo_app_factory import APK_FILE, CLAIM_FILE, BASE_URL, BUCKET, headers, request


def sdk_tool(name):
    found = shutil.which(name)
    if found:
        return found
    root = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or "")
    versions = root / "build-tools"
    candidates = sorted(versions.glob(f"*/{name}"), reverse=True) if versions.exists() else []
    if not candidates:
        raise RuntimeError(f"Android SDK nao encontrou {name}.")
    return str(candidates[0])


def inspect_apk(path):
    apk = str(path)
    if not Path(path).is_file():
        raise RuntimeError("APK nao encontrado.")
    aapt = subprocess.run(
        [sdk_tool("aapt"), "dump", "badging", apk],
        capture_output=True, text=True, check=True
    ).stdout
    match = re.search(r"package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", aapt)
    if not match:
        raise RuntimeError("Manifest Android nao contem identidade/versao valida.")
    signed = subprocess.run(
        [sdk_tool("apksigner"), "verify", "--print-certs", apk],
        capture_output=True, text=True, check=True
    ).stdout
    # apksigner moderno usa "V2 Signer" / "V3 Signer", e pode apresentar
    # o MESMO certificado mais de uma vez para esquemas de assinatura distintos.
    matches = re.findall(
        r"(?im)^\\s*(?:v[0-9]+\\s+)?signer\\s*#\\d+\\s+certificate\\s+SHA-256\\s+digest:\\s*([a-fA-F0-9:]+)",
        signed,
    )
    fingerprints = sorted(set(value.replace(":", "").lower() for value in matches))
    if len(fingerprints) != 1:
        # Somente labels, nunca identidades ou credenciais, nos logs.
        labels = [line.split(":", 1)[0].strip() for line in signed.splitlines()
                  if "SHA-256" in line and "digest" in line]
        raise RuntimeError(
            f"APK exige exatamente um certificado: encontrou {len(fingerprints)}; "
            f"cabecalhos apksigner: {labels[:8]}"
        )
    fingerprint = fingerprints[0]
    if not re.fullmatch(r"[0-9a-f]{64}", fingerprint):
        raise RuntimeError("Fingerprint invalido.")
    return {
        "android_package": match.group(1),
        "version_code": int(match.group(2)),
        "version_name": match.group(3),
        "signing_certificate_sha256": fingerprint,
        "apk_sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
    }


def previously_delivered(org, exclude_id):
    rows = request("GET", "/rest/v1/church_apk_builds"
                   f"?organization_id=eq.{org}&status=eq.ready"
                   "&artifact_path=not.is.null&order=finished_at.desc"
                   "&select=id,artifact_path,version_code,signing_certificate_sha256&limit=10") or []
    return next((r for r in rows if r["id"] != exclude_id), None)


def download_prior(path, destination):
    if not re.fullmatch(r"[a-f0-9-]{36}/[a-f0-9-]{36}\.apk", path):
        raise RuntimeError("Caminho anterior invalido.")
    url = f"{BASE_URL}/storage/v1/object/{BUCKET}/{path}"
    req = urllib.request.Request(url, headers=headers("application/octet-stream"))
    with urllib.request.urlopen(req, timeout=180) as response:
        with open(destination, "wb") as file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                file.write(chunk)
                if file.tell() > 200_000_000:
                    raise RuntimeError("APK anterior excede limite de verificacao.")


def verify():
    if not CLAIM_FILE.exists():
        print("Nenhum APK reivindicado; nada a validar.")
        return
    record = json.loads(CLAIM_FILE.read_text(encoding="utf-8"))
    result = inspect_apk(APK_FILE)
    org = record["organization_id"]
    if result["android_package"] != record["android_package"]:
        raise RuntimeError("Bloqueado: package Android diferente da igreja.")

    if record.get("version_code") is not None:
        if result["version_code"] != record["version_code"]:
            raise RuntimeError("Bloqueado: versionCode diferente do release aprovado.")
    if record.get("version_name") and result["version_name"] != record["version_name"]:
        raise RuntimeError("Bloqueado: versionName diferente do release aprovado.")

    old_identity = request(
        "GET", f"/rest/v1/church_app_identities?organization_id=eq.{org}"
        "&select=android_package,app_scheme,signing_certificate_sha256,last_verified_version_code"
    ) or []
    if old_identity:
        identity = old_identity[0]
        if identity["android_package"] != record["android_package"] or identity["app_scheme"] != record["app_scheme"]:
            raise RuntimeError("Bloqueado: identidade imutavel da igreja alterada.")
        previous_fingerprint = identity["signing_certificate_sha256"]
        previous_code = identity["last_verified_version_code"]
    else:
        previous_fingerprint = None
        previous_code = 0

    previous = previously_delivered(org, record["id"])
    if previous:
        # Tabelas legadas podem nao conter dados de assinatura/versionCode.
        # Nesse caso a VERDADE e o APK previamente distribuido.
        if not previous_fingerprint or previous.get("version_code") is None:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "previous.apk"
                download_prior(previous["artifact_path"], path)
                last_apk = inspect_apk(path)
                if last_apk["android_package"] != record["android_package"]:
                    raise RuntimeError("Historico de APKs possui package divergente.")
                if previous_fingerprint and previous_fingerprint != last_apk["signing_certificate_sha256"]:
                    raise RuntimeError("Registro e APK anterior possuem certificados diferentes.")
                previous_fingerprint = last_apk["signing_certificate_sha256"]
                previous_code = max(previous_code, last_apk["version_code"])
        previous_code = max(previous_code, previous.get("version_code") or 0)

    if previous_fingerprint and result["signing_certificate_sha256"] != previous_fingerprint:
        raise RuntimeError("Bloqueado: a assinatura do APK anterior nao foi preservada.")
    if result["version_code"] <= previous_code:
        raise RuntimeError("Bloqueado: versionCode nao e maior que a versao instalada anteriormente.")

    record["verification"] = result
    CLAIM_FILE.write_text(json.dumps(record), encoding="utf-8")
    print("APK seguro: pacote, versionCode crescente e assinatura preservada.")


if __name__ == "__main__":
    verify()
