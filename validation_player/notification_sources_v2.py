"""Read-only sources for manual notification candidates.

The caller must pass the authorised athlete IDs resolved server-side.
No endpoint, scheduling, writes, commits or push delivery are installed.
"""
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from notification_policy_v2 import weight_reminder_eligible, latest_pending_match
from notification_content_policy_v2 import content_version, ContentCandidate, suggested_content


def active_players(c, *, authorised_athlete_ids):
    allowed = set(authorised_athlete_ids)
    if not allowed:
        return []
    return [dict(row) for row in c.execute("""
        SELECT a.id AS athlete_id, u.id AS recipient_id, u.name
        FROM v2_athletes a
        JOIN v2_player_links l ON l.athlete_id=a.id
        JOIN users u ON u.id=l.user_id
        WHERE a.archived_at IS NULL AND u.role='player' AND u.active=1
        ORDER BY u.name,u.id
    """).fetchall() if row["athlete_id"] in allowed]


def form_candidates(c, *, authorised_athlete_ids, kind, now):
    if kind not in ("game", "weight"):
        raise ValueError("invalid_form_kind")
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone_required")
    result = []
    for player in active_players(c, authorised_athlete_ids=authorised_athlete_ids):
        aid, uid = player["athlete_id"], player["recipient_id"]
        if kind == "weight":
            raw = c.execute("""
                SELECT MAX(weigh_date) AS last_date FROM v2_daily_weighins
                WHERE athlete_id=? AND weigh_date<=?
            """, (aid, now.date().isoformat())).fetchone()["last_date"]
            sent = c.execute("""
                SELECT MAX(created_at) AS last_sent FROM v2_manual_notifications
                WHERE recipient_id=? AND kind='weight'
            """, (uid,)).fetchone()["last_sent"]
            if weight_reminder_eligible(
                active=True, last_weigh_date=date.fromisoformat(raw) if raw else None,
                last_reminder_at=datetime.fromtimestamp(sent, timezone.utc) if sent is not None else None,
                now=now,
            ):
                result.append({**player, "kind": kind, "target_id": None,
                               "last_weigh_date": raw})
        else:
            matches = c.execute("""
                SELECT id,match_date FROM v2_match_events WHERE athlete_id=?
            """, (aid,)).fetchall()
            answers = c.execute("""
                SELECT match_id FROM v2_post_match_responses WHERE athlete_id=?
            """, (aid,)).fetchall()
            match_id = latest_pending_match(active=True, matches=matches,
                answered_match_ids=(r["match_id"] for r in answers), local_day=now.date())
            if match_id is not None:
                match_date = next(m["match_date"] for m in matches if m["id"] == match_id)
                result.append({**player, "kind": kind, "target_id": match_id,
                               "match_date": match_date})
    return result


