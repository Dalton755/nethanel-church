#!/usr/bin/env python3
"""Testes sem efeitos externos do vínculo Expo FCM para APKs por igreja."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import elo_expo_fcm as fcm
import elo_app_factory as factory

ORG = "101212c5-6e81-4915-ae9a-fbde5b42bb04"
PKG = "br.com.nethanel.elo.c" + ORG.replace("-", "")
BUILD = {"id":"demo-id", "organization_id":ORG, "android_package":PKG, "branded_push":True}
KEY = "expo-key-id"
GOOD = {"id":"android-app-credentials","applicationIdentifier":PKG,
        "googleServiceAccountKeyForFcmV1":{"id":KEY,"projectIdentifier":"nethanel-elo"}}
NO_KEY = {**GOOD,"googleServiceAccountKeyForFcmV1":None}


class ExpoFcmTests(unittest.TestCase):
    def test_reject_tenant_confusion(self):
        with self.assertRaisesRegex(ValueError,"diverge"):
            fcm.validated_package({**BUILD,"android_package":"br.com.nethanel.elo.c"+"0"*32})

    def test_fail_if_wrong_expo_project(self):
        with patch.object(fcm,"expo_graphql",return_value={
            "app":{"byId":{"id":"not-expo-project"}},
            "account":{"byName":{"name":"dalton_silva","googleServiceAccountKeys":[]}}
        }):
            with self.assertRaisesRegex(RuntimeError,"esperado"):
                fcm.current_credentials()

    def test_cannot_choose_ambiguous_saved_keys(self):
        fake={
          "app":{"byId":{"id":fcm.EXPO_PROJECT_ID,"androidAppCredentials":[]}},
          "account":{"byName":{"name":fcm.EXPO_ACCOUNT,"googleServiceAccountKeys":[
            {"id":"a","projectIdentifier":fcm.FIREBASE_PROJECT_ID},
            {"id":"b","projectIdentifier":fcm.FIREBASE_PROJECT_ID}
          ]}}
        }
        with patch.object(fcm,"expo_graphql",return_value=fake):
            with self.assertRaisesRegex(RuntimeError,"exatamente uma"):
                fcm.current_credentials()

    def test_existing_association_is_idempotent(self):
        with patch.object(fcm,"current_credentials",return_value=(KEY,[GOOD])):
            with patch.object(fcm,"expo_graphql") as mutate:
                self.assertEqual(fcm.ensure_app_fcm(BUILD),"already_linked")
                mutate.assert_not_called()

    def test_never_overwrite_other_fcm_key(self):
        different={**GOOD,"googleServiceAccountKeyForFcmV1":{
            "id":"other","projectIdentifier":"other-project"
        }}
        with patch.object(fcm,"current_credentials",return_value=(KEY,[different])):
            with patch.object(fcm,"expo_graphql") as mutate:
                with self.assertRaisesRegex(RuntimeError,"outra chave"):
                    fcm.ensure_app_fcm(BUILD)
                mutate.assert_not_called()

    def test_link_existing_missing_key_and_verify(self):
        output={"androidAppCredentials":{"setGoogleServiceAccountKeyForFcmV1":GOOD}}
        with patch.object(fcm,"current_credentials",side_effect=[
            (KEY,[NO_KEY]),(KEY,[GOOD])]):
            with patch.object(fcm,"expo_graphql",return_value=output) as mutation:
                self.assertEqual(fcm.ensure_app_fcm(BUILD),"linked")
                args=mutation.call_args.args
                self.assertIn("setGoogleServiceAccountKeyForFcmV1",args[0])
                self.assertEqual(args[1],{
                    "credentialsId":GOOD["id"],"keyId":KEY
                })

    def test_creation_flag_is_required(self):
        with patch.object(fcm,"current_credentials",return_value=(KEY,[])):
            with patch.object(fcm,"expo_graphql") as mutation:
                with self.assertRaisesRegex(RuntimeError,"ainda nao existe"):
                    fcm.ensure_app_fcm(BUILD)
                mutation.assert_not_called()

    def test_create_key_link_can_be_flagged_for_future(self):
        result={"androidAppCredentials":{"createAndroidAppCredentials":GOOD}}
        with patch.object(fcm,"current_credentials",side_effect=[
            (KEY,[]),(KEY,[GOOD])]):
            with patch.object(fcm,"expo_graphql",return_value=result) as mutation:
                self.assertEqual(fcm.ensure_app_fcm(BUILD,allow_create=True),"linked")
                self.assertIn("createAndroidAppCredentials",mutation.call_args.args[0])

    def test_no_queued_apps_does_not_call_expo(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"approval.json"
            with patch.object(fcm,"READY_FILE",path):
                with patch.object(fcm,"request",return_value=[]):
                    with patch.object(fcm,"expo_graphql") as graphql:
                        fcm.main()
                        self.assertEqual(json.loads(path.read_text()),[])
                        graphql.assert_not_called()

    def test_missing_fcm_approval_prevents_build_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"approval.json"
            path.write_text("[]")
            with patch.dict(os.environ,{"ELO_REQUIRE_EXPO_FCM":"true","ELO_REQUIRE_OAUTH_URLS":"false"}):
                with patch.object(fcm,"READY_FILE",path):
                    with patch.object(factory,"request",side_effect=[
                        [BUILD], [{"organization_id":ORG,"android_package":PKG}]
                    ]):
                        with patch.object(factory,"validate_claim") as validate:
                            factory.claim()
                            validate.assert_not_called()


if __name__=="__main__":
    unittest.main()
