#!/usr/bin/env python3
"""Autoriza callbacks OAuth exclusivos dos APKs Elo no Supabase.

Uso exclusivo no GitHub Actions. O service_role da base NAO pode editar
as configuracoes do Auth; e necessario um token de Management API guardado em
GitHub Secret ELO_SUPABASE_MANAGEMENT_TOKEN.

Este processo so adiciona URLs derivadas do identificador de igreja validado.
Nao modifica Site URL, Google OAuth, segredos ou URLs anteriores.
"""
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

from elo_app_factory import PROJECT_REF, request

MANAGEMENT = "https://api.supabase.com"
READY_FILE = Path("/tmp/elo-app-factory-oauth-ready.json")
MAX_REDIRECTS = 250


def redirects_for(record):
    org_id = record["organization_id"]
    scheme = record["app_scheme"]
    if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", org_id):
        raise ValueError("ID da igreja invalido.")
    expected = "elo" + org_id.replace("-", "")[:20]
    if scheme != expected:
        raise ValueError("Esquema OAuth nao pertence a igreja.")
    if record["android_package"] != "br.com.nethanel.elo.c" + org_id.replace("-", ""):
        raise ValueError("Pacote Android nao pertence a igreja.")
    return [f"{scheme}://auth/{path}" for path in ("callback", "confirm", "invite")]


def management_request(method, body=None):
    token = os.environ.get("ELO_SUPABASE_MANAGEMENT_TOKEN", "").strip()
    if not token:
        return None
    url = f"{MANAGEMENT}/v1/projects/{PROJECT_REF}/config/auth"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, method=method, data=data,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        # Nao imprimir headers, corpo, token ou lista de URIs.
        raise RuntimeError(f"Supabase Management API HTTP {exc.code} em configuracao OAuth.") from exc


def parse_urls(value):
    if value is None or value == "":
        return []
    if isinstance(value, str):
        urls = [u.strip() for u in value.split(",") if u.strip()]
    elif isinstance(value, list) and all(isinstance(u, str) for u in value):
        urls = [u.strip() for u in value if u.strip()]
    else:
        raise RuntimeError("Formato de lista OAuth nao reconhecido.")
    # Elimina duplicados sem modificar URLs existentes.
    return list(dict.fromkeys(urls))


def verify_and_register(records):
    # Defesa em profundidade: nao consultar nem gravar config de Auth sem token.
    if not os.environ.get("ELO_SUPABASE_MANAGEMENT_TOKEN", "").strip():
        print("Pendente: configurar ELO_SUPABASE_MANAGEMENT_TOKEN no GitHub.")
        print("Nenhum APK sera compilado ate validar seus links de autenticacao.")
        return []

    config = management_request("GET")
    if not isinstance(config, dict) or "uri_allow_list" not in config:
        raise RuntimeError("Nao foi possivel consultar a lista de URLs OAuth do projeto.")

    before = parse_urls(config["uri_allow_list"])
    urls = list(before)
    target_by_id = {}

    for record in records:
        required = redirects_for(record)
        target_by_id[record["id"]] = required
        for url in required:
            if url not in urls:
                urls.append(url)

    if len(urls) > MAX_REDIRECTS:
        raise RuntimeError("Limite de URLs OAuth da fabrica alcancado; revisar arquitetura antes de continuar.")

    if urls != before:
        # Patch parcial: nunca tocar em site_url nem nos outros campos do Auth.
        management_request("PATCH", {"uri_allow_list": ",".join(urls)})
        print(f"Links OAuth de {len(records)} solicitação(ões) conferidos e sincronizados.")
    else:
        print("URLs OAuth ja cadastradas; nenhuma alteracao necessaria.")

    after_result = management_request("GET")
    if not isinstance(after_result, dict) or "uri_allow_list" not in after_result:
        raise RuntimeError("Falha na verificacao posterior do Auth.")
    after = parse_urls(after_result["uri_allow_list"])
    if not set(before).issubset(after):
        raise RuntimeError("URLs preexistentes foram alteradas por outra operacao; bloqueando build.")
    return [id_ for id_, required in target_by_id.items() if all(url in after for url in required)]


def main():
    # Sempre substituir o arquivo a cada execucao: sem herdar aprovacoes antigas.
    READY_FILE.write_text("[]", encoding="utf-8")
    queue = request(
        "GET", "/rest/v1/church_apk_builds?"
        "status=eq.queued&order=created_at.asc&limit=25"
        "&select=id,organization_id,android_package,app_scheme"
    )
    if not queue:
        print("Nenhum APK aguardando URLs OAuth.")
        return
    try:
        verified = verify_and_register(queue)
    except Exception:
        # Fail closed: nenhuma solicitacao aprovada no arquivo de execucao.
        READY_FILE.write_text("[]", encoding="utf-8")
        raise
    READY_FILE.write_text(json.dumps(verified), encoding="utf-8")
    print(f"URLs OAuth verificadas para {len(verified)} solicitacao(oes).")


if __name__ == "__main__":
    main()
