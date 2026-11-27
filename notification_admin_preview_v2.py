"""Read-only Admin preview. No send or schema installation endpoint."""
from datetime import timedelta
from notification_sources_v2 import (
    form_candidates, birthday_candidates, custom_recipients,
    weekly_menu_snapshot, document_assessment_inventory,
    recent_document_assessment_candidates,
)


def preview(c, *, authorised_athlete_ids, kind, now):
    scope = set(authorised_athlete_ids)
    if kind in ("game", "weight"):
        return {"items": form_candidates(c, authorised_athlete_ids=scope, kind=kind, now=now)}
    if kind == "birthday":
        return {"items": birthday_candidates(c, authorised_athlete_ids=scope, now=now)}
    if kind == "custom":
        return {"items": custom_recipients(c, authorised_athlete_ids=scope)}
    if kind in ("document", "assessment"):
        items = recent_document_assessment_candidates(c, authorised_athlete_ids=scope,
                    since=now-timedelta(days=7), now=now)
        return {"items": [i for i in items if i["kind"] == kind]}
    if kind == "menu":
        monday = now.date()-timedelta(days=now.date().weekday())
        items = []
        for aid in sorted(scope):
            for week in (monday, monday+timedelta(days=7)):
                menu = weekly_menu_snapshot(c, athlete_id=aid, week_start=week,
                                            authorised_athlete_ids=scope)
                if menu:
                    for recipient in menu["recipients"]:
                        if not recipient["already_notified"]:
                            items.append({**recipient, "athlete_id":aid,
                                "target_id":menu["target_id"], "version":menu["version"],
                                "label":menu["week_start"], "kind":"menu"})
        return {"items":items, "manual_selection":True}
    if kind == "history":
        allowed = {r["recipient_id"] for r in custom_recipients(c,authorised_athlete_ids=scope)}
        rows = c.execute("""
            SELECT n.id,n.recipient_id,u.name,n.title,n.kind,n.created_at,n.read_at,
                   n.push_status,s.name AS sender_name
            FROM v2_manual_notifications n
            JOIN users u ON u.id=n.recipient_id JOIN users s ON s.id=n.sender_id
            ORDER BY n.created_at DESC,n.id DESC
        """).fetchall()
        return {"items":[dict(r) for r in rows if r["recipient_id"] in allowed][:100]}
    raise ValueError("invalid_notification_kind")
