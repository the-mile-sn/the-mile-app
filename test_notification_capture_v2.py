"""Publication capture tests using synthetic SQLite data; no network."""
import os
import unittest
from unittest.mock import patch

import notification_capture_v2 as capture
from notification_admin_preview_v2 import preview
import test_notification_sources_v2 as fixtures


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.SourceTests()
        self.fixture.setUp()
        self.c=self.fixture.c
        self.now=self.fixture.now
        self.env=patch.dict(os.environ,{"MILE_NOTIFICATIONS_CAPTURE":"1"})
        self.clock=patch.object(capture.time,"time",return_value=self.now.timestamp())
        self.env.start()
        self.clock.start()

    def tearDown(self):
        self.clock.stop()
        self.env.stop()
        self.fixture.tearDown()

    def events(self):
        return [dict(r) for r in self.c.execute(
            "SELECT * FROM v2_notification_content_changes ORDER BY recipient_id,kind,target_id").fetchall()]

    def change(self,fn,write):
        previous=capture.before(self.c,fn)
        write()
        capture.after(self.c,previous,fn)

    def test_existing_document_noop_and_real_update(self):
        fn=lambda:capture.document(self.c,"d")
        self.change(fn,lambda:self.c.execute("UPDATE documents SET title=title WHERE id='d'"))
        self.assertEqual(self.events(),[])
        self.change(fn,lambda:self.c.execute("UPDATE documents SET title='Updated' WHERE id='d'"))
        rows=preview(self.c,authorised_athlete_ids=["a"],kind="document",now=self.now)["items"]
        self.assertEqual([(r["target_id"],r["change_kind"]) for r in rows],[("d","updated")])

    def test_draft_then_publish_and_edit_before_first_notification(self):
        fn=lambda:capture.assessment(self.c,"a","2026-11-22")
        self.change(fn,lambda:self.c.execute("UPDATE v2_body_assessments SET formula_note='draft edit' WHERE id='draft'"))
        self.assertEqual(self.events(),[])
        self.change(fn,lambda:self.c.execute("UPDATE v2_body_assessments SET status='published' WHERE id='draft'"))
        self.change(fn,lambda:self.c.execute("UPDATE v2_body_assessments SET formula_note='published edit' WHERE id='draft'"))
        rows=preview(self.c,authorised_athlete_ids=["a"],kind="assessment",now=self.now)["items"]
        self.assertEqual([(r["target_id"],r["change_kind"]) for r in rows],[("draft","new")])

    def test_menu_batch_new_then_updated_per_recipient(self):
        fn=lambda:capture.menu(self.c,"a",["2026-11-30","2026-12-01"])
        self.change(fn,lambda:self.c.executemany("INSERT INTO v2_weekly_menus VALUES(?,?,?,?,?,?)",
            [("a","2026-11-30","lunch","text","Rice",None),("a","2026-12-01","dinner","text","Fish",None)]))
        self.change(fn,lambda:self.c.execute("UPDATE v2_weekly_menus SET value='Pasta' WHERE menu_date='2026-11-30'"))
        def current():
            return [r for r in preview(self.c,authorised_athlete_ids=["a"],kind="menu",now=self.now)["items"]
                    if r["target_id"]=="a:2026-11-30"]
        rows=current()
        self.assertEqual({(r["recipient_id"],r["change_kind"]) for r in rows},{("p","new"),("chef","new")})
        player=next(r for r in rows if r["recipient_id"]=="p")
        self.c.execute("""INSERT INTO v2_manual_notifications
            (id,request_id,recipient_id,sender_id,kind,language,title,body,target_id,content_version,created_at)
            VALUES('n','r','p','admin','menu','pt-PT','Title','Body',?,?,?)""",
            (player["target_id"],player["version"],int(self.now.timestamp())))
        self.assertEqual([r["recipient_id"] for r in current()],["chef"])
        self.change(fn,lambda:self.c.execute("UPDATE v2_weekly_menus SET value='Potatoes' WHERE menu_date='2026-11-30'"))
        self.assertEqual({(r["recipient_id"],r["change_kind"]) for r in current()},
                         {("p","updated"),("chef","new")})

    def test_disabled_and_missing_metadata_do_not_block_original_write(self):
        fn=lambda:capture.document(self.c,"d")
        with patch.dict(os.environ,{"MILE_NOTIFICATIONS_CAPTURE":"0"}):
            self.change(fn,lambda:self.c.execute("UPDATE documents SET title='Disabled' WHERE id='d'"))
        self.assertEqual(self.events(),[])
        previous=capture.before(self.c,fn)
        self.c.execute("UPDATE documents SET title='Preserved' WHERE id='d'")
        self.c.execute("DROP TABLE v2_notification_content_changes")
        capture.after(self.c,previous,fn)
        self.c.commit()
        self.assertEqual(self.c.execute("SELECT title FROM documents WHERE id='d'").fetchone()[0],"Preserved")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_manual_notifications").fetchone()[0],0)

    def test_weekly_document_is_never_suggested(self):
        fn=lambda:capture.document(self.c,"w")
        self.change(fn,lambda:self.c.execute("UPDATE documents SET title='Changed' WHERE id='w'"))
        self.assertEqual(self.events(),[])


if __name__=="__main__":
    unittest.main()