def weekly_menu_snapshot(c, *, athlete_id, week_start, authorised_athlete_ids):
    """One snapshot per athlete and Monday; never use microcycle colours.

    Empty weeks return no candidate. Includes the current menu rows only,
    excluding meal execution, audit notes and timestamps. Translation and
    dish-library display changes are not yet part of this snapshot.
    """
    if athlete_id not in set(authorised_athlete_ids):
        raise PermissionError("athlete_not_authorised")
    if week_start.weekday() != 0:
        raise ValueError("monday_required")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=? AND archived_at IS NULL",
                     (athlete_id,)).fetchone():
        return None
    start = week_start.isoformat()
    end = (week_start + timedelta(days=6)).isoformat()
    rows = [dict(row) for row in c.execute("""
        SELECT menu_date,meal,kind,
               CASE WHEN kind='dish' AND dish_id IS NOT NULL THEN NULL ELSE value END AS value,
               CASE WHEN kind='dish' THEN dish_id ELSE NULL END AS dish_id
        FROM v2_weekly_menus WHERE athlete_id=? AND menu_date BETWEEN ? AND ?
        ORDER BY menu_date,meal
    """, (athlete_id,start,end)).fetchall()]
    if not rows:
        return None
    recipients = [dict(row) for row in c.execute("""
        SELECT u.id AS recipient_id,u.name,u.role
        FROM v2_player_links l JOIN users u ON u.id=l.user_id
        WHERE l.athlete_id=? AND u.role='player' AND u.active=1
        UNION ALL
        SELECT u.id AS recipient_id,u.name,u.role
        FROM v2_chef_links l JOIN users u ON u.id=l.user_id
        WHERE l.athlete_id=? AND l.archived_at IS NULL AND u.role='chef' AND u.active=1
        ORDER BY role,recipient_id
    """, (athlete_id,athlete_id)).fetchall()]
    target_id = athlete_id + ":" + start
    version = content_version(rows)
    notified = {r["recipient_id"] for r in c.execute("""
        SELECT recipient_id FROM v2_manual_notifications
        WHERE kind='menu' AND target_id=? AND content_version=?
    """, (target_id,version)).fetchall()}
    return {"athlete_id": athlete_id, "week_start": start, "target_id": target_id,
            "version": version, "meal_count": len(rows),
            "recipients": [{**r, "already_notified": r["recipient_id"] in notified}
                           for r in recipients]}


def document_version(row):
    return content_version({"folder":row["folder"],"title":row["title"],
                            "pdf_sha256":hashlib.sha256(bytes(row["data"])).hexdigest()})


def assessment_version(row):
    return content_version({"assessed_on":row["assessed_on"],
                            "measurements":json.loads(row["measurements"]),
                            "averages":json.loads(row["averages"]),
                            "formula_note":row["formula_note"]})


def document_assessment_inventory(c, *, authorised_athlete_ids, targets=None):
    """Current visible content only; do not infer publication from old timestamps.

    Document PDF bytes are hashed without being returned. Assessment drafts and
    weekly microcycle documents are excluded. The explicit manual selection
    may use this inventory, but recent suggestions require a change record.
    """
    result = []
    for player in active_players(c, authorised_athlete_ids=authorised_athlete_ids):
        aid, uid = player["athlete_id"], player["recipient_id"]
        account = c.execute("""
            SELECT menus_enabled,anthropometry_enabled FROM users WHERE id=?
        """, (uid,)).fetchone()
        if targets is None:
            docs = c.execute("""SELECT id,folder,title,data FROM documents
                WHERE user_id=? ORDER BY id""",(uid,)).fetchall()
        else:
            docs=[]
            for did in targets.get((uid,"document"),()):
                row=c.execute("""SELECT id,folder,title,data FROM documents
                    WHERE user_id=? AND id=?""",(uid,did)).fetchone()
                if row:docs.append(row)
        for row in docs:
            folder = row["folder"]
            allowed = (folder in ("nutrition", "other")
                       or (folder == "menus" and bool(account["menus_enabled"]))
                       or (folder == "anthropometry" and bool(account["anthropometry_enabled"])))
            if not allowed:
                continue
            version = document_version(row)
            result.append({**player, "kind": "document", "target_id": row["id"],
                           "folder": folder, "label": row["title"], "version": version})
        if targets is None:
            rows=c.execute("""SELECT id,assessed_on,measurements,averages,formula_note
                FROM v2_body_assessments WHERE athlete_id=? AND status='published'
                ORDER BY assessed_on DESC,id""",(aid,)).fetchall()
        else:
            rows=[]
            for aid_record in targets.get((uid,"assessment"),()):
                row=c.execute("""SELECT id,assessed_on,measurements,averages,formula_note
                    FROM v2_body_assessments WHERE athlete_id=? AND id=? AND status='published'""",
                    (aid,aid_record)).fetchone()
                if row:rows.append(row)
        for row in rows:
            version = assessment_version(row)
            result.append({**player, "kind": "assessment", "target_id": row["id"],
                           "folder": None, "label": row["assessed_on"], "version": version})
    return result


