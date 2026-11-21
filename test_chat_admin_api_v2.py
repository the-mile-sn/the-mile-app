"""Chat Admin adapter on an ephemeral SQLite database — no Render connections."""
import unittest
import chat_admin_api_v2 as api
import chat_messaging_v2 as chat
from test_chat_messaging_v2 import db


class ChatAdminApiTests(unittest.TestCase):
    def setUp(self):
        self.c=db()
        self.cid=chat.get_or_create_chef_conversation(self.c,"chef-a")

    def tearDown(self):
        self.c.close()

    def call(self,path,method="GET",body=None,query=""):
        return api.handle(self.c,"admin-a",path,method,query,lambda:body)

    def test_pending_only_metadata_and_explicit_assignment(self):
        status,d=self.call("/api/v2/admin/chat")
        self.assertEqual(status,200)
        self.assertEqual(len(d["pending"]),1)
        self.assertEqual(d["assigned"],[])
        self.assertNotIn("body",str(d))
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/admin/chat/messages",query="conversation_id="+self.cid)
        status,_=self.call("/api/v2/admin/chat/assign","POST",
                           {"conversation_id":self.cid,"staff_id":"admin-a"})
        self.assertEqual(status,200)
        self.assertEqual(len(self.call("/api/v2/admin/chat")[1]["assigned"]),1)
        self.assertEqual(self.call("/api/v2/admin/chat")[1]["pending"],[])
        status,data=self.call("/api/v2/admin/chat/messages",query="conversation_id="+self.cid)
        self.assertEqual(data["messages"],[])
        msg=self.call("/api/v2/admin/chat/messages","POST",
                      {"conversation_id":self.cid,"body":"Resposta","client_key":"admin-msg"})
        self.assertEqual(msg[0],201)
        self.assertEqual(len(self.call("/api/v2/admin/chat/messages",query="conversation_id="+self.cid)[1]["messages"]),1)
        self.assertTrue(self.call("/api/v2/admin/chat/read","POST",
            {"conversation_id":self.cid,"message_id":msg[1]["message"]["id"]})[1]["changed"])
        self.assertEqual(chat.unread_count(self.c,self.cid,"chef-a"),1)

    def test_unassigned_staff_cannot_read_or_reply(self):
        self.call("/api/v2/admin/chat/assign","POST",
                  {"conversation_id":self.cid,"staff_id":"admin-b"})
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/admin/chat/messages",query="conversation_id="+self.cid)
        with self.assertRaises(chat.ChatAccessError):
            self.call("/api/v2/admin/chat/messages","POST",
                      {"conversation_id":self.cid,"body":"Unauthorized","client_key":"attempt"})

    def test_invalid_inputs(self):
        with self.assertRaises(api.ChatApiError):
            self.call("/api/v2/admin/chat/messages",query="conversation_id=")
        with self.assertRaises(api.ChatApiError):
            self.call("/api/v2/admin/chat/assign","POST",{"conversation_id":self.cid})
        with self.assertRaises(api.ChatApiError):
            self.call("/api/v2/admin/chat/messages",query="conversation_id="+self.cid+"&limit=999")
        with self.assertRaises(api.ChatApiError):
            self.call("/api/v2/admin/chat/nope")


if __name__=="__main__":unittest.main()
