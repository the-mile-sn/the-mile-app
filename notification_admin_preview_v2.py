"""Read-only Admin preview. No send or schema installation endpoint."""
from datetime import date, timedelta
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
        cutoff = int((now-timedelta(days=7)).timestamp())
        recent = c.execute("""SELECT recipient_id,target_id,content_version,change_kind,changed_at
            FROM v2_notification_content_changes WHERE kind='menu'
            AND changed_at BETWEEN ? AND ?""",(cutoff,int(now.timestamp()))).fetchall()
        events={(r["recipient_id"],r["target_id"],r["content_version"]):dict(r) for r in recent}
        weeks={aid:{monday,monday+timedelta(days=7)} for aid in scope}
        for row in recent:
            aid,sep,week=row["target_id"].rpartition(":")
            if not sep or aid not in weeks:continue
            try:
                start=date.fromisoformat(week)
                if start.weekday()==0:weeks[aid].add(start)
            except ValueError:continue
        items = []
        for aid in sorted(scope):
            for week in sorted(weeks[aid]):
                menu = weekly_menu_snapshot(c, athlete_id=aid, week_start=week,
                                            authorised_athlete_ids=scope)
                if menu:
                    for recipient in menu["recipients"]:
                        if recipient["already_notified"]:continue
                        event=events.get((recipient["recipient_id"],menu["target_id"],menu["version"]))
                        if not event and week not in (monday,monday+timedelta(days=7)):continue
                        items.append({**recipient, "athlete_id":aid,
                            "target_id":menu["target_id"], "version":menu["version"],
                            "label":menu["week_start"], "kind":"menu",
                            "change_kind":event["change_kind"] if event else None,
                            "suggested":bool(event)})
        items.sort(key=lambda item:not item["suggested"])
        return {"items":items, "manual_selection":any(not i["suggested"] for i in items)}
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
