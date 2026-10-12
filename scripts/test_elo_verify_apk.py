"""Testes offline para impedir regressao em identidade/versionCode do APK Elo."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import elo_verify_apk as apk


class ApkVerificationTests(unittest.TestCase):
    def test_extracts_real_manifest_and_certificate(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "church.apk"
            file.write_bytes(b"PK fake test only")
            manifest = "package: name='br.com.nethanel.elo.c" + "a"*32 + "' versionCode='2' versionName='1.0.1'"
            cert = ("V2 Signer: SHA-256 digest: " + "fa"*32 + "\n"
                    + "V3 Signer #1 certificate SHA-256 digest: " + "fa"*32)
            with patch.object(apk, "sdk_tool", side_effect=lambda name: name), patch.object(
                apk.subprocess, "run",
                side_effect=[SimpleNamespace(stdout=manifest), SimpleNamespace(stdout=cert)]
            ):
                identity = apk.inspect_apk(file)
            self.assertEqual(identity["version_code"], 2)
            self.assertEqual(identity["version_name"], "1.0.1")
            self.assertEqual(identity["signing_certificate_sha256"], "fa"*32)

    def test_rejects_multiple_signers(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "church.apk"
            file.write_bytes(b"PK")
            manifest = "package: name='br.com.nethanel.elo.c" + "a"*32 + "' versionCode='3' versionName='1.0.2'"
            cert = ("Signer #1 certificate SHA-256 digest: " + "fa"*32 + "\n"
                    + "Signer #2 certificate SHA-256 digest: " + "bc"*32)
            with patch.object(apk, "sdk_tool", side_effect=lambda name: name), patch.object(
                apk.subprocess, "run",
                side_effect=[SimpleNamespace(stdout=manifest), SimpleNamespace(stdout=cert)]
            ):
                with self.assertRaisesRegex(RuntimeError, "exatamente um"):
                    apk.inspect_apk(file)

    def test_blocks_signature_change_to_existing_church(self):
        church = "e"*8 + "-" + "e"*4 + "-" + "e"*4 + "-" + "e"*4 + "-" + "e"*12
        identity = {
            "android_package": "br.com.nethanel.elo.c" + "e"*32,
            "app_scheme": "elo" + "e"*20,
            "signing_certificate_sha256": "aa"*32,
            "last_verified_version_code": 2,
        }
        record = {"id": "b"*36, "organization_id": church,
                  "android_package": identity["android_package"],
                  "app_scheme": identity["app_scheme"],
                  "status": "building"}
        verified = dict(android_package=identity["android_package"], version_code=3,
                        version_name="1.0.2", signing_certificate_sha256="bb"*32,
                        apk_sha256="bb"*32)
        with tempfile.TemporaryDirectory() as tmp:
            claim = Path(tmp) / "claim.json"
            claim.write_text(json.dumps(record))
            with patch.object(apk, "CLAIM_FILE", claim), patch.object(
                apk, "inspect_apk", return_value=verified
            ), patch.object(
                apk, "request", return_value=[identity]
            ), patch.object(
                apk, "previously_delivered", return_value=None
            ):
                with self.assertRaisesRegex(RuntimeError, "assinatura"):
                    apk.verify()


if __name__ == "__main__":
    unittest.main()
