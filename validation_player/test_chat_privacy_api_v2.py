"""Chef chat API enforces account-scoped, explicit privacy acknowledgement."""
import unittest

import chat_api_v2 as api
import chat_messaging_v2 as chat
from test_chat_messaging_v2 import db


class PrivacyNoticeApiTests(unittest.TestCase):
    def setUp(self):
        self.c=db()
        self.chef="chef-a"

    def tearDown(self):
        self.c.close()

    def call(self,path,method="GET",body=None):
        return api.chef(self.c,self.chef,path,method,"",lambda:body)

    def test_first_open_records_no_ack_and_blocks_messages_before_explicit_action(self):
        status,response=self.call("/api/v2/chef/chat")
        self.assertEqual(status,200)
        self.assertFalse(response["privacy_notice"]["acknowledged"])
        self.assertEqual(response["unread_count"],0)
        self.assertIsNone(response["conversation"])
        for path,method,body in (
            ("/api/v2/chef/chat/messages","GET",None),
            ("/api/v2/chef/chat/messages","POST",
             {"body":"Should not send","client_key":"before"}),
            ("/api/v2/chef/chat/read","POST",{"message_id":"x"}),
        ):
            with self.assertRaisesRegex(chat.ChatAccessError,"privacy_ack_required"):
                self.call(path,method,body)
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_messages").fetchone()[0],0)
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_privacy_acknowledgements").fetchone()[0],0)

    def test_acknowledge_once_and_never_ack_for_another_chef(self):
        for invalid in ({},{"version":"obsolete"},{"version":"valid","extra":1}):
            with self.assertRaises(api.ChatApiError):
                self.call("/api/v2/chef/chat/privacy-ack","POST",invalid)
        version=chat.CHEF_PRIVACY_NOTICE_VERSION
        status,response=self.call("/api/v2/chef/chat/privacy-ack","POST",{"version":version})
        self.assertEqual(status,200)
        self.assertTrue(response["privacy_notice"]["acknowledged"])
        timestamp=response["privacy_notice"]["acknowledged_at"]
        self.assertGreater(timestamp,0)
        status,repeated=self.call("/api/v2/chef/chat/privacy-ack","POST",{"version":version})
        self.assertEqual(repeated["privacy_notice"]["acknowledged_at"],timestamp)
        status,info=self.call("/api/v2/chef/chat")
        self.assertTrue(info["privacy_notice"]["acknowledged"])
        self.assertEqual(info["conversation"],None)
        _,empty=self.call("/api/v2/chef/chat/messages")
        self.assertEqual(empty["messages"],[])
        _,sent=self.call("/api/v2/chef/chat/messages","POST",
                         {"body":"Test","client_key":"after"})
        self.assertTrue(sent["created"])
        _,visible=self.call("/api/v2/chef/chat/messages")
        self.assertEqual(len(visible["messages"]),1)
        self.chef="chef-b"
        _,other=self.call("/api/v2/chef/chat")
        self.assertFalse(other["privacy_notice"]["acknowledged"])
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/chef/chat/messages","GET")
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_messages").fetchone()[0],1)

    def test_unauthorized_role_does_not_receive_or_create_ack(self):
        self.chef="admin-a"
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/chef/chat")
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/chef/chat/privacy-ack","POST",
                      {"version":chat.CHEF_PRIVACY_NOTICE_VERSION})
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_privacy_acknowledgements").fetchone()[0],0)


if __name__ == "__main__":
    unittest.main()
