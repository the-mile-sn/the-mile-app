"""Admin chat HTTP adapter: explicit staff membership, gated by app.py.

All inputs validated; no implicit conversation access and no schema activation.
"""
import chat_messaging_v2 as domain
from urllib.parse import parse_qs


class ChatApiError(Exception):
    def __init__(self,status,code):
        super().__init__(code)
        self.status,self.code=status,code


def _single_query(q,name,required=False):
    a=q.get(name,[])
    if len(a)>1 or (required and (len(a)!=1 or not a[0])):
        raise ChatApiError(400,"invalid_query")
    return a[0] if a else None


def handle(c,actor_id,path,method,query_string,body_reader):
    root="/api/v2/admin/chat"
    if path not in (root,root+"/assign",root+"/messages",root+"/read"):
        raise ChatApiError(404,"not_found")
    if path==root and method=="GET":
        # Only conversation metadata is visible in the unassigned queue; messages
        # are never exposed unless the staff member has been assigned explicitly.
        own=domain.list_staff_conversations(c,actor_id)
        pending=[dict(r) for r in c.execute("""SELECT v.id,v.chef_id,u.name AS chef_name,v.updated_at
            FROM v2_chat_conversations v
            JOIN users u ON u.id=v.chef_id AND u.active=1 AND u.role='chef'
            JOIN v2_chef_links l ON l.user_id=u.id
            JOIN v2_athletes a ON a.id=l.athlete_id AND a.archived_at IS NULL
            WHERE v.closed_at IS NULL
              AND NOT EXISTS(SELECT 1 FROM v2_chat_memberships m
                WHERE m.conversation_id=v.id AND m.member_type='staff'
                  AND m.revoked_at IS NULL)
            ORDER BY v.updated_at DESC,v.id LIMIT 50""").fetchall()]
        own_ids={row["id"] for row in own}
        assigned=[]
        for row in own:
            info=c.execute("SELECT name FROM users WHERE id=?",(row["chef_id"],)).fetchone()
            assigned.append({**row,"chef_name":info["name"] if info else "Chef",
                            "unread_count":domain.unread_count(c,row["id"],actor_id)})
        return 200,{"assigned":assigned,"pending":[x for x in pending if x["id"] not in own_ids]}
    if path==root+"/assign" and method=="POST":
        body=body_reader()
        if (not isinstance(body,dict) or set(body)!={"conversation_id","staff_id"}
                or any(not isinstance(body[k],str) or not body[k] for k in body)):
            raise ChatApiError(400,"invalid_request")
        # The active administrator explicitly assigns a staff member; this
        # grants no access to other professionals or other Chef conversations.
        domain.grant_staff_access(c,body["conversation_id"],actor_id,body["staff_id"])
        c.commit()
        return 200,{"ok":True}
    if path==root+"/messages" and method=="GET":
        q=parse_qs(query_string)
        if set(q)-{"conversation_id","after","limit"}:
            raise ChatApiError(400,"invalid_query")
        cid=_single_query(q,"conversation_id",required=True)
        after=_single_query(q,"after")
        lim=_single_query(q,"limit")
        try:
            limit=int(lim) if lim is not None else 40
            rows=domain.list_messages(c,cid,actor_id,after_id=after,limit=limit)
        except ValueError:
            raise ChatApiError(400,"invalid_query") from None
        return 200,{"messages":rows}
    if path==root+"/messages" and method=="POST":
        body=body_reader()
        if not isinstance(body,dict) or set(body)!={"conversation_id","body","client_key"}:
            raise ChatApiError(400,"invalid_request")
        try:
            item,new=domain.send_message(c,body["conversation_id"],actor_id,
                                         body["body"],body["client_key"])
        except (ValueError,TypeError):
            raise ChatApiError(400,"invalid_message") from None
        c.commit()
        return 201 if new else 200,{"message":item,"created":new}
    if path==root+"/read" and method=="POST":
        body=body_reader()
        if (not isinstance(body,dict) or set(body)!={"conversation_id","message_id"}
                or not all(isinstance(v,str) and v for v in body.values())):
            raise ChatApiError(400,"invalid_request")
        try:
            changed=domain.mark_read(c,body["conversation_id"],actor_id,body["message_id"])
        except ValueError:
            raise ChatApiError(400,"invalid_message_cursor") from None
        c.commit()
        return 200,{"changed":changed,"unread_count":domain.unread_count(
            c,body["conversation_id"],actor_id)}
    raise ChatApiError(405,"method_not_allowed")
