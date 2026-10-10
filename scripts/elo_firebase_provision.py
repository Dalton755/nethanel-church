#!/usr/bin/env python3
"""Cria automaticamente o cadastro ANDROID Firebase para APKs Elo White Label.

Somente GitHub Actions protegido executa isto. Credencial de gerenciamento:
GitHub Secret ELO_FIREBASE_MANAGEMENT_SA_JSON (ou versão Base64). Não usar chave FCM Expo
para gerenciar aplicativos sem permissão explícita de Firebase Management.
Nunca publica chave nem JSON administrativo nos aplicativos.
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from elo_app_factory import request

PROJECT = os.environ.get("ELO_FIREBASE_PROJECT_ID", "nethanel-elo").strip()
MAX_APPS_PER_PROJECT = 25
BASE = "https://firebase.googleapis.com/v1beta1"


def access_token():
    raw = os.environ.get("ELO_FIREBASE_MANAGEMENT_SA_JSON", "").strip()
    encoded = os.environ.get("ELO_FIREBASE_MANAGEMENT_SA_JSON_B64", "").strip()
    if not raw and not encoded:
        return None
    # A chave privada existe somente em memória do job. Prefira JSON bruto
    # no GitHub Secret para facilitar a configuração pelo celular.
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    info = json.loads(raw) if raw else json.loads(
        base64.b64decode(encoded, validate=True).decode("utf-8"))
    if info.get("type") != "service_account":
        raise ValueError("A credencial precisa ser uma conta de serviço Google.")
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/firebase"])
    credentials.refresh(Request())
    return credentials.token


def google(method, path, bearer, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, method=method, data=data,
        headers={"Authorization": "Bearer " + bearer,
                 "Content-Type": "application/json",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Não imprimir resposta: pode incluir detalhes de projeto.
        raise RuntimeError(f"Firebase Management API HTTP {exc.code}") from exc


def list_android_apps(bearer):
    all_apps = []
    cursor = ""
    while True:
        params = {"pageSize": 100}
        if cursor:
            params["pageToken"] = cursor
        path = (f"/projects/{PROJECT}/androidApps?"
                + urllib.parse.urlencode(params))
        result = google("GET", path, bearer)
        all_apps.extend(result.get("apps") or [])
        cursor = result.get("nextPageToken", "")
        if not cursor:
            return all_apps


def wait_for_app(operation, bearer):
    if operation.get("done"):
        if operation.get("error"):
            raise RuntimeError("Cadastro Firebase falhou.")
        return operation.get("response", {})
    name = operation.get("name", "")
    # Firebase Management Operations v1beta1 returns names as
    # "operations/<id>" (and some Google APIs use
    # "projects/<project>/operations/<id>"). Both are documented LRO forms.
    if not isinstance(name, str) or not re.fullmatch(
        r"(?:operations|projects/[a-z0-9-]+/operations)/[a-zA-Z0-9_-]+",
        name,
    ):
        raise RuntimeError("Firebase retornou operação não reconhecida.")
    for _ in range(30):
        time.sleep(3)
        result = google("GET", "/" + name, bearer)
        if result.get("done"):
            if result.get("error"):
                raise RuntimeError("Cadastro Firebase falhou.")
            return result.get("response", {})
    raise RuntimeError("Cadastro Firebase ainda em execução; tente mais tarde.")


def register(org_id, android_package, display_name, bearer):
    if not re.fullmatch(r"[0-9a-f-]{36}", org_id):
        raise ValueError("Identificador da organização inválido.")
    expected = "br.com.nethanel.elo.c" + org_id.replace("-", "")
    if android_package != expected:
        raise ValueError("Pacote Android não pertence à organização.")
    apps = list_android_apps(bearer)
    existing = next((a for a in apps if a.get("packageName") == expected), None)
    if existing:
        app = existing
    else:
        if len(apps) >= MAX_APPS_PER_PROJECT:
            raise RuntimeError(
                "Firebase próximo ao limite de apps por projeto. "
                "É necessário provisionar outro projeto antes de atender novas igrejas.")
        result = google(
            "POST", f"/projects/{PROJECT}/androidApps", bearer,
            {"displayName": display_name[:100], "packageName": expected})
        app = wait_for_app(result, bearer)
        print("Novo app Android criado no Firebase.")

    app_id = app.get("appId")
    if not app_id or not re.fullmatch(r"1:[0-9]+:android:[A-Za-z0-9]+", app_id):
        raise RuntimeError("Firebase não retornou App ID válido.")

    record = {
        "organization_id": org_id,
        "firebase_project_id": PROJECT,
        "firebase_app_id": app_id,
        "android_package": expected,
        "firebase_registration_source": "management_api",
    }
    # Nunca atualizar associação FCM validada ao reexecutar.
    url = ("/rest/v1/church_firebase_android_apps?on_conflict=organization_id")
    payload = json.dumps(record).encode("utf-8")
    # POST on_conflict é idempotente, mas omite fcm_verified do corpo para preservá-lo.
    from elo_app_factory import BASE_URL, headers
    h = headers()
    h["Prefer"] = "resolution=merge-duplicates,return=representation"
    req = urllib.request.Request(BASE_URL + url, data=payload, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        saved = json.load(response)
    if len(saved) != 1:
        raise RuntimeError("Registro Firebase não salvo no Elo.")
    print("Vinculação Firebase Android concluída para a igreja.")


def main():
    # Apenas solicitações que passaram pelo request_church_apk (plano e admin).
    queued = request(
        "GET",
        "/rest/v1/church_apk_builds?status=eq.queued"
        "&order=created_at.asc&limit=25"
        "&select=id,organization_id,android_package,branded_push,snapshot")
    if not queued:
        print("Nenhum APK aguardando Firebase.")
        return
    existing = request("GET",
        "/rest/v1/church_firebase_android_apps"
        "?select=organization_id,android_package")
    already = {r["organization_id"]: r["android_package"] for r in existing}
    pending = []
    for item in queued:
        if not item.get("branded_push"):
            continue
        org = item["organization_id"]
        if already.get(org) == item["android_package"]:
            continue
        pending.append(item)
    if not pending:
        print("Cadastros Firebase de solicitações em fila já encontrados.")
        return
    bearer = access_token()
    if not bearer:
        print("Pendente: configurar Secret ELO_FIREBASE_MANAGEMENT_SA_JSON.")
        print("Nenhum aplicativo foi criado; a fila continuará aguardando.")
        return
    # Trabalhar com uma solicitação por execução para limitar quotas e custos.
    item = pending[0]
    name = item["snapshot"].get("church_name") or item["snapshot"]["app_name"]
    register(item["organization_id"], item["android_package"], name, bearer)


if __name__ == "__main__":
    main()
