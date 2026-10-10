#!/usr/bin/env python3
"""Elo App Factory. Executar SOMENTE no GitHub Actions protegido.
A chave de service_role nunca deve ir para apps/web ou APK.
Uso: python scripts/elo_app_factory.py claim|prepare|complete|fail
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_REF = "esukjhuyooppxgfmltkb"
BASE_URL = f"https://{PROJECT_REF}.supabase.co"
BUCKET = "elo-church-apks"
CLAIM_FILE = Path("/tmp/elo-app-factory-claim.json")
APK_FILE = Path("apps/mobile/elo-church-app.apk")


def headers(content_type="application/json"):
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not secret:
        raise RuntimeError(
            "Configure SUPABASE_SERVICE_ROLE_KEY no GitHub Actions Secrets."
        )
    return {
        "apikey": secret,
        "Authorization": "Bearer " + secret,
        "Content-Type": content_type,
        "Prefer": "return=representation",
    }


def request(method, path, body=None, content_type="application/json"):
    data = None if body is None else (
        json.dumps(body).encode("utf-8") if content_type == "application/json" else body
    )
    req = urllib.request.Request(
        BASE_URL + path, data=data, headers=headers(content_type), method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        # Don't log the response body: it can contain private build metadata.
        raise RuntimeError(f"Supabase HTTP {exc.code} em {path.split('?')[0]}") from exc


def validate_claim(data):
    if not isinstance(data, dict):
        raise ValueError("Solicitação inválida")
    org = data["organization_id"]
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", org):
        raise ValueError("ID de organização inválido")
    snapshot = data["snapshot"]
    if snapshot["organization_id"] != org:
        raise ValueError("Identidade do build não coincide com a igreja")
    package = data["android_package"]
    if not re.fullmatch(r"br\.com\.nethanel\.elo\.c[0-9a-f]{32}", package):
        raise ValueError("Android package inválido")
    if not re.fullmatch(r"elo[0-9a-f]{20}", data["app_scheme"]):
        raise ValueError("App scheme inválido")
    prefix = f"{BASE_URL}/storage/v1/object/public/church-branding/{org}/"
    for key in ["logo_url", "app_icon_url", "splash_url"]:
        url = snapshot[key]
        if not isinstance(url, str) or not url.startswith(prefix):
            raise ValueError("URL de branding fora do bucket da igreja")
        parsed = urllib.parse.urlparse(url)
        if parsed.username or parsed.password or parsed.port or parsed.fragment:
            raise ValueError("URL de branding inválida")
        if ".." in urllib.parse.unquote(parsed.path):
            raise ValueError("Caminho de branding inválido")
    for key in ["primary_color", "background_color"]:
        if not re.fullmatch("#[0-9a-fA-F]{6}", snapshot[key]):
            raise ValueError("Cor inválida")
    if not 2 <= len(snapshot["app_name"].strip()) <= 40:
        raise ValueError("Nome do app deve ter entre 2 e 40 caracteres")
    for key in ["app_name", "logo_url", "app_icon_url", "splash_url"]:
        if "\n" in snapshot[key] or "\r" in snapshot[key]:
            raise ValueError("Dado de branding inválido")
    return snapshot


def claim():
    rows = request("GET", "/rest/v1/church_apk_builds?status=eq.queued&order=created_at.asc&limit=25&select=*")
    if not rows:
        print("Sem aplicativos pendentes.")
        return

    firebase = request("GET", "/rest/v1/church_firebase_android_apps"
                       "?select=organization_id,android_package")
    registered = {row["organization_id"]: row["android_package"] for row in firebase}

    record = None
    for candidate in rows:
        if candidate.get("branded_push") and registered.get(
                candidate["organization_id"]) != candidate["android_package"]:
            # Espera provisionamento oficial do Firebase. Não queima tentativas
            # e não afeta o atendimento de outras igrejas da fila.
            continue
        record = candidate
        break
    if record is None:
        print("Solicitações em espera: registro Firebase Android pendente.")
        return
    try:
        validate_claim(record)
    except Exception as error:
        request("PATCH",
                f"/rest/v1/church_apk_builds?id=eq.{record['id']}&status=eq.queued",
                {"status": "failed", "failure_reason": str(error)[:250],
                 "finished_at": datetime.now(timezone.utc).isoformat()})
        raise
    changed = request(
        "PATCH", f"/rest/v1/church_apk_builds?id=eq.{record['id']}&status=eq.queued",
        {"status": "building", "started_at": datetime.now(timezone.utc).isoformat()})
    if not changed:
        print("Outro executor assumiu o build.")
        return
    CLAIM_FILE.write_text(json.dumps(changed[0]), encoding="utf-8")
    print("Solicitação assumida:", changed[0]["id"])


def prepare():
    if not CLAIM_FILE.exists():
        return
    record = json.loads(CLAIM_FILE.read_text(encoding="utf-8"))
    brand = validate_claim(record)
    values = {
        "ELO_WHITE_LABEL": "true",
        "ELO_APP_NAME": brand["app_name"],
        "ELO_ORGANIZATION_ID": record["organization_id"],
        "ELO_ANDROID_PACKAGE": record["android_package"],
        "ELO_IOS_BUNDLE_ID": record["android_package"],
        "ELO_SCHEME": record["app_scheme"],
        "ELO_PRIMARY_COLOR": brand["primary_color"],
        "ELO_BACKGROUND_COLOR": brand["background_color"],
        "ELO_LOGO_URL": brand["logo_url"],
        "ELO_ICON_URL": brand["app_icon_url"],
        "ELO_SPLASH_URL": brand["splash_url"],
        "ELO_BRANDED_PUSH": "true" if record["branded_push"] else "false",
    }
    if record["branded_push"]:
        # Busca apenas identificadores públicos, associados ao tenant, via service_role.
        # Nunca colocar credenciais privadas do Firebase no banco ou no APK.
        org = urllib.parse.quote(record["organization_id"], safe="")
        rows = request(
            "GET",
            f"/rest/v1/church_firebase_android_apps?organization_id=eq.{org}"
            "&select=firebase_project_id,firebase_app_id,android_package",
        )
        if not rows or len(rows) != 1:
            raise RuntimeError(
                "Registre o pacote Android da igreja no Firebase antes do build."
            )

        firebase = rows[0]
        if firebase["android_package"] != record["android_package"]:
            raise RuntimeError("Identificador Android divergente do registro Firebase.")

        # O google-services.json do Elo base é a fonte dos identificadores
        # públicos de projeto e API. Geramos um arquivo somente com o client
        # da igreja que será incluído no APK personalizado.
        template_path = Path("apps/mobile/google-services.json")
        parsed = json.loads(template_path.read_text(encoding="utf-8"))
        project = parsed.get("project_info", {})
        if project.get("project_id") != firebase["firebase_project_id"]:
            raise RuntimeError("Projeto Firebase do APK não coincide com o Elo.")

        app_id = firebase["firebase_app_id"]
        expected_prefix = f"1:{project.get('project_number')}:android:"
        if not isinstance(app_id, str) or not app_id.startswith(expected_prefix):
            raise RuntimeError("Firebase App ID inválido para o projeto.")

        base_clients = parsed.get("client", [])
        if not base_clients:
            raise RuntimeError("Configuração base do Firebase não tem cliente Android.")

        # Usa cliente já configurado do mesmo projeto, inclusive API key
        # client-side, sem copiá-la para variáveis ou logs.
        from copy import deepcopy
        app_client = deepcopy(base_clients[0])
        app_client["client_info"]["mobilesdk_app_id"] = app_id
        app_client["client_info"]["android_client_info"]["package_name"] = record[
            "android_package"
        ]
        app_client["oauth_client"] = []  # OAuth Android depende de SHA-1/256 exclusivos.
        parsed["client"] = [app_client]
        target = Path("apps/mobile/google-services-white-label.json")
        target.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
        values["ELO_GOOGLE_SERVICES_FILE"] = "./google-services-white-label.json"
        print("Configuração Firebase específica da igreja validada.")

    # O arquivo GITHUB_ENV será interpretado pelo runner, nunca por um shell eval.
    environment = Path(os.environ["GITHUB_ENV"])
    with environment.open("a", encoding="utf-8") as output:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise ValueError("Variável de build malformada")
            output.write(f"{key}={value}\n")
    print("Ambiente validado para package:", record["android_package"])


def complete():
    if not CLAIM_FILE.exists():
        return
    record = json.loads(CLAIM_FILE.read_text(encoding="utf-8"))
    data = APK_FILE.read_bytes()
    if len(data) < 1_000_000 or not data.startswith(b"PK"):
        raise RuntimeError("Arquivo Android inválido ou incompleto.")
    path = f"{record['organization_id']}/{record['id']}.apk"
    result = request(
        "POST", f"/storage/v1/object/{BUCKET}/{path}",
        data, content_type="application/vnd.android.package-archive")
    if not result or not result.get("Key"):
        raise RuntimeError("Armazenamento não confirmou o APK.")
    request("PATCH",
        f"/rest/v1/church_apk_builds?id=eq.{record['id']}&status=eq.building",
        {"status": "ready", "artifact_path": path,
         "finished_at": datetime.now(timezone.utc).isoformat(),
         "build_url": os.environ.get("GITHUB_SERVER_URL", "https://github.com")
                        + "/" + os.environ.get("GITHUB_REPOSITORY", "Dalton755/nethanel-church")
                        + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", "")})
    print("APK exclusivo disponível no painel da igreja.")


def fail():
    if not CLAIM_FILE.exists():
        return
    record = json.loads(CLAIM_FILE.read_text(encoding="utf-8"))
    request("PATCH",
        f"/rest/v1/church_apk_builds?id=eq.{record['id']}&status=eq.building",
        {"status": "failed",
         "failure_reason": "Falha ao gerar APK. Verificar credenciais de assinatura/Firebase e o build EAS no GitHub.",
         "finished_at": datetime.now(timezone.utc).isoformat()})
    print("Falha de compilação registrada para a igreja.")


if __name__ == "__main__":
    actions = {"claim": claim, "prepare": prepare, "complete": complete, "fail": fail}
    if len(sys.argv) != 2 or sys.argv[1] not in actions:
        raise SystemExit("Uso: elo_app_factory.py claim|prepare|complete|fail")
    actions[sys.argv[1]]()
