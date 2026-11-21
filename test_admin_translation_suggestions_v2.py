"""Isolated WSGI and provider-contract checks for opt-in translation suggestions.

Never contacts an external API or production database; generated output is mocked.
"""
import hashlib
import json
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations
import app_translation_suggestions_v2 as suggestions

app = test_app.app
FLAG = {
    "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1",
    "MILE_APP_TRANSLATIONS_ENABLED": "0",
    "MILE_TRANSLATION_SUGGESTIONS_ENABLED": "1",
    "MILE_TRANSLATION_SUGGESTION_API_KEY": "test-only-not-real",
    "MILE_TRANSLATION_SPEND_CONTROLS_CONFIRMED": "1",
    "MILE_TRANSLATION_SUGGESTION_PROJECT_ID": "proj_test12345678",
}


class TranslationSuggestionTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        original_role=app.SITE_ROLE
        app.SITE_ROLE="admin"
        self.addCleanup(setattr,app,"SITE_ROLE",original_role)
        with app.connect() as c:
            c.execute("""INSERT INTO v2_food_library
                (id,source_key,base_name,display_name,category,notes,variant,
                 edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at)
                 VALUES ('food-test',NULL,'Arroz','Arroz branco','Cereais',
                  'Nota interna NÃO traduzível','plain',1,130,2.7,28.2,0.3,1,1,1)""")
            c.execute("""INSERT INTO v2_dish_library
                (id,category,name_pt,name_en,image_filename,active)
                VALUES ('dish-test','Carne','Frango com arroz','Chicken and rice',
                        'dish-placeholder',1)""")
            c.execute("""INSERT INTO v2_supplement_library
                (id,name,dose,moment,rule,note,timing_text,prescriptions_json)
                VALUES ('supp-test','Creatina','5 g','lunch','daily','Tomar com água',
                        'Após o almoço','[{"dose":"5 g","note":"Atenção clínica"}]')""")
            translations.initialize(c)
            suggestions.initialize_quota_schema(c)
            c.commit()

    def payload(self, kind="food", ident="food-test", field="display_name", source=None):
        if source is None:
            source = self.admin.request(
                "/api/v2/admin/i18n?entity_kind="+kind+
                "&entity_id="+ident+"&field_path="+field)["body"]["source_hash"]
        return {"entity_kind":kind,"entity_id":ident,"field_path":field,
                "language":"en","expected_source_hash":source}

    def suggest_request(self,path,method="POST",body=None,csrf=True,origin="https://admin.themile.pt"):
        return self.admin.request(path,method,body,csrf=csrf,origin=origin)

    def test_feature_off_by_default_and_missing_credentials(self):
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"1",
                                     "MILE_TRANSLATION_SUGGESTIONS_ENABLED":"0",
                                     "MILE_TRANSLATION_SUGGESTION_API_KEY":""}):
            self.assertFalse(self.admin.request("/api/v2/admin/i18n/overview")["body"]["suggestions_enabled"])
            result=self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                                      self.payload(source="placeholder"))
            self.assertEqual(result["status"],404)
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"1",
                                     "MILE_TRANSLATION_SUGGESTIONS_ENABLED":"1",
                                     "MILE_TRANSLATION_SUGGESTION_API_KEY":""}):
            self.assertFalse(self.admin.request("/api/v2/admin/i18n/overview")["body"]["suggestions_enabled"])

    def test_preview_only_admin_only_csrf_and_no_writes(self):
        with patch.dict(os.environ, FLAG):
            self.assertTrue(self.admin.request("/api/v2/admin/i18n/overview")["body"]["suggestions_enabled"])
            body=self.payload()
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                                                body,csrf=False)["status"],403)
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                         body,origin="https://evil.example")["status"],403)
            self.assertEqual(test_app.Client().request(
                "/api/v2/admin/i18n/suggest","POST",body)["status"],401)
            with patch.object(suggestions,"_generate",return_value="White rice") as model:
                reply=self.suggest_request("/api/v2/admin/i18n/suggest","POST",body)
                self.assertEqual(reply["status"],200,reply)
                self.assertEqual(reply["body"]["suggestion"],"White rice")
                self.assertFalse(reply["body"]["saved"])
                model.assert_called_once_with("Arroz branco","food")
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations").fetchone()[0],0)
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translation_history").fetchone()[0],0)
                row=c.execute("SELECT display_name,notes,kcal FROM v2_food_library WHERE id='food-test'").fetchone()
                self.assertEqual(tuple(row),("Arroz branco","Nota interna NÃO traduzível",130.0))

    def test_existing_english_preferred_and_no_model_call(self):
        with patch.dict(os.environ, FLAG):
            body=self.payload("dish","dish-test","name_pt")
            with patch.object(suggestions,"_generate") as model:
                response=self.suggest_request("/api/v2/admin/i18n/suggest","POST",body)
                self.assertEqual(response["status"],200,response)
                self.assertEqual(response["body"]["suggestion"],"Chicken and rice")
                self.assertEqual(response["body"]["source"],"existing_english")
                model.assert_not_called()

    def test_stale_source_and_protected_notes_rejected(self):
        with patch.dict(os.environ, FLAG):
            wrong=self.payload(source=hashlib.sha256(b"wrong").hexdigest())
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",wrong)["status"],409)
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                self.payload(field="notes",source="wrong"))["status"],422)
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                self.payload(kind="supplement",ident="supp-test",field="prescriptions/0/note",
                             source="wrong"))["status"],422)
            self.assertEqual(self.suggest_request("/api/v2/admin/i18n/suggest","POST",
                self.payload(kind="supplement",ident="supp-test",field="timing_text",
                             source="wrong"))["status"],422)

    def test_existing_approved_translation_is_never_replaced(self):
        with patch.dict(os.environ, FLAG):
            body=self.payload()
            approved=self.admin.request("/api/v2/admin/i18n/propose","POST",
                {**body,"translated_text":"White rice"})
            self.assertEqual(approved["status"],201,approved)
            blocked=self.suggest_request("/api/v2/admin/i18n/suggest","POST",body)
            self.assertEqual(blocked["status"],409,blocked)
            with app.connect() as c:
                self.assertEqual(c.execute(
                    "SELECT status FROM v2_content_translations WHERE entity_kind='food'").fetchone()[0],"pending")

    def test_unavailable_provider_returns_safe_error(self):
        with patch.dict(os.environ, FLAG):
            with patch.object(suggestions,"_generate",
                              side_effect=suggestions.SuggestionError(503,"translation_suggestion_unavailable")):
                response=self.suggest_request("/api/v2/admin/i18n/suggest","POST",self.payload())
            self.assertEqual(response["status"],503)

    def test_external_provider_contract_no_persistence_and_numbers_unchanged(self):
        class FakeResponse:
            def __enter__(self):return self
            def __exit__(self,*args):return None
            def read(self,n):return json.dumps({"status":"completed","output":[
                {"type":"message","content":[{"type":"output_text","text":"100 g of rice"}]}]}).encode()
        class FakeOpener:
            def open(self,request,timeout):
                self.request=request;self.timeout=timeout
                return FakeResponse()
        fake=FakeOpener()
        with patch.dict(os.environ, FLAG),patch.object(suggestions.urllib.request,"build_opener",return_value=fake) as build:
            self.assertEqual(suggestions._generate("100 g de arroz","food"),"100 g of rice")
            request=fake.request
            outbound=json.loads(request.data.decode("utf-8"))
            self.assertEqual(outbound["store"],False)
            self.assertEqual(outbound["model"],suggestions.MODEL)
            self.assertEqual(dict(request.header_items())["Openai-project"],"proj_test12345678")
            self.assertTrue(any(isinstance(h,suggestions._DenyRedirect)
                                for h in build.call_args.args))
            self.assertNotIn("Nota interna",str(outbound))
            self.assertEqual(outbound["max_output_tokens"],350)
            self.assertEqual(fake.timeout,suggestions.TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
