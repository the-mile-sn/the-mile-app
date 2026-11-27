"""Read-only sources for manual notification candidates.

The caller must pass the authorised athlete IDs resolved server-side.
No endpoint, scheduling, writes, commits or push delivery are installed.
"""
from datetime import date, datetime, timedelta, timezone
from notification_policy_v2 import weight_reminder_eligible, latest_pending_match
from notification_content_policy_v2 import content_version


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
