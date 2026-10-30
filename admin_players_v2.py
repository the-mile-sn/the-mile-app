"""Read-only player management overview.

The individual player editor, account management and nutrition engines are
unchanged. Login eligibility is delegated to app.access_valid.
"""


def overview(c, today, access_is_valid):
    rows = c.execute("""
        SELECT a.id, a.name, a.weight_kg AS profile_weight,
               l.user_id, u.username, u.active, u.role,
               u.renewal_date, u.access_until,
               (u.photo IS NOT NULL) AS has_photo
          FROM v2_athletes a
          LEFT JOIN v2_player_links l ON l.athlete_id=a.id
          LEFT JOIN users u ON u.id=l.user_id AND u.role='player'
         ORDER BY a.name, a.id
    """).fetchall()

    next_matches = {}
    for row in c.execute("""
        SELECT athlete_id, match_date, match_time
          FROM v2_match_events
         WHERE match_date >= ?
         ORDER BY match_date, match_time
    """, (today,)).fetchall():
        next_matches.setdefault(row["athlete_id"], {
            "date": row["match_date"], "time": row["match_time"]
        })

    last_weights = {}
    for row in c.execute("""
        SELECT athlete_id, weigh_date, weight_kg
          FROM v2_daily_weighins
         WHERE weigh_date <= ?
         ORDER BY weigh_date DESC
    """, (today,)).fetchall():
        last_weights.setdefault(row["athlete_id"], {
            "date": row["weigh_date"], "weight_kg": row["weight_kg"]
        })

    # Audit entries created by players only: admin-imported values are not
    # presented as completed player forms.
    last_responses = {}
    for row in c.execute("""
        SELECT aud.athlete_id, aud.record_type, aud.created_at
          FROM v2_monitoring_audit aud
          JOIN users actor ON actor.id=aud.actor_id AND actor.role='player'
         WHERE aud.record_type IN ('weight','post_match')
         ORDER BY aud.created_at DESC, aud.id DESC
         LIMIT 2000
    """).fetchall():
        last_responses.setdefault(row["athlete_id"], {
            "type": row["record_type"], "timestamp": row["created_at"]
        })

    players = []
    for item in rows:
        row = dict(item)
        if not row["user_id"]:
            access = "no_account"
        elif not row["active"]:
            access = "inactive"
        elif not access_is_valid(row):
            access = "expired"
        else:
            access = "active"

        players.append({
            "id": row["id"],
            "name": row["name"],
            "username": row["username"],
            "user_id": row["user_id"],
            "has_photo": bool(row["has_photo"]),
            "access_status": access,
            "profile_weight": row["profile_weight"],
            "next_match": next_matches.get(row["id"]),
            "latest_weight": last_weights.get(row["id"]),
            "last_player_response": last_responses.get(row["id"]),
        })

    return {"players": players, "today": today, "read_only": True}
