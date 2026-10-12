#!/usr/bin/env python3
"""Canary Elo Church Demo, somente artefato GitHub Actions (nada em producao).

Le historico real do Supabase para comparar assinaturas antes de propor uma
atualizacao instalavel sobre o APK ja distribuido.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

from elo_app_factory import (
    BASE_URL, BUCKET, CLAIM_FILE, APK_FILE, headers, prepare as factory_prepare,
    request, validate_claim,
)
from elo_verify_apk import inspect_apk

DEMO_ORGANIZATION_ID = "101212c5-6e81-4915-ae9a-fbde5b42bb04"
BASELINE_FILE = Path("/tmp/elo-demo-apk-baseline.json")
PREVIOUS_APK = Path("/tmp/elo-demo-previous.apk")


def latest_demo_build():
    rows = request(
        "GET",
        "/rest/v1/church_apk_builds"
        f"?organization_id=eq.{DEMO_ORGANIZATION_ID}&status=eq.ready"
        "&artifact_path=not.is.null&order=finished_at.desc&limit=1&select=*",
    ) or []
    if len(rows) != 1:
        raise RuntimeError("Nenhum APK do Elo Church Demo pronto no Supabase.")
    record = rows[0]
    validate_claim(record)
    expected = "br.com.nethanel.elo.c" + DEMO_ORGANIZATION_ID.replace("-", "")
    if record["android_package"] != expected:
        raise RuntimeError("Historico Demo tem pacote Android inesperado.")
    return record


def download_baseline(record):
    artifact_path = record["artifact_path"]
    if artifact_path is None or not artifact_path.startswith(DEMO_ORGANIZATION_ID + "/"):
        raise RuntimeError("APK anterior fora da pasta do Elo Church Demo.")
    url = f"{BASE_URL}/storage/v1/object/{BUCKET}/{artifact_path}"
    req = urllib.request.Request(url, headers=headers("application/octet-stream"))
    with urllib.request.urlopen(req, timeout=180) as stream:
        with PREVIOUS_APK.open("wb") as output:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                if output.tell() > 200_000_000:
                    raise RuntimeError("APK historico excede 200MB.")
    if PREVIOUS_APK.stat().st_size < 1_000_000:
        raise RuntimeError("APK Demo historico incompleto.")
    return inspect_apk(PREVIOUS_APK)


def prepare():
    if not os.environ.get("GITHUB_ENV"):
        raise RuntimeError("Somente permitido no GitHub Actions de canary.")
    record = latest_demo_build()
    installed = download_baseline(record)
    if installed["android_package"] != record["android_package"]:
        raise RuntimeError("Pacote no arquivo historico difere do Supabase.")
    next_code = installed["version_code"] + 1
    # O versionCode pode ter origem remota no EAS historico;
    # nunca assumir 1 ou derivar da quantidade de builds.
    next_version = f"1.0.{next_code}"
    record["version_code"] = next_code
    record["version_name"] = next_version
    record["release_id"] = None
    CLAIM_FILE.write_text(json.dumps(record), encoding="utf-8")
    BASELINE_FILE.write_text(json.dumps({
        "organization_id": DEMO_ORGANIZATION_ID,
        "previous_apk": installed,
        "candidate_version_code": next_code,
        "candidate_version_name": next_version,
    }), encoding="utf-8")
    factory_prepare()
    print("APK anterior da igreja validado. Nova compilacao somente para TESTE.")
    print("VersionCode anterior:", installed["version_code"])
    print("VersionCode proposto:", next_code)
    print("A assinatura precisa corresponder ao APK anterior.")


def verify():
    baseline = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    previous = baseline["previous_apk"]
    candidate = inspect_apk(APK_FILE)
    if candidate["android_package"] != previous["android_package"]:
        raise RuntimeError("FALHA: APK da igreja tem applicationId diferente.")
    if candidate["signing_certificate_sha256"] != previous["signing_certificate_sha256"]:
        raise RuntimeError(
            "FALHA: APK teste usa certificado diferente. Nao instalar/desinstalar app original!"
        )
    if candidate["version_code"] != baseline["candidate_version_code"]:
        raise RuntimeError("FALHA: versionCode do APK nao corresponde ao incremento testado.")
    if candidate["version_name"] != baseline["candidate_version_name"]:
        raise RuntimeError("FALHA: versionName do APK nao corresponde a versao do teste.")
    print("CANARY OK: mesmo pacote, mesma assinatura, versionCode crescente.")
    print("Build seguro para o teste de instalacao por cima do Elo Church Demo.")
    print("Sem gravacoes em Supabase, sem deploy, sem envio de Push.")


if __name__ == "__main__":
    actions = {"prepare": prepare, "verify": verify}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit("Uso: elo_update_canary.py prepare|verify")
    actions[sys.argv[1]]()
