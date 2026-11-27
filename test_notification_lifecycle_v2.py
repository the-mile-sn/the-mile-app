"""Cross-service notification lifecycle using only synthetic SQLite data."""
import time
import unittest
from unittest.mock import patch

import test_notification_manual_v2 as fixtures
from content_translations_v2 import initialize as init_translations, submit, approve
from notification_activation_v2 import initialize as init_devices
from notification_admin_preview_v2 import preview
from notification_dispatch_v2 import confirmation_digest, dispatch
from notification_inbox_v2 import inbox, open_notification, destination
from notification_manual_v2 import prepare, record_manual
from notification_templates_v2 import TEMPLATES


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.ManualNotificationTests()
        self.fixture.setUp()
        self.c=self.fixture.c
        self.now=self.fixture.now
        self.c.execute('PRAGMA foreign_keys=ON')
        self.c.execute('CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires BIGINT)')
        self.c.execute('INSERT INTO sessions VALUES(?,?,?)',('chef-session','chef',int(time.time())+3600))
        init_devices(self.c)
        init_translations(self.c)
        self.c.execute("""INSERT INTO v2_notification_devices
            (device_id,user_id,session_token,endpoint,p256dh,auth,created_at)
            VALUES('device','chef','chef-session','https://fcm.googleapis.com/fcm/send/fake','fake','fake',100)""")
        self.c.commit()

    def tearDown(self):
        self.fixture.tearDown()

    def test_menu_bilingual_confirmation_dispatch_and_read(self):
        candidates=preview(self.c,authorised_athlete_ids=['a'],kind='menu',now=self.now)['items']
        selections=[{k:i[k] for k in ('recipient_id','target_id','version')} for i in candidates]
        args=dict(authorised_athlete_ids=['a'],kind='menu',selections=selections,now=self.now,menu_change='new')
        with self.assertRaisesRegex(ValueError,'requires_review'):
            prepare(self.c,**args)
        for field,pt,en in zip(('title','body'),TEMPLATES['menu_new']['pt-PT'],TEMPLATES['menu_new']['en-GB']):
            params=dict(entity_kind='notification',entity_id='menu_new',field_path=field,source_text=pt)
            submit(self.c,**params,translated_text=en,actor_id='admin')
            approve(self.c,**params,reviewer_id='admin')
        rows=prepare(self.c,**args)
        self.assertEqual({r['language'] for r in rows},{'pt-PT','en-GB'})
        digest=confirmation_digest(rows)
        result=record_manual(self.c,**args,sender_id='admin',request_id='lifecycle',expected_digest=digest)
        self.c.commit()
        self.assertEqual(len(result['recorded_ids']),2)
        self.assertEqual(preview(self.c,authorised_athlete_ids=['a'],kind='menu',now=self.now)['items'],[])
        p=inbox(self.c,'p')[0]
        chef=inbox(self.c,'chef')[0]
        self.assertIsNone(p['read_at'])
        self.assertEqual(chef['title'],TEMPLATES['menu_new']['en-GB'][0])
        calls=[]
        def fake_send(sub,payload):
            calls.append(payload)
            return 'accepted'
        with patch.dict('os.environ',{'MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS':'p,chef'}):
            outcomes=dispatch(self.c,result['recorded_ids'],fake_send)
            self.assertEqual(outcomes,{p['id']:'not_subscribed',chef['id']:'accepted'})
            self.assertEqual(dispatch(self.c,result['recorded_ids'],fake_send),{})
        self.assertEqual(calls,[{'version':2,'id':chef['id'],'language':'en-GB'}])
        self.assertIsNone(inbox(self.c,'chef')[0]['read_at'])
        self.assertIsNone(open_notification(self.c,recipient_id='p',notification_id=chef['id'],now=101))
        opened=open_notification(self.c,recipient_id='chef',notification_id=chef['id'],now=102)
        self.assertEqual(destination(self.c,user={'id':'chef','role':'chef'},item=opened),{'kind':'menu','week':'2026-11-23'})
        self.assertEqual(opened['read_at'],102)
        history=preview(self.c,authorised_athlete_ids=['a'],kind='history',now=self.now)['items']
        self.assertEqual({r['recipient_id']:r['read_at'] for r in history},{'p':None,'chef':102})
        self.c.execute("UPDATE v2_chef_links SET archived_at=103 WHERE user_id='chef'")
        self.assertIsNone(destination(self.c,user={'id':'chef','role':'chef'},item=opened))

    def test_confirmation_rejects_language_change_before_save(self):
        args=dict(authorised_athlete_ids=['a'],kind='custom',selections=[{'recipient_id':'p'}],now=self.now,
                  custom_copy={'pt-PT':{'title':'Aviso','body':'Mensagem'},'en-GB':{'title':'Notice','body':'Message'}})
        digest=confirmation_digest(prepare(self.c,**args))
        self.c.execute("UPDATE v2_player_language_preferences SET language='en' WHERE user_id='p'")
        with self.assertRaisesRegex(ValueError,'confirmation_changed'):
            record_manual(self.c,**args,sender_id='admin',request_id='stale',expected_digest=digest)
        self.assertEqual(inbox(self.c,'p'),[])

    def test_document_destination_rechecks_visibility_and_ownership(self):
        user=dict(self.c.execute("SELECT * FROM users WHERE id='p'").fetchone())
        self.assertEqual(destination(self.c,user=user,item={'kind':'document','target_id':'d'}),{'kind':'document','id':'d'})
        for target in ('hidden','w','other'):
            self.assertIsNone(destination(self.c,user=user,item={'kind':'document','target_id':target}))
        self.c.execute("DELETE FROM documents WHERE id='d'")
        self.assertIsNone(destination(self.c,user=user,item={'kind':'document','target_id':'d'}))


if __name__=='__main__':
    unittest.main()
