"""HTTP-level Admin chat integration against an ephemeral local SQLite database."""
import os
import unittest
from unittest.mock import patch
import test_app
import chat_messaging_v2 as chat

app=test_app.app
Client=test_app.Client


class ChatAdminWsgiTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        with app.connect() as c:
            chat.initialize(c)
        created=self.admin.request("/api/v2/athletes","POST",{
            "name":"Atleta Chat","username":"atletachat",
            "password":"athlete-password-123","sex":"M","weight_kg":72})
        self.assertEqual(created["status"],201,created)
        aid=created["body"]["athlete"]["id"]
        chef=self.admin.request("/api/v2/admin/chefs","POST",{
            "name":"Chef Chat","username":"chefchatvalid","password":"chef-password-123",
            "athlete_id":aid,"language":"pt"})
        self.assertEqual(chef["status"],201,chef)
        self.chef_id=chef["body"]["chef"]["id"]
        self.admin_id=self.admin.request("/api/me")["body"]["user"]["id"]
        with app.connect() as c:
            self.cid=chat.get_or_create_chef_conversation(c,self.chef_id)
            chat.send_message(c,self.cid,self.chef_id,"Pedido de alteração","initial-request")

    def test_api_is_off_by_default_and_legacy_services_are_intact(self):
        with patch.dict(os.environ,{"MILE_CHAT_API_ENABLED":"0"}):
            self.assertEqual(self.admin.request("/api/v2/admin/chat")["status"],404)
            self.assertEqual(self.admin.request("/api/v2/admin/chat/messages?conversation_id="+self.cid)["status"],404)
        self.assertEqual(Client().request("/api/v2/admin/chat")["status"],401)

    def test_explicit_assignment_send_and_read_with_csrf(self):
        with patch.dict(os.environ,{"MILE_CHAT_API_ENABLED":"1"}):
            pending=self.admin.request("/api/v2/admin/chat")
            self.assertEqual(pending["status"],200,pending)
            self.assertEqual(len(pending["body"]["pending"]),1)
            self.assertNotIn("Pedido de alteração",str(pending["body"]))
            self.assertEqual(
                self.admin.request("/api/v2/admin/chat/messages?conversation_id="+self.cid)["status"],403)
            self.assertEqual(self.admin.request("/api/v2/admin/chat/assign","POST",
                {"conversation_id":self.cid,"staff_id":self.admin_id},csrf=False)["status"],403)
            self.assertEqual(self.admin.request("/api/v2/admin/chat/assign","POST",
                {"conversation_id":self.cid,"staff_id":self.admin_id},
                origin="https://evil.invalid")["status"],403)
            assigned=self.admin.request("/api/v2/admin/chat/assign","POST",
                {"conversation_id":self.cid,"staff_id":self.admin_id})
            self.assertEqual(assigned["status"],200,assigned)
            inbox=self.admin.request("/api/v2/admin/chat")
            self.assertEqual(len(inbox["body"]["assigned"]),1)
            self.assertEqual(inbox["body"]["assigned"][0]["unread_count"],1)
            history=self.admin.request("/api/v2/admin/chat/messages?conversation_id="+self.cid)
            self.assertEqual(history["status"],200,history)
            self.assertEqual(history["body"]["messages"][0]["body"],"Pedido de alteração")
            sent=self.admin.request("/api/v2/admin/chat/messages","POST",{
                "conversation_id":self.cid,"body":"Confirmado","client_key":"reply1"})
            self.assertEqual(sent["status"],201,sent)
            idem=self.admin.request("/api/v2/admin/chat/messages","POST",{
                "conversation_id":self.cid,"body":"Confirmado","client_key":"reply1"})
            self.assertEqual(idem["status"],200,idem)
            read=self.admin.request("/api/v2/admin/chat/read","POST",{
                "conversation_id":self.cid,"message_id":history["body"]["messages"][0]["id"]})
            self.assertEqual(read["status"],200,read)
            self.assertEqual(read["body"]["unread_count"],0)

    def test_static_assets_are_served_and_admin_only(self):
        with patch.object(app,"SITE_ROLE","admin"):
            for path in ("/admin-chat-v2.css","/admin-chat-v2.js"):
                response=self.admin.request(path)
                self.assertEqual(response["status"],200,response)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.admin.request("/admin-chat-v2.js")["status"],404)
            self.assertEqual(self.admin.request("/admin-chat-v2.css")["status"],404)


if __name__=="__main__":unittest.main()
