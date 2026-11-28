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


def unread_count(c, recipient_id):
    return int(c.execute("SELECT COUNT(*) AS n FROM v2_manual_notifications WHERE recipient_id=? AND read_at IS NULL",(recipient_id,)).fetchone()["n"])


def mark_all_read(c, recipient_id, now):
    c.execute("UPDATE v2_manual_notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL",(now,recipient_id))


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


def destination(c, *, user, item):
    """Resolve current authorised content; never accept a URL from a payload."""
    from datetime import date, timedelta
    kind, target = item["kind"], item["target_id"]
    uid, role = user["id"], user["role"]
    if role not in ("player","chef"):
        return None
    table = "v2_player_links" if role == "player" else "v2_chef_links"
    extra = "" if role == "player" else " AND l.archived_at IS NULL"
    link=c.execute("SELECT a.id FROM "+table+" l JOIN v2_athletes a ON a.id=l.athlete_id "
                   "WHERE l.user_id=? AND a.archived_at IS NULL"+extra,(uid,)).fetchone()
    if not link:
        return None
    aid=link["id"]
    if kind=="weight" and role=="player":
        return {"kind":"weight"}
    if kind=="game" and role=="player" and target:
        row=c.execute("SELECT match_date FROM v2_match_events WHERE id=? AND athlete_id=?",
                      (target,aid)).fetchone()
        return {"kind":"game","id":target,"date":row["match_date"]} if row else {"kind":"game"}
    if kind=="assessment" and role=="player" and target:
        row=c.execute("""SELECT id,assessed_on FROM v2_body_assessments
                         WHERE id=? AND athlete_id=? AND status='published'""",(target,aid)).fetchone()
        return {"kind":"assessment","id":target,"date":row["assessed_on"]} if row else {"kind":"assessment"}
    if kind=="document" and role=="player" and target:
        row=c.execute("SELECT folder FROM documents WHERE id=? AND user_id=?",(target,uid)).fetchone()
        if not row:
            return None
        folder=row["folder"]
        if folder in ("nutrition","other") or (folder=="menus" and user["menus_enabled"]) or (
                folder=="anthropometry" and user["anthropometry_enabled"]):
            return {"kind":"document","id":target}
        return None
    if kind=="menu" and isinstance(target,str):
        athlete,sep,week=target.rpartition(":")
        try:
            start=date.fromisoformat(week)
        except ValueError:
            return None
        if not sep or athlete!=aid or start.weekday()!=0:
            return None
        row=c.execute("""SELECT 1 FROM v2_weekly_menus
                         WHERE athlete_id=? AND menu_date BETWEEN ? AND ? LIMIT 1""",
                      (aid,week,(start+timedelta(days=6)).isoformat())).fetchone()
        return {"kind":"menu","week":week} if row else {"kind":"menu"}
    return None