def recent_document_assessment_candidates(c, *, authorised_athlete_ids, since, now):
    """Intersect verified change events with current visible versions.

    Old content without a verified change event is available in the manual
    inventory only. Neither reading the inventory nor this function writes.
    """
    scope=set(authorised_athlete_ids)
    allowed={r["recipient_id"] for r in active_players(c,authorised_athlete_ids=scope)}
    if not allowed:return []
    events={}
    targets={}
    for row in c.execute("""SELECT recipient_id,kind,target_id,content_version,change_kind,changed_at
        FROM v2_notification_content_changes WHERE kind IN ('document','assessment')
        AND changed_at BETWEEN ? AND ?""",(int(since.timestamp()),int(now.timestamp()))).fetchall():
        uid,kind,target=row["recipient_id"],row["kind"],row["target_id"]
        if uid not in allowed:continue
        events[(uid,kind,target,row["content_version"])]=row
        targets.setdefault((uid,kind),set()).add(target)
    if not events:return []
    inventory = document_assessment_inventory(c, authorised_athlete_ids=scope, targets=targets)
    candidates, notified, details = [], set(), {}
    for item in inventory:
        key = (item["recipient_id"], item["kind"], item["target_id"], item["version"])
        details[key] = item
        event=events.get(key)
        if not event:
            continue
        candidates.append(ContentCandidate(
            item["kind"], item["target_id"], item["recipient_id"], item["version"],
            True, event["change_kind"], datetime.fromtimestamp(event["changed_at"], timezone.utc),
            item["folder"]))
        if c.execute("""
            SELECT 1 FROM v2_manual_notifications WHERE recipient_id=? AND kind=?
              AND target_id=? AND content_version=?
        """, key).fetchone():
            notified.add(key)
    return [{**details[item.notification_key], "change_kind": item.change_kind,
             "changed_at": item.changed_at.isoformat()}
            for item in suggested_content(candidates, notified_keys=notified,
                                          since=since, now=now)]


def birthday_candidates(c, *, authorised_athlete_ids, now):
    """Today's birthdays, active linked players only; one greeting per year.

    Uses the same calendar month/day as the existing dashboard. Feb 29 is
    not shifted to another day. Reading candidates never sends a greeting.
    """
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone_required")
    day = now.date()
    target_id = "birthday:" + str(day.year)
    result = []
    for player in active_players(c, authorised_athlete_ids=authorised_athlete_ids):
        uid = player["recipient_id"]
        row = c.execute("SELECT birth_date FROM users WHERE id=?", (uid,)).fetchone()
        try:
            birth = date.fromisoformat(row["birth_date"])
        except (TypeError, ValueError):
            continue
        if birth > day or (birth.month, birth.day) != (day.month, day.day):
            continue
        if c.execute("""
            SELECT 1 FROM v2_manual_notifications
            WHERE recipient_id=? AND kind='birthday' AND target_id=?
        """, (uid,target_id)).fetchone():
            continue
        first_name = player["name"].strip().split()
        if not first_name:
            continue
        result.append({**player, "kind": "birthday", "target_id": target_id,
                       "first_name": first_name[0]})
    return result


def custom_recipients(c, *, authorised_athlete_ids):
    """Active player/chef accounts, constrained to server-authorised athletes."""
    allowed = set(authorised_athlete_ids)
    players = [{**p, "role": "player"} for p in active_players(
        c, authorised_athlete_ids=allowed)]
    chefs = [dict(row) for row in c.execute("""
        SELECT a.id AS athlete_id,u.id AS recipient_id,u.name,u.role
        FROM v2_athletes a
        JOIN v2_chef_links l ON l.athlete_id=a.id
        JOIN users u ON u.id=l.user_id
        WHERE a.archived_at IS NULL AND l.archived_at IS NULL
          AND u.role='chef' AND u.active=1
        ORDER BY u.name,u.id
    """).fetchall() if row["athlete_id"] in allowed]
    return sorted(players + chefs, key=lambda p: (p["name"].casefold(), p["recipient_id"]))
