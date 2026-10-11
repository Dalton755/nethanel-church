#!/usr/bin/env python3
"""Elo Factory - associação segura de credencial FCM V1 do Expo por igreja.

Somente GitHub Actions protegido; usa EXPO_TOKEN do repositorio.
Reutiliza a chave JA salva no Expo e nunca solicita/retorna a chave privada.
API GraphQL utilizada internamente pelo EAS CLI: sujeita a mudancas no Expo.
Se o schema for incompatível, falha fechado (não desabilita outro app).
"""
import json
import os
import re
from pathlib import Path
import urllib.error
import urllib.request

from elo_app_factory import request, validate_claim

EXPO_URL = "https://api.expo.dev/graphql"
EXPO_PROJECT_ID = "d35d3c12-a2b2-4e2e-af58-d2dcb512e9e2"
EXPO_ACCOUNT = "dalton_silva"
FIREBASE_PROJECT_ID = "nethanel-elo"
READY_FILE = Path("/tmp/elo-app-factory-expo-fcm-ready.json")

QUERY = """
query EloExpoFcmDetails($appId: String!) {
  account {
    byName(accountName: "dalton_silva") {
      name
      googleServiceAccountKeys {
        id
        projectIdentifier
      }
    }
  }
  app {
    byId(appId: $appId) {
      id
      androidAppCredentials {
        id
        applicationIdentifier
        googleServiceAccountKeyForFcmV1 { id projectIdentifier }
      }
    }
  }
}
"""

LINK_MUTATION = """
mutation EloAttachExistingFcm($credentialsId: ID!, $keyId: ID!) {
  androidAppCredentials {
    setGoogleServiceAccountKeyForFcmV1(
      id: $credentialsId
      googleServiceAccountKeyId: $keyId
    ) {
      id
      applicationIdentifier
      googleServiceAccountKeyForFcmV1 { id projectIdentifier }
    }
  }
}
"""

CREATE_MUTATION = """
mutation EloCreateAppFcm($appId: ID!, $package: String!, $keyId: ID!) {
  androidAppCredentials {
    createAndroidAppCredentials(
      appId: $appId
      applicationIdentifier: $package
      androidAppCredentialsInput: { googleServiceAccountKeyForFcmV1Id: $keyId }
    ) {
      id
      applicationIdentifier
      googleServiceAccountKeyForFcmV1 { id projectIdentifier }
    }
  }
}
"""


def expo_graphql(query, variables):
    token = os.environ.get("EXPO_TOKEN", "").strip()
    if not token:
        raise RuntimeError("GitHub Secret EXPO_TOKEN nao encontrado.")
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        EXPO_URL,
        method="POST", data=payload,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "eas-cli/24.8.0 (Elo App Factory)",
            "expo-platform": "node",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            output = json.load(resp)
    except urllib.error.HTTPError as exc:
        # Nunca imprimir resposta/headers do provedor ou segredo.
        raise RuntimeError(f"Expo GraphQL HTTP {exc.code}.") from exc
    if output.get("errors"):
        # Nao imprimir corpo de erros que possa conter metadados privados.
        raise RuntimeError("Expo GraphQL recusou a operacao; verificar schema/permissoes.")
    if not isinstance(output.get("data"), dict):
        raise RuntimeError("Resposta Expo GraphQL malformada.")
    return output["data"]


def current_credentials():
    data = expo_graphql(QUERY, {"appId": EXPO_PROJECT_ID})
    project = (data.get("app") or {}).get("byId")
    account = (data.get("account") or {}).get("byName")
    if not isinstance(project, dict) or project.get("id") != EXPO_PROJECT_ID:
        raise RuntimeError("Conta Expo nao encontrou o projeto Elo esperado.")
    if not isinstance(account, dict) or account.get("name") != EXPO_ACCOUNT:
        raise RuntimeError("A conta Expo nao corresponde ao proprietario Elo.")
    candidates = [
        entry["id"] for entry in account.get("googleServiceAccountKeys", [])
        if entry.get("projectIdentifier") == FIREBASE_PROJECT_ID and entry.get("id")
    ]
    if len(candidates) != 1:
        raise RuntimeError(
            "Precisa existir exatamente uma chave FCM do projeto nethanel-elo "
            "salva na conta Expo."
        )
    return candidates[0], project.get("androidAppCredentials") or []


