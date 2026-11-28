"""Notification templates use the same canonical review and approval store."""
import hashlib
import sqlite3
import unittest

import content_translations_v2 as store
import app_translation_admin_v2 as review
import app_translation_sources_v2 as sources
from notification_templates_v2 import TEMPLATES, render_template


class NotificationCentralTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT, active INTEGER)")
        self.c.execute("INSERT INTO users VALUES('admin','admin',1)")
        self.actor={"id":"admin","role":"admin"}
        store.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def inspect(self,key,field):
        return review.inspect(self.c,self.actor,entity_kind="notification",entity_id=key,field_path=field)

    def propose(self,key,field,text):
        row=self.inspect(key,field)
        return review.propose(self.c,self.actor,dict(entity_kind="notification",entity_id=key,
            field_path=field,language="en",expected_source_hash=row["source_hash"],translated_text=text))

    def approve(self,key,field):
        row=self.inspect(key,field)
        return review.approve(self.c,self.actor,dict(entity_kind="notification",entity_id=key,
            field_path=field,language="en",expected_source_hash=row["source_hash"],
            expected_candidate_hash=row["candidate"]["candidate_hash"]))

    def test_canonical_source_and_review_candidates(self):
        rows=sources.rows_for(self.c,"notification")
        self.assertEqual(len(rows),len(TEMPLATES))
        for row in rows:
            fields=sources.fields_for("notification",row)
            self.assertEqual([f["field_path"] for f in fields],["title","body"])
            self.assertTrue(all(f["legacy_en"] for f in fields))
            self.assertEqual(sources.canonical_field(self.c,"notification",row["id"],"body"),row["body"])

    def test_english_requires_both_approved_fields(self):
        self.assertEqual(render_template("game","pt-PT"),TEMPLATES["game"]["pt-PT"])
        with self.assertRaisesRegex(ValueError,"requires_review"):
            render_template("game","en-GB",c=self.c)
        self.propose("game","title","Reviewed match questionnaire")
        self.approve("game","title")
        self.propose("game","body","Complete your last match questionnaire.")
        with self.assertRaisesRegex(ValueError,"requires_review"):
            render_template("game","en-GB",c=self.c)
        self.approve("game","body")
        self.assertEqual(render_template("game","en-GB",c=self.c),
                         ("Reviewed match questionnaire","Complete your last match questionnaire."))
        self.propose("game","title","Revised title")
        with self.assertRaisesRegex(ValueError,"requires_review"):
            render_template("game","en-GB",c=self.c)

    def test_stale_original_blocks_english(self):
        for field,text in zip(("title","body"),TEMPLATES["weight"]["en-GB"]):
            self.propose("weight",field,text)
            self.approve("weight",field)
        self.c.execute("UPDATE v2_content_translations SET source_hash=? WHERE entity_kind='notification' AND entity_id='weight' AND field_path='body'",
                       (hashlib.sha256(b"obsolete").hexdigest(),))
        with self.assertRaisesRegex(ValueError,"requires_review"):
            render_template("weight","en-GB",c=self.c)

    def test_birthday_placeholder_and_review_permissions(self):
        for text in ("Happy birthday!", "Happy birthday, {name}!", "{first_name} {first_name}", "{first_name.__class__}"):
            with self.assertRaisesRegex(ValueError,"invalid_notification_placeholder"):
                self.propose("birthday","title",text)
        self.propose("birthday","title","Happy birthday, {first_name}!")
        self.approve("birthday","title")
        self.propose("birthday","body","Have a wonderful day!")
        self.approve("birthday","body")
        self.assertEqual(render_template("birthday","en-GB",first_name="Alex",c=self.c),
                         ("Happy birthday, Alex!","Have a wonderful day!"))
        with self.assertRaises(PermissionError):
            review.inspect(self.c,{"id":"p","role":"player"},entity_kind="notification",entity_id="birthday",field_path="title")

    def test_edit_bilingual_template_uses_shared_store(self):
        from notification_store_v2 import initialize
        from notification_templates_v2 import editable_template, save_template
        initialize(self.c)
        old=editable_template(self.c,"game")
        data={"id":"game","revision":old["revision"],"pt":{"title":"Jogo","body":"Preenche o formulário."},
              "en":{"title":"Match","body":"Complete the questionnaire."}}
        saved=save_template(self.c,actor_id="admin",payload=data)
        self.assertEqual(render_template("game","pt-PT",c=self.c),("Jogo","Preenche o formulário."))
        self.assertEqual(render_template("game","en-GB",c=self.c),("Match","Complete the questionnaire."))
        self.assertEqual(sources.canonical_field(self.c,"notification","game","title"),"Jogo")
        self.assertNotEqual(old["revision"],saved["revision"])
        with self.assertRaisesRegex(ValueError,"template_changed"):
            save_template(self.c,actor_id="admin",payload=data)
        with self.assertRaises(PermissionError):
            save_template(self.c,actor_id="p",payload=data)

    def test_notification_limits(self):
        with self.assertRaisesRegex(ValueError,"invalid_notification_translation"):
            self.propose("game","title","X"*121)
        with self.assertRaisesRegex(ValueError,"invalid_notification_translation"):
            self.propose("game","body","X"*1001)


if __name__=="__main__":
    unittest.main()
