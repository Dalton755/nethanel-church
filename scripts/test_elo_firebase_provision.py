#!/usr/bin/env python3
"""Regression checks for Elo App Factory Firebase provisioning.

Pure mocked tests: never use real Google/Supabase credentials or create apps.
"""
import io
import json
import os
import unittest
from unittest.mock import patch

import elo_firebase_provision as factory
import elo_app_factory as elo


ORG = "dfe3dfb7-37be-4120-a46a-8f010beaabc3"
PACKAGE = "br.com.nethanel.elo.c" + ORG.replace("-", "")
FIREBASE_APP_ID = "1:832888889753:android:2b094a12659524500af308"


class FactoryTests(unittest.TestCase):
    def test_skip_if_no_queue(self):
        with patch.object(factory, "request", return_value=[]):
            with patch.object(factory, "access_token") as token:
                factory.main()
                token.assert_not_called()

    def test_wait_without_management_credential(self):
        queue = [{
            "id": "abc", "organization_id": ORG,
            "android_package": PACKAGE, "branded_push": True,
            "snapshot": {"app_name": "Adoradores Church"},
        }]
        with patch.object(factory, "request", side_effect=[queue, []]):
            with patch.object(factory, "access_token", return_value=None):
                with patch.object(factory, "register") as register:
                    factory.main()
                    register.assert_not_called()

    def test_reuse_existing_android_registration(self):
        existing = [{
            "packageName": PACKAGE,
            "appId": FIREBASE_APP_ID,
        }]
        fake = io.BytesIO(b'[{"organization_id": "' + ORG.encode() + b'"}]')
        with patch.object(factory, "list_android_apps", return_value=existing):
            with patch.object(factory, "google") as google:
                with patch.object(factory.urllib.request, "urlopen", return_value=fake):
                    with patch.object(elo, "headers", return_value={"apikey":"test","Authorization":"Bearer test"}):
                        factory.register(ORG, PACKAGE, "Adoradores Church", "oauth-fake")
                        google.assert_not_called()

    def test_reject_wrong_tenant_package(self):
        with self.assertRaisesRegex(ValueError, "não pertence"):
            factory.register(ORG, "br.com.nethanel.elo.cwrong", "Teste", "oauth-fake")

    def test_no_duplicate_app_creation(self):
        queue = [{
            "organization_id": ORG, "android_package": PACKAGE,
            "branded_push": True, "snapshot": {"app_name": "Adoradores"},
        }]
        registry = [{"organization_id": ORG, "android_package": PACKAGE}]
        with patch.object(factory, "request", side_effect=[queue, registry]):
            with patch.object(factory, "access_token") as token:
                factory.main()
                token.assert_not_called()

    def test_safety_limit_at_project_capacity(self):
        existing = [
            {"packageName": "other." + str(i), "appId": FIREBASE_APP_ID}
            for i in range(factory.MAX_APPS_PER_PROJECT)
        ]
        with patch.object(factory, "list_android_apps", return_value=existing):
            with self.assertRaisesRegex(RuntimeError, "limite"):
                factory.register(ORG, PACKAGE, "Adoradores", "oauth-fake")

    def test_claim_does_not_build_unregistered_push_app(self):
        record = {"id": "test", "organization_id": ORG,
                  "branded_push": True, "android_package": PACKAGE}
        with patch.object(elo, "request", side_effect=[[record], []]):
            with patch.object(elo, "validate_claim") as validate:
                elo.claim()
                validate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
