#!/usr/bin/env python3
"""Previa isolada do Elo principal: verifica se o APK pode ser instalado sem apagar o app.

A comparacao usa APKs historicos assinados de builds genericos bem sucedidos.
Nunca acessa nem altera Supabase, Vercel, builds de igrejas ou keystores.
"""
import json
import os
import sys
from pathlib import Path

from elo_verify_apk import inspect_apk

APK_FOLDER = Path("/tmp/elo-generic-historic")
RESULT = Path("/tmp/elo-generic-preview-identity.json")
CANDIDATE = Path("apps/mobile/nethanel-elo-platform-preview.apk")
PACKAGE = "br.com.nethanel.church"

def historic():
    paths = [APK_FOLDER / name / "nethanel-elo-generic.apk"
             for name in ("latest", "previous", "earliest")]
    return [inspect_apk(p) for p in paths]


def prepare():
    if not os.environ.get("GITHUB_ENV"):
        raise RuntimeError("Somente o workflow GitHub de previa pode preparar o APK.")
    previous = historic()
    packages = {record["android_package"] for record in previous}
    certificates = {record["signing_certificate_sha256"] for record in previous}
    if packages != {PACKAGE}:
        raise RuntimeError("Bloqueio: APK generico historico possui applicationId divergente.")
    if len(certificates) != 1:
        raise RuntimeError(
            "Bloqueio: APKs anteriores possuem assinaturas diferentes. "
            "Nao distribuir; precisamos identificar qual esta instalado no celular."
        )
    next_code = max(item["version_code"] for item in previous) + 1
    name = "1.1.0"
    RESULT.write_text(json.dumps({
        "historical": previous,
        "next_code": next_code,
        "next_name": name,
    }), encoding="utf-8")
    with Path(os.environ["GITHUB_ENV"]).open("a", encoding="utf-8") as env:
        env.write(f"ELO_GENERIC_PREVIEW_VERSION_CODE={next_code}\n")
        env.write(f"ELO_GENERIC_PREVIEW_VERSION_NAME={name}\n")
    print("Elo principal: pacote original preservado.")
    print("Assinatura consistente em 3 APKs anteriores.")
    print("Codigo Android anterior mais recente: ", max(item["version_code"] for item in previous))
    print("Codigo Android novo para instalar por cima: ", next_code)


def verify():
    baseline = json.loads(RESULT.read_text(encoding="utf-8"))
    built = inspect_apk(CANDIDATE)
    expected = baseline["historical"][0]["signing_certificate_sha256"]
    assert built["android_package"] == PACKAGE, "ApplicationId alterado"
    assert built["signing_certificate_sha256"] == expected, "Assinatura Android alterada"
    assert built["version_code"] == baseline["next_code"], "Codigo de versao nao cresceu"
    assert built["version_name"] == baseline["next_name"], "VersionName inesperada"
    for historic_apk in baseline["historical"]:
        assert built["version_code"] > historic_apk["version_code"], "APK mais antigo"
    print("PREVIA PRINCIPAL VERIFICADA: mesmo app, mesma assinatura, nova versao.")
    print("SEM DEPLOY em producao, SEM PUBLICACAO e SEM MUDANCA em outros APKs.")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("prepare", "verify"):
        raise SystemExit("Uso: elo_verify_generic_preview.py prepare|verify")
    {"prepare": prepare, "verify": verify}[sys.argv[1]]()
