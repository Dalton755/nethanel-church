#!/usr/bin/env python3
"""Testes puros do provisionamento OAuth; sem rede, sem credenciais."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import elo_auth_redirects as factory
import elo_app_factory as builds

ORG = "101212c5-6e81-4915-ae9a-fbde5b42bb04"
SCHEME = "elo" + ORG.replace("-", "")[:20]
PACKAGE = "br.com.nethanel.elo.c" + ORG.replace("-", "")
BUILD = {"id": "build-id", "organization_id": ORG,
         "android_package": PACKAGE, "app_scheme": SCHEME}
CALLBACKS = [f"{SCHEME}://auth/{name}"
             for name in ("callback", "confirm", "invite")]


class RedirectFactoryTests(unittest.TestCase):
    def test_three_tenant_specific_urls(self):
        self.assertEqual(factory.redirects_for(BUILD), CALLBACKS)
        self.assertNotIn("nethanelelo://auth/callback", CALLBACKS)

    def test_reject_mismatched_tenant_scheme_and_package(self):
        for field, value in (
            ("app_scheme", "nethanelelo"),
            ("app_scheme", "elo" + "0" * 20),
            ("android_package", "br.com.nethanel.church"),
        ):
            with self.subTest(field=field):
                bad = {**BUILD, field: value}
                with self.assertRaises(ValueError):
                    factory.redirects_for(bad)

    def test_no_management_token_no_write_or_approval(self):
        with patch.dict(os.environ, {"ELO_SUPABASE_MANAGEMENT_TOKEN": ""}):
            with patch.object(factory, "management_request") as http:
                self.assertEqual(factory.verify_and_register([BUILD]), [])
                http.assert_not_called()

    def test_append_preserves_existing_urls_and_only_patches_allowlist(self):
        previous = "nethanelchurch://**,nethanelelo://**,https://nethanel-church.vercel.app/**"
        responses = [
            {"uri_allow_list": previous, "site_url": "https://nethanel-church.vercel.app"},
            {"uri_allow_list": previous + "," + ",".join(CALLBACKS)},
        ]
        actions = []
        def fake_api(method, body=None):
            actions.append((method, body))
            return responses.pop(0) if method == "GET" else {"ok": True}
        with patch.dict(os.environ, {"ELO_SUPABASE_MANAGEMENT_TOKEN": "test"}):
            with patch.object(factory, "management_request", side_effect=fake_api):
                self.assertEqual(factory.verify_and_register([BUILD]), ["build-id"])
        self.assertEqual([a[0] for a in actions], ["GET", "PATCH", "GET"])
        self.assertEqual(list(actions[1][1].keys()), ["uri_allow_list"])
        self.assertTrue(actions[1][1]["uri_allow_list"].startswith(previous + ","))
        for callback in CALLBACKS:
            self.assertIn(callback, actions[1][1]["uri_allow_list"])

    def test_idempotent_if_urls_already_present(self):
        existing = "nethanelelo://**," + ",".join(CALLBACKS)
        with patch.dict(os.environ, {"ELO_SUPABASE_MANAGEMENT_TOKEN": "test"}):
            with patch.object(factory, "management_request",
                              side_effect=[{"uri_allow_list": existing},
                                           {"uri_allow_list": existing}]) as fake:
                self.assertEqual(factory.verify_and_register([BUILD]), ["build-id"])
                self.assertEqual(fake.call_count, 2)
                self.assertTrue(all(c.args[0] == "GET" for c in fake.call_args_list))

    def test_require_full_callback_set_after_save(self):
        with patch.dict(os.environ, {"ELO_SUPABASE_MANAGEMENT_TOKEN": "test"}):
            with patch.object(factory, "management_request",
                              side_effect=[{"uri_allow_list": "nethanelelo://**"},
                                           {"ok": True},
                                           {"uri_allow_list": "nethanelelo://**"}]):
                self.assertEqual(factory.verify_and_register([BUILD]), [])

    def test_fail_if_existing_url_disappears_after_patch(self):
        with patch.dict(os.environ, {"ELO_SUPABASE_MANAGEMENT_TOKEN": "test"}):
            with patch.object(factory, "management_request",
                              side_effect=[{"uri_allow_list": "nethanelelo://**"},
                                           {"ok": True},
                                           {"uri_allow_list": ",".join(CALLBACKS)}]):
                with self.assertRaisesRegex(RuntimeError, "preexistentes"):
                    factory.verify_and_register([BUILD])

    def test_only_builds_with_verified_oauth_links(self):
        base = {"id": "build-id", "organization_id": ORG,
                "android_package": PACKAGE, "branded_push": False}
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "verified.json"
            path.write_text("[]", encoding="utf-8")
            with patch.dict(os.environ, {"ELO_REQUIRE_OAUTH_URLS": "true"}):
                with patch.object(factory, "READY_FILE", path):
                    with patch.object(builds, "request", return_value=[base]):
                        with patch.object(builds, "validate_claim") as validate:
                            builds.claim()
                            validate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
