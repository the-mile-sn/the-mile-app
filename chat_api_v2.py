"""Authenticated Chef messaging HTTP domain adapter; disabled unless explicitly enabled.

No direct network effects, no implicit schema migration, no admin API access.
Session/CSRF/preview/role enforcement happens in app.py prior to dispatch.
"""
from urllib.parse import parse_qs
import chat_messaging_v2 as domain


class ChatApiError(Exception):
    def __init__(self,status,code):
        super().__init__(code)
        self.status,self.code=status,code


def chef(c,actor_id,path,method,query_string,body_reader):
    """Return (http_status, json_dict); Chef identity never comes from input."""
    prefix="/api/v2/chef/chat"
    if path not in (prefix,prefix+"/messages",prefix+"/read",prefix+"/privacy-ack"):
        raise ChatApiError(404,"not_found")
    if path==prefix+"/privacy-ack" and method=="POST":
        body=body_reader()
        if not isinstance(body,dict) or set(body)!={"version"}:
            raise ChatApiError(400,"invalid_request")
        try:
            status=domain.acknowledge_privacy_notice(c,actor_id,body["version"])
        except ValueError:
            raise ChatApiError(400,"invalid_notice_version") from None
        c.commit()
        return 200,{"privacy_notice":status}
    if path==prefix and method=="GET":
        notice=domain.privacy_notice_status(c,actor_id)
        row=c.execute("SELECT id,closed_at,retention_review_at FROM v2_chat_conversations WHERE chef_id=?",
                      (actor_id,)).fetchone()
        if row is None:
            return 200,{"conversation":None,"unread_count":0,"privacy_notice":notice}
        # Always validate current membership and linked athlete before returning metadata.
        domain._require_member(c,row["id"],actor_id)
        return 200,{"conversation":dict(row),"unread_count":domain.unread_count(c,row["id"],actor_id),"privacy_notice":notice}
    if path==prefix+"/messages" and method=="GET":
        domain.require_privacy_notice(c,actor_id)
        row=c.execute("SELECT id FROM v2_chat_conversations WHERE chef_id=?",(actor_id,)).fetchone()
        if not row:
            return 200,{"messages":[]}
        q=parse_qs(query_string)
        if set(q)-{"after","limit"} or len(q.get("after",[]))>1 or len(q.get("limit",[]))>1:
            raise ChatApiError(400,"invalid_query")
        try:
            limit=int((q.get("limit") or ["40"])[0])
            return 200,{"messages":domain.list_messages(
                c,row["id"],actor_id,after_id=(q.get("after") or [None])[0],limit=limit)}
        except ValueError:
            raise ChatApiError(400,"invalid_query") from None
    if path==prefix+"/messages" and method=="POST":
        domain.require_privacy_notice(c,actor_id)
        body=body_reader()
        if not isinstance(body,dict) or set(body)!={"body","client_key"}:
            raise ChatApiError(400,"invalid_request")
        try:
            domain._clean_message(body["body"],body["client_key"])
            conversation_id=domain.get_or_create_chef_conversation(c,actor_id)
            item,new=domain.send_message(
                c,conversation_id,actor_id,body["body"],body["client_key"])
        except ValueError:
            raise ChatApiError(400,"invalid_message") from None
        c.commit()
        return 201 if new else 200,{"message":item,"created":new}
    if path==prefix+"/read" and method=="POST":
        domain.require_privacy_notice(c,actor_id)
        body=body_reader()
        if not isinstance(body,dict) or set(body)!={"message_id"} or not isinstance(body["message_id"],str):
            raise ChatApiError(400,"invalid_request")
        row=c.execute("SELECT id FROM v2_chat_conversations WHERE chef_id=?",(actor_id,)).fetchone()
        if not row:
            raise ChatApiError(404,"conversation_not_found")
        try:
            changed=domain.mark_read(c,row["id"],actor_id,body["message_id"])
        except ValueError:
            raise ChatApiError(400,"invalid_message_cursor") from None
        c.commit()
        return 200,{"changed":changed,"unread_count":domain.unread_count(c,row["id"],actor_id)}
    raise ChatApiError(405,"method_not_allowed")
