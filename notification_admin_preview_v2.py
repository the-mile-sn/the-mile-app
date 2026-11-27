"""Read-only Admin preview. No send or schema installation endpoint."""
from datetime import date, timedelta
from notification_sources_v2 import (
    form_candidates, birthday_candidates, custom_recipients, active_players,
    weekly_menu_snapshot, document_assessment_inventory,
    recent_document_assessment_candidates,
)


def manual_content(c, scope, kind, recipient_id, target_id=None):
    """Explicit historical selection; never mislabel as a new publication."""
    if kind not in ("document","assessment"):raise ValueError("invalid_kind")
    player=next((p for p in active_players(c,authorised_athlete_ids=scope)
                 if p["recipient_id"]==recipient_id),None)
    if not player:return []
    if target_id is not None:
        targets={(recipient_id,kind):[target_id]}
    else:
        # IDs only: avoid loading PDFs belonging to another kind or player.
        if kind=="document":
            rows=c.execute("SELECT id FROM documents WHERE user_id=? AND folder<>'weekly' ORDER BY id",(recipient_id,)).fetchall()
        else:
            rows=c.execute("""SELECT id FROM v2_body_assessments WHERE athlete_id=?
                AND status='published' ORDER BY assessed_on DESC,id""",(player["athlete_id"],)).fetchall()
        targets={(recipient_id,kind):[r["id"] for r in rows]}
    from notification_store_v2 import content_notified
    items=document_assessment_inventory(c,authorised_athlete_ids=[player["athlete_id"]],targets=targets)
    return [{**i,"change_kind":"available","manual":True} for i in items
            if i["recipient_id"]==recipient_id and i["kind"]==kind and not content_notified(c,
               recipient_id=recipient_id,kind=kind,target_id=i["target_id"],version=i["version"])]


def preview(c, *, authorised_athlete_ids, kind, now, historical_recipient=None):
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
        players=active_players(c,authorised_athlete_ids=scope)
        recent=[i for i in items if i["kind"] == kind]
        if historical_recipient is None:
            return {"items":recent,"players":players}
        if not isinstance(historical_recipient,str):
            raise ValueError("invalid_recipient")
        selected=next((p for p in players if p["recipient_id"]==historical_recipient),None)
        if not selected:raise ValueError("invalid_recipient")
        # Load historical content only for the explicitly chosen player.
        historical=manual_content(c,scope,kind,selected["recipient_id"])
        recent_by_key={(i["recipient_id"],i["target_id"],i["version"]):i for i in recent}
        return {"items":[recent_by_key.get((i["recipient_id"],i["target_id"],i["version"]),i)
                         for i in historical],"players":players}
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
