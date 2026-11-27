"""Recipient-owned notification inbox, separate from the legacy API.

No dispatch, scheduling, initialization or commits are performed here.
The application must supply the authenticated recipient ID.
"""
import re


def inbox(c, recipient_id):
    return [dict(row) for row in c.execute("""
        SELECT id,title,body,kind,language,target_id,created_at,read_at
        FROM v2_manual_notifications WHERE recipient_id=?
        ORDER BY created_at DESC,id DESC LIMIT 150
    """,(recipient_id,)).fetchall()]


def open_notification(c, *, recipient_id, notification_id, now):
    if not isinstance(notification_id,str) or not re.fullmatch(r"[0-9a-f]{32}",notification_id):
        return None
    from notification_store_v2 import mark_read
    if not mark_read(c,notification_id=notification_id,recipient_id=recipient_id,now=now):
        return None
    row=c.execute("""
        SELECT id,title,body,kind,language,target_id,created_at,read_at
        FROM v2_manual_notifications WHERE id=? AND recipient_id=?
    """,(notification_id,recipient_id)).fetchone()
    return dict(row) if row else None
