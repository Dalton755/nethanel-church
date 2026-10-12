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
        "&artifact_path=not.is.null&release_id=is.null&order=finished_at.desc&limit=1&select=*",
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
    historical = download_baseline(record)
    path = os.environ.get("ELO_BASELINE_APK_PATH")
    if path:
        candidate_path = Path(path)
        if not candidate_path.is_file():
            raise RuntimeError("APK atualizado anteriormente nao encontrado para o canary.")
        installed = inspect_apk(candidate_path)
        if installed["signing_certificate_sha256"] != historical["signing_certificate_sha256"]:
            raise RuntimeError("A assinatura do APK anteriormente instalado nao coincide com o historico.")
        if installed["version_code"] < historical["version_code"]:
            raise RuntimeError("APK anterior mais antigo que a versao historica.")
    else:
        installed = historical
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
    print("Sem publicacao em producao nem envio de Push.")


def stage_preview():
    """Disponibiliza SOMENTE o APK canary no canal testing do Elo Church Demo.

    Confere novamente a assinatura, exige que a linha de base seja o
    versionCode 5 instalado e impede republicacao silenciosa.
    """
    import uuid
    verify()
    if os.environ.get("ELO_STAGE_DEMO_PREVIEW") != "true":
        raise RuntimeError("Staging de preview deve ser explicitamente habilitado no workflow.")
    baseline = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    original = json.loads(CLAIM_FILE.read_text(encoding="utf-8"))
    candidate = inspect_apk(APK_FILE)
    if baseline["organization_id"] != DEMO_ORGANIZATION_ID:
        raise RuntimeError("Somente Demo permitido.")
    if baseline["previous_apk"]["version_code"] != 5 or candidate["version_code"] != 6:
        raise RuntimeError("Este teste exige migracao da versao 5 para a versao 6.")

    releases = request(
        "GET", "/rest/v1/church_app_releases"
        "?channel=eq.preview&version_code=eq.6&select=id,status,version_name,update_kind"
    ) or []
    if releases:
        if len(releases) != 1 or releases[0]["status"] != "testing" or releases[0]["version_name"] != "1.0.6":
            raise RuntimeError("Release preview 6 ja esta reservado por outra execucao.")
        release_id = releases[0]["id"]
    else:
        created = request("POST", "/rest/v1/church_app_releases", {
            "channel": "preview",
            "version_name": "1.0.6",
            "version_code": 6,
            "minimum_supported_version_code": 1,
            "update_kind": "apk",
            "runtime_version": "elo" + DEMO_ORGANIZATION_ID.replace("-", "") + "-1.0.6",
            "release_notes": "Teste do aviso de atualizacao dentro do Elo: toque em Perfil > Verificar atualizacoes.",
            "status": "testing",
        })
        if not created or len(created) != 1:
            raise RuntimeError("Nao foi possivel reservar release de preview.")
        release_id = created[0]["id"]

    existing = request("GET", "/rest/v1/church_apk_builds"
        f"?organization_id=eq.{DEMO_ORGANIZATION_ID}&version_code=eq.6"
        "&status=eq.ready&select=id,release_id") or []
    if existing:
        if len(existing) != 1 or existing[0]["release_id"] != release_id:
            raise RuntimeError("Versao 6 pronta divergente do release de preview.")
        print("Preview ja preparado anteriormente e disponivel apenas para solicitante do APK Demo.")
        return

    build_id = str(uuid.uuid4())
    artifact_path = f"{DEMO_ORGANIZATION_ID}/{build_id}.apk"
    data = APK_FILE.read_bytes()
    if not 1_000_000 < len(data) < 200_000_000 or data[:2] != b"PK":
        raise RuntimeError("APK nao atende limites de tamanho/integridade.")
    uploaded = request(
        "POST", f"/storage/v1/object/{BUCKET}/{artifact_path}",
        data, content_type="application/vnd.android.package-archive"
    )
    if not uploaded or not uploaded.get("Key"):
        raise RuntimeError("Storage nao confirmou o APK Demo.")
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    created = request("POST", "/rest/v1/church_apk_builds", {
        "id": build_id,
        "organization_id": DEMO_ORGANIZATION_ID,
        "unit_id": original["unit_id"],
        "requested_by": original["requested_by"],
        "status": "ready",
        "android_package": original["android_package"],
        "app_scheme": original["app_scheme"],
        "branded_push": original["branded_push"],
        "snapshot": original["snapshot"],
        "artifact_path": artifact_path,
        "version_name": candidate["version_name"],
        "version_code": candidate["version_code"],
        "release_id": release_id,
        "signing_certificate_sha256": candidate["signing_certificate_sha256"],
        "created_at": now,
        "started_at": now,
        "finished_at": now,
        "build_url": os.environ.get("GITHUB_SERVER_URL", "https://github.com")
                    + "/" + os.environ.get("GITHUB_REPOSITORY", "Dalton755/nethanel-church")
                    + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", ""),
    })
    if not created or len(created) != 1:
        raise RuntimeError("Nao foi possivel indexar o APK Demo apos upload.")
    print("CANARY v6 STAGED: apenas release preview/testing e solicitante do Demo.")
    print("Nenhum release production/published alterado.")
    

if __name__ == "__main__":
    actions = {"prepare": prepare, "verify": verify, "stage-preview": stage_preview}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit("Uso: elo_update_canary.py prepare|verify|stage-preview")
    actions[sys.argv[1]]()
