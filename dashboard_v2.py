"""Read-only overview data for The Mile admin dashboard.

No schema changes or writes. Uses the same calendar classification and
effective-prescription resolver as the existing athlete calendar endpoint.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import calendar_v2
import events_v2
import day_colors_v2
import microcycles_v2
import prescription_effective_v2

MEALS = microcycles_v2.MEALS


def snapshot(c, week, today):
    first = calendar_v2.parse_day(week)
    current = calendar_v2.parse_day(today)
    if first.weekday() != 0 or abs((first - current).days) > 366:
        raise ValueError("invalid_dashboard_week")
    last = first + timedelta(days=6)
    start_iso, end_iso = first.isoformat(), last.isoformat()
    players = microcycles_v2.list_athletes(c)
    week_rows = []
    todays_games = []
    todays_events = []

    for athlete in players:
        aid = athlete["id"]
        model = microcycles_v2.get_model(c, aid)
        if model is None:
            continue
        matches = microcycles_v2.list_matches(c, aid)
        classifications = calendar_v2.classify_range(
            start_iso, end_iso, [m["match_date"] for m in matches])
        baseline = {r["name"]: r["meals"] for r in model["classifications"]}
        overrides = {
            (r["meal_date"], r["meal"]): r["color"]
            for r in day_colors_v2.list_colors(c, aid, start_iso, end_iso)
        }
        variants = {
            (r["classification"], r["scenario"], r["meal"]): r["color"]
            for r in c.execute(
                "SELECT classification,scenario,meal,color FROM v2_scenario_cells WHERE athlete_id=?",
                (aid,)).fetchall()
        }

        responses = []
        audits_by_record = {}
        for audit in c.execute(
            "SELECT id,record_type,record_id,new_json,created_at "
            "FROM v2_monitoring_audit WHERE athlete_id=? AND record_type='post_match' "
            "ORDER BY created_at,id", (aid,)).fetchall():
            raw = dict(audit)
            audits_by_record.setdefault(raw["record_id"], []).append(raw)
        for record in c.execute(
            "SELECT id,match_id,scenario,created_at "
            "FROM v2_post_match_responses WHERE athlete_id=?", (aid,)).fetchall():
            raw = dict(record)
            responses.append({
                "match_id": raw["match_id"],
                "revisions": prescription_effective_v2.revisions_from_audit(
                    raw, audits_by_record.get(raw["id"], []))
            })

        days = []
        for day in classifications:
            classification = day["classification"]
            effective = prescription_effective_v2.resolve_day(
                day["date"], classification, baseline.get(classification, {}),
                overrides, variants, matches, responses, today)
            days.append({
                "date": day["date"],
                "classification": classification,
                "colors": {meal: effective[meal]["color"] for meal in MEALS}
            })
        week_rows.append({"id": aid, "name": athlete["name"], "days": days})
        for match in matches:
            if match["match_date"] == today:
                todays_games.append({
                    "athlete_id": aid, "name": athlete["name"],
                    "match_id": match["id"], "time": match.get("match_time")
                })

        # Ordinary calendar events can supply real activities and reminders.
        # Do not repeat games or every regular training session in the overview.
        for event in events_v2.list_events(c, aid, today, today):
            if event["kind"] not in ("other", "travel"):
                continue
            todays_events.append({
                "athlete_id": aid, "name": athlete["name"],
                "event_id": event["id"], "kind": event["kind"],
                "title": event.get("title") or ("Viagem" if event["kind"] == "travel" else "Evento"),
                "session": event.get("session")
            })

    todays_games.sort(key=lambda x: (x["time"] is None, x["time"] or "", x["name"].lower()))
    todays_events.sort(key=lambda x: (x["session"] == "afternoon", x["name"].lower()))

    birthdays = []
    for row in c.execute(
        "SELECT a.id,a.name,u.birth_date FROM v2_athletes a "
        "JOIN v2_player_links l ON l.athlete_id=a.id "
        "JOIN users u ON u.id=l.user_id "
        "WHERE u.role='player' AND u.active=1 AND u.birth_date IS NOT NULL"
    ).fetchall():
        birth = row["birth_date"]
        if isinstance(birth, str) and len(birth) >= 10 and birth[5:10] == today[5:10]:
            birthdays.append({"athlete_id": row["id"], "name": row["name"]})
    birthdays.sort(key=lambda x: x["name"].lower())

    # Player-submitted forms only. Audit actor_id distinguishes an athlete's
    # submission from an administrator entering/correcting a monitoring record.
    # The timestamp is the latest PLAYER action, not an admin correction.
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())
    recent = [
        {
            "athlete_id": r["athlete_id"], "name": r["name"],
            "kind": "post_match", "timestamp": r["submitted_at"],
            "match_date": r["match_date"]
        }
        for r in c.execute(
            "SELECT a.id AS athlete_id,a.name,m.match_date,"
            " MAX(aud.created_at) AS submitted_at "
            "FROM v2_post_match_responses r "
            "JOIN v2_athletes a ON a.id=r.athlete_id "
            "JOIN v2_match_events m ON m.id=r.match_id AND m.athlete_id=r.athlete_id "
            "JOIN v2_monitoring_audit aud ON aud.athlete_id=r.athlete_id "
            "AND aud.record_type='post_match' AND aud.record_id=r.id "
            "JOIN users actor ON actor.id=aud.actor_id AND actor.role='player' "
            "WHERE aud.created_at>=? "
            "GROUP BY a.id,a.name,m.match_date,r.id "
            "ORDER BY submitted_at DESC LIMIT 40",
            (cutoff,)).fetchall()
    ]
    recent.extend([
        {
            "athlete_id": r["athlete_id"], "name": r["name"],
            "kind": "weight", "timestamp": r["submitted_at"],
            "weigh_date": r["weigh_date"], "weight_kg": r["weight_kg"]
        }
        for r in c.execute(
            "SELECT a.id AS athlete_id,a.name,w.weigh_date,w.weight_kg,"
            " MAX(aud.created_at) AS submitted_at "
            "FROM v2_daily_weighins w "
            "JOIN v2_athletes a ON a.id=w.athlete_id "
            "JOIN v2_monitoring_audit aud ON aud.athlete_id=w.athlete_id "
            "AND aud.record_type='weight' AND aud.record_id=w.id "
            "JOIN users actor ON actor.id=aud.actor_id AND actor.role='player' "
            "WHERE aud.created_at>=? "
            "GROUP BY a.id,a.name,w.weigh_date,w.weight_kg,w.id "
            "ORDER BY submitted_at DESC LIMIT 40",
            (cutoff,)).fetchall()
    ])
    recent.sort(key=lambda x: x["timestamp"], reverse=True)
    recent = recent[:8]

    weights = [
        {"athlete_id": r["athlete_id"], "name": r["name"], "weight_kg": r["weight_kg"]}
        for r in c.execute(
            "SELECT a.id AS athlete_id,a.name,w.weight_kg "
            "FROM v2_daily_weighins w JOIN v2_athletes a ON a.id=w.athlete_id "
            "WHERE w.weigh_date=? ORDER BY a.name",
            (today,)).fetchall()
    ]

    return {
        "week_start": start_iso, "week_end": end_iso, "today": today,
        "meals": list(MEALS),
        "players": week_rows,
        "today_events": {
            "games": todays_games, "birthdays": birthdays,
            "events": todays_events,
            "recent_responses": recent, "weighins": weights
        },
        "read_only": True
    }