def validated_package(item):
    # Nada é associado a credenciais Android alheias ao Elo.
    org_id = item["organization_id"]
    package = item["android_package"]
    if not re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",org_id):
        raise ValueError("Organizacao invalida.")
    expected = "br.com.nethanel.elo.c" + org_id.replace("-", "")
    if expected != package:
        raise ValueError("Pacote Android diverge da igreja autenticada.")
    return package


def ensure_app_fcm(item, *, allow_create=False):
    package = validated_package(item)
    key_id, rows = current_credentials()
    matches = [c for c in rows if c.get("applicationIdentifier") == package]
    if len(matches) > 1:
        raise RuntimeError("Credenciais Expo duplicadas para pacote Android.")
    existing = matches[0] if matches else None

    if existing is None:
        if not allow_create:
            raise RuntimeError("Identificador Android ainda nao existe na conta Expo.")
        out = expo_graphql(CREATE_MUTATION, {
            "appId": EXPO_PROJECT_ID,
            "package": package,
            "keyId": key_id,
        })
        updated = (out.get("androidAppCredentials") or {}).get("createAndroidAppCredentials")
        print("Credencial Android Expo criada para a igreja.")
    else:
        attached = existing.get("googleServiceAccountKeyForFcmV1")
        if attached and attached.get("id") == key_id and attached.get("projectIdentifier") == FIREBASE_PROJECT_ID:
            print("Expo FCM V1 ja esta associado para o aplicativo.")
            return "already_linked"
        if attached:
            raise RuntimeError("Expo ja possui outra chave FCM; alteracao automatica bloqueada.")
        out = expo_graphql(LINK_MUTATION, {
            "credentialsId": existing["id"],
            "keyId": key_id,
        })
        updated = (out.get("androidAppCredentials") or {}).get("setGoogleServiceAccountKeyForFcmV1")
        print("Chave FCM V1 existente associada ao Android da igreja.")

    if not isinstance(updated, dict) or updated.get("applicationIdentifier") != package:
        raise RuntimeError("Expo nao confirmou a identidade do aplicativo atualizado.")
    saved = updated.get("googleServiceAccountKeyForFcmV1")
    if not saved or saved.get("id") != key_id or saved.get("projectIdentifier") != FIREBASE_PROJECT_ID:
        raise RuntimeError("Expo nao confirmou a chave FCM esperada.")

    _, after = current_credentials()
    verified = [
        c for c in after if c.get("applicationIdentifier") == package
        and (c.get("googleServiceAccountKeyForFcmV1") or {}).get("id") == key_id
    ]
    if len(verified) != 1:
        raise RuntimeError("A verificacao do Expo apos a associacao nao foi concluida.")
    return "linked"


def main():
    # A cada execucao, o arquivo com aprovados comeca vazio.
    # Nunca reutilizar aprovacao de outro job/igreja.
    READY_FILE.write_text("[]", encoding="utf-8")
    queued = request(
        "GET",
        "/rest/v1/church_apk_builds?status=eq.queued&branded_push=eq.true"
        "&order=created_at.asc&limit=25&select=*"
    )
    if not queued:
        print("Nao ha novos APKs aguardando associacao FCM no Expo.")
        return

    verified = []
    for record in queued:
        # Restringe os pedidos aos que ja passaram pelo fluxo autorizado
        # e impede vincular credencial Expo a package de outra igreja.
        validate_claim(record)
        status = ensure_app_fcm(
            record,
            allow_create=os.environ.get("ELO_EXPO_ALLOW_CREATE_CREDENTIALS") == "true"
        )
        if status not in ("linked","already_linked"):
            raise RuntimeError("Expo nao confirmou a associacao da FCM.")
        verified.append(record["id"])
        # Trabalhar com uma solicitacao por execucao.
        break
    READY_FILE.write_text(json.dumps(verified), encoding="utf-8")
    print("Expo FCM pronto para 1 compilacao exclusiva.")


if __name__ == "__main__":
    main()
