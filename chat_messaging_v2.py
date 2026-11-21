"""The Mile — isolated Chef ↔ staff messaging domain, backend foundation v1.

NO production startup import, routes, notifications, push, or schema activation.
The initialize(c) DDL is intentionally opt-in for a later reviewed migration.
Requires existing users, v2_athletes and v2_chef_links tables. Compatible with
SQLite and the app's '?' -> '%s' PostgreSQL adapter.

Security contract:
* One persistent conversation per Chef; athlete association is resolved from DB.
* Chef access is derived from active user + active linked athlete.
* Staff access is explicit membership, not unrestricted admin visibility.
* Only active administrators can grant/revoke staff memberships in v1.
* Messages have a stable idempotency key per author and conversation.
* Read cursors are per member, move monotonically, and cannot cross conversations.
* No notifications, media, clinical-plan mutation or automatic staff grants.
"""
import secrets
import time

MAX_MESSAGE_CHARS=2000
MAX_PAGE_SIZE=100
MAX_CLIENT_KEY_CHARS=96


class ChatAccessError(PermissionError):
    pass


def initialize(c):
    """Idempotent, add-only schema; invoke only in an approved migration."""
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chat_conversations(
        id TEXT PRIMARY KEY,
        chef_id TEXT NOT NULL UNIQUE REFERENCES users(id),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        closed_at BIGINT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chat_memberships(
        conversation_id TEXT NOT NULL REFERENCES v2_chat_conversations(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        member_type TEXT NOT NULL CHECK(member_type IN ('chef','staff')),
        joined_at BIGINT NOT NULL,
        revoked_at BIGINT,
        PRIMARY KEY(conversation_id,user_id)
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS v2_chat_memberships_user
        ON v2_chat_memberships(user_id,revoked_at,conversation_id)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chat_messages(
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES v2_chat_conversations(id),
        author_id TEXT NOT NULL REFERENCES users(id),
        client_key TEXT NOT NULL,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
        created_at BIGINT NOT NULL,
        UNIQUE(conversation_id,author_id,client_key)
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS v2_chat_messages_order
        ON v2_chat_messages(conversation_id,created_at,id)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chat_read_state(
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_message_id TEXT REFERENCES v2_chat_messages(id),
        read_at BIGINT NOT NULL,
        PRIMARY KEY(conversation_id,user_id),
        FOREIGN KEY(conversation_id,user_id)
            REFERENCES v2_chat_memberships(conversation_id,user_id)
    )""")


def _now():
    return int(time.time()*1000)


def _active_actor(c,user_id):
    if not isinstance(user_id,str) or not user_id:
        raise ChatAccessError("unauthorized")
    row=c.execute("SELECT id,role FROM users WHERE id=? AND active=1",(user_id,)).fetchone()
    if not row:
        raise ChatAccessError("unauthorized")
    return row


def _is_active_chef(c,chef_id):
    return c.execute("""SELECT l.user_id
        FROM v2_chef_links l
        JOIN users u ON u.id=l.user_id AND u.role='chef' AND u.active=1
        JOIN v2_athletes a ON a.id=l.athlete_id AND a.archived_at IS NULL
        WHERE l.user_id=?""",(chef_id,)).fetchone() is not None


def _require_member(c,conversation_id,actor_id):
    actor=_active_actor(c,actor_id)
    conversation=c.execute("SELECT id,chef_id,closed_at FROM v2_chat_conversations WHERE id=?",
                           (conversation_id,)).fetchone()
    if not conversation:
        raise ChatAccessError("not_found")
    member=c.execute("""SELECT member_type FROM v2_chat_memberships
        WHERE conversation_id=? AND user_id=? AND revoked_at IS NULL""",
        (conversation_id,actor_id)).fetchone()
    if not member:
        raise ChatAccessError("forbidden")
    expected="chef" if actor["role"]=="chef" else "staff" if actor["role"]=="admin" else None
    if member["member_type"]!=expected:
        raise ChatAccessError("forbidden")
    if expected=="chef" and (conversation["chef_id"]!=actor_id or not _is_active_chef(c,actor_id)):
        raise ChatAccessError("forbidden")
    return conversation


def get_or_create_chef_conversation(c,actor_id):
    """Caller must be the authenticated Chef; do not accept athlete_id from UI."""
    actor=_active_actor(c,actor_id)
    if actor["role"]!="chef" or not _is_active_chef(c,actor_id):
        raise ChatAccessError("forbidden")
    existing=c.execute("SELECT id FROM v2_chat_conversations WHERE chef_id=?",
                       (actor_id,)).fetchone()
    if existing:
        _require_member(c,existing["id"],actor_id)
        return existing["id"]
    conversation_id=secrets.token_hex(16)
    now=_now()
    c.execute("""INSERT INTO v2_chat_conversations(id,chef_id,created_at,updated_at)
        VALUES(?,?,?,?) ON CONFLICT(chef_id) DO NOTHING""",
        (conversation_id,actor_id,now,now))
    row=c.execute("SELECT id FROM v2_chat_conversations WHERE chef_id=?",
                  (actor_id,)).fetchone()
    conversation_id=row["id"]
    c.execute("""INSERT INTO v2_chat_memberships
        (conversation_id,user_id,member_type,joined_at)
        VALUES(?,?,'chef',?) ON CONFLICT(conversation_id,user_id) DO NOTHING""",
        (conversation_id,actor_id,now))
    return conversation_id


def grant_staff_access(c,conversation_id,admin_id,staff_user_id):
    """Explicit admin-authorized assignment. No blanket admin inbox access."""
    actor=_active_actor(c,admin_id)
    if actor["role"]!="admin":
        raise ChatAccessError("forbidden")
    staff=_active_actor(c,staff_user_id)
    if staff["role"]!="admin":  # Future nutritionist roles require separate review.
        raise ChatAccessError("unsupported_staff_role")
    if not c.execute("SELECT id FROM v2_chat_conversations WHERE id=?",(conversation_id,)).fetchone():
        raise ChatAccessError("not_found")
    now=_now()
    c.execute("""INSERT INTO v2_chat_memberships
        (conversation_id,user_id,member_type,joined_at,revoked_at)
        VALUES(?,?,'staff',?,NULL)
        ON CONFLICT(conversation_id,user_id) DO UPDATE SET
            member_type='staff',joined_at=excluded.joined_at,revoked_at=NULL""",
        (conversation_id,staff_user_id,now))


def revoke_staff_access(c,conversation_id,admin_id,staff_user_id):
    actor=_active_actor(c,admin_id)
    if actor["role"]!="admin":
        raise ChatAccessError("forbidden")
    c.execute("""UPDATE v2_chat_memberships SET revoked_at=?
        WHERE conversation_id=? AND user_id=? AND member_type='staff'
        AND revoked_at IS NULL""",(_now(),conversation_id,staff_user_id))


def _clean_message(body,client_key):
    if not isinstance(body,str) or not 1<=len(body.strip())<=MAX_MESSAGE_CHARS:
        raise ValueError("invalid_message")
    value=body.strip()
    if any(ord(ch)<32 and ch not in "\n\t" for ch in value):
        raise ValueError("invalid_message")
    if not isinstance(client_key,str) or not 1<=len(client_key)<=MAX_CLIENT_KEY_CHARS:
        raise ValueError("invalid_client_key")
    if not all(ch.isascii() and (ch.isalnum() or ch in "-_.:") for ch in client_key):
        raise ValueError("invalid_client_key")
    return value


def send_message(c,conversation_id,actor_id,body,client_key):
    conversation=_require_member(c,conversation_id,actor_id)
    if conversation["closed_at"] is not None:
        raise ChatAccessError("closed")
    value=_clean_message(body,client_key)
    existing=c.execute("""SELECT id,conversation_id,author_id,body,created_at
        FROM v2_chat_messages WHERE conversation_id=? AND author_id=? AND client_key=?""",
        (conversation_id,actor_id,client_key)).fetchone()
    if existing:
        return dict(existing),False
    # Allocate a strictly increasing ordering cursor in the conversation row.
    # The UPDATE serializes writers on PostgreSQL; SQLite serializes its writer.
    # A wall-clock millisecond timestamp alone can collide under rapid sends.
    now=c.execute("""UPDATE v2_chat_conversations SET
        updated_at=CASE WHEN updated_at>=? THEN updated_at+1 ELSE ? END
        WHERE id=? RETURNING updated_at""",
        (_now(),_now(),conversation_id)).fetchone()["updated_at"]
    message_id=secrets.token_hex(16)
    c.execute("""INSERT INTO v2_chat_messages
        (id,conversation_id,author_id,client_key,body,created_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(conversation_id,author_id,client_key) DO NOTHING""",
        (message_id,conversation_id,actor_id,client_key,value,now))
    row=c.execute("""SELECT id,conversation_id,author_id,body,created_at
        FROM v2_chat_messages WHERE conversation_id=? AND author_id=? AND client_key=?""",
        (conversation_id,actor_id,client_key)).fetchone()
    return dict(row),row["id"]==message_id


def list_messages(c,conversation_id,actor_id,after_id=None,limit=40):
    _require_member(c,conversation_id,actor_id)
    if not isinstance(limit,int) or not 1<=limit<=MAX_PAGE_SIZE:
        raise ValueError("invalid_limit")
    where="";params=[conversation_id]
    if after_id is not None:
        cursor=c.execute("""SELECT created_at,id FROM v2_chat_messages
            WHERE conversation_id=? AND id=?""",(conversation_id,after_id)).fetchone()
        if not cursor:
            raise ValueError("invalid_cursor")
        where=" AND (created_at>? OR (created_at=? AND id>?))"
        params.extend((cursor["created_at"],cursor["created_at"],cursor["id"]))
    params.append(limit)
    rows=c.execute("""SELECT id,author_id,body,created_at
        FROM v2_chat_messages WHERE conversation_id=?"""+where+
        " ORDER BY created_at,id LIMIT ?",tuple(params)).fetchall()
    return [dict(row) for row in rows]


def mark_read(c,conversation_id,actor_id,message_id):
    _require_member(c,conversation_id,actor_id)
    target=c.execute("""SELECT created_at,id FROM v2_chat_messages
        WHERE conversation_id=? AND id=?""",(conversation_id,message_id)).fetchone()
    if not target:
        raise ValueError("invalid_message_cursor")
    state=c.execute("""SELECT last_message_id FROM v2_chat_read_state
        WHERE conversation_id=? AND user_id=?""",(conversation_id,actor_id)).fetchone()
    if state and state["last_message_id"]:
        old=c.execute("""SELECT created_at,id FROM v2_chat_messages
            WHERE id=? AND conversation_id=?""",
            (state["last_message_id"],conversation_id)).fetchone()
        if old and (target["created_at"],target["id"])<=(old["created_at"],old["id"]):
            return False
    c.execute("""INSERT INTO v2_chat_read_state
        (conversation_id,user_id,last_message_id,read_at) VALUES(?,?,?,?)
        ON CONFLICT(conversation_id,user_id) DO UPDATE SET
        last_message_id=excluded.last_message_id,read_at=excluded.read_at""",
        (conversation_id,actor_id,message_id,_now()))
    return True


def unread_count(c,conversation_id,actor_id):
    _require_member(c,conversation_id,actor_id)
    state=c.execute("""SELECT last_message_id FROM v2_chat_read_state
        WHERE conversation_id=? AND user_id=?""",(conversation_id,actor_id)).fetchone()
    params=[conversation_id,actor_id]
    predicate=""
    if state and state["last_message_id"]:
        cursor=c.execute("""SELECT created_at,id FROM v2_chat_messages
            WHERE conversation_id=? AND id=?""",
            (conversation_id,state["last_message_id"])).fetchone()
        if cursor:
            predicate=" AND (created_at>? OR (created_at=? AND id>?))"
            params.extend((cursor["created_at"],cursor["created_at"],cursor["id"]))
    return c.execute("""SELECT COUNT(*) AS n FROM v2_chat_messages
        WHERE conversation_id=? AND author_id<>?"""+predicate,
        tuple(params)).fetchone()["n"]


def list_staff_conversations(c,admin_id,limit=50):
    actor=_active_actor(c,admin_id)
    if actor["role"]!="admin":
        raise ChatAccessError("forbidden")
    if not isinstance(limit,int) or not 1<=limit<=MAX_PAGE_SIZE:
        raise ValueError("invalid_limit")
    rows=c.execute("""SELECT v.id,v.chef_id,v.updated_at
        FROM v2_chat_conversations v
        JOIN v2_chat_memberships m ON m.conversation_id=v.id
            AND m.user_id=? AND m.member_type='staff' AND m.revoked_at IS NULL
        WHERE v.closed_at IS NULL
        ORDER BY v.updated_at DESC,v.id LIMIT ?""",(admin_id,limit)).fetchall()
    return [dict(row) for row in rows]
