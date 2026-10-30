"""Read-only overview data for The Mile admin dashboard.

No schema changes or writes. Uses the same calendar classification and
effective-prescription resolver as the existing athlete calendar endpoint.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import calendar_v2
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

    todays_games.sort(key=lambda x: (x["time"] is None, x["time"] or "", x["name"].lower()))

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

    # A recent response is the latest submitted or corrected post-match answer.
    cutoff = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())
    recent = [
        {
            "athlete_id": r["athlete_id"], "name": r["name"],
            "kind": "post_match", "timestamp": r["updated_at"],
            "match_date": r["match_date"]
        }
        for r in c.execute(
            "SELECT a.id AS athlete_id,a.name,r.updated_at,m.match_date "
            "FROM v2_post_match_responses r "
            "JOIN v2_athletes a ON a.id=r.athlete_id "
            "JOIN v2_match_events m ON m.id=r.match_id AND m.athlete_id=r.athlete_id "
            "WHERE r.updated_at>=? ORDER BY r.updated_at DESC LIMIT 8",
            (cutoff,)).fetchall()
    ]
    recent.extend([
        {
            "athlete_id": r["athlete_id"], "name": r["name"],
            "kind": "assessment", "timestamp": r["created_at"],
            "assessed_on": r["assessed_on"]
        }
        for r in c.execute(
            "SELECT a.id AS athlete_id,a.name,b.created_at,b.assessed_on "
            "FROM v2_body_assessments b "
            "JOIN v2_athletes a ON a.id=b.athlete_id "
            "WHERE b.status='published' AND b.created_at>=? "
            "ORDER BY b.created_at DESC LIMIT 8",
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
            "recent_responses": recent, "weighins": weights
        },
        "read_only": True
    }
