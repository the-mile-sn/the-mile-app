"""Explicit notification activation, separate from legacy push subscriptions.

No startup hooks, sending, scheduling or implicit subscriptions. Schema must
be installed explicitly in an isolated environment before enabling the API.
"""
import base64
import re
from urllib.parse import urlsplit

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS v2_notification_activation (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        prompted_at BIGINT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS v2_notification_devices (
        device_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_token TEXT NOT NULL REFERENCES sessions(token) ON UPDATE CASCADE ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at BIGINT NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS v2_notification_devices_user
        ON v2_notification_devices(user_id)""",
)


def initialize(c):
    for sql in SCHEMA:
        c.execute(sql)


def device_id(value):
    if not isinstance(value,str) or not re.fullmatch(r"[a-zA-Z0-9-]{32,64}",value):
        raise ValueError("invalid_device")
    return value


def state(c, *, user_id, device, session_token, now):
    device = device_id(device)
    prompted = c.execute("SELECT 1 FROM v2_notification_activation WHERE user_id=?",
                         (user_id,)).fetchone()
    active = c.execute("""SELECT 1 FROM v2_notification_devices d
                       JOIN sessions s ON s.token=d.session_token AND s.user_id=d.user_id
                       WHERE d.user_id=? AND d.device_id=? AND s.token=? AND s.expires>?""",
                       (user_id,device,session_token,now)).fetchone()
    return {"prompted":bool(prompted),"active":bool(active)}


def acknowledge(c, *, user_id, now):
    c.execute("""INSERT INTO v2_notification_activation(user_id,prompted_at)
                 VALUES(?,?) ON CONFLICT(user_id) DO NOTHING""",(user_id,now))


def _key(value, length):
    if not isinstance(value,str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}",value):
        raise ValueError("invalid_key")
    raw=base64.b64decode(value+"="*(-len(value)%4),altchars=b"-_",validate=True)
    if len(raw)!=length or (length==65 and raw[0]!=4):
        raise ValueError("invalid_key")
    return value


def _endpoint(value):
    if not isinstance(value,str) or len(value)>1800:
        raise ValueError("invalid_endpoint")
    u=urlsplit(value)
    host=u.hostname or ""
    allowed=(host in ("fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com")
             or host.endswith(".push.apple.com") or host.endswith(".notify.windows.com"))
    if u.scheme!="https" or not allowed or u.username or u.password or u.port not in (None,443) or u.fragment or not u.path or u.path=="/":
        raise ValueError("invalid_endpoint")
    return value


def activate(c, *, user_id, device, subscription, session_token, now):
    device=device_id(device)
    if not isinstance(subscription,dict) or not isinstance(subscription.get("keys"),dict):
        raise ValueError("invalid_subscription")
    endpoint=_endpoint(subscription.get("endpoint"))
    p256dh=_key(subscription["keys"].get("p256dh"),65)
    auth=_key(subscription["keys"].get("auth"),16)
    if not c.execute("SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?",
                     (session_token,user_id,now)).fetchone():
        raise ValueError("invalid_session")
    # One browser subscription belongs to exactly one explicitly activating account.
    c.execute("DELETE FROM v2_notification_devices WHERE device_id=? OR endpoint=?",(device,endpoint))
    c.execute("""INSERT INTO v2_notification_devices
                 (device_id,user_id,session_token,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?,?)""",
              (device,user_id,session_token,endpoint,p256dh,auth,now))
    acknowledge(c,user_id=user_id,now=now)


def deactivate(c, *, user_id, device):
    c.execute("DELETE FROM v2_notification_devices WHERE user_id=? AND device_id=?",
              (user_id,device_id(device)))
