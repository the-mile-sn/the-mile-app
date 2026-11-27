"""Explicit manual notification preparation and persistence; no push dispatch.

Call only after authenticating the sender and deriving the allowed athlete
scope on the server. The caller owns the transaction and must serialize
concurrent notification writes before revalidating (including weight cooldown).
No startup hook, timer, background worker, endpoint or commit.
"""
import secrets
from notification_admin_preview_v2 import preview
from notification_templates_v2 import render_template

KINDS = frozenset(("game","weight","birthday","document","assessment","menu","custom"))


def recipient_locale(c, uid):
    row = c.execute("SELECT role FROM users WHERE id=? AND active=1",(uid,)).fetchone()
    if not row:
        raise ValueError("recipient_unavailable")
    if row["role"] == "player":
        preference = c.execute("""
            SELECT COALESCE(p.language,d.language,'pt') AS language
            FROM users u
            LEFT JOIN v2_player_language_preferences p ON p.user_id=u.id
            LEFT JOIN v2_player_language_defaults d ON d.user_id=u.id
            WHERE u.id=?
        """,(uid,)).fetchone()
    elif row["role"] == "chef":
        preference = c.execute("""
            SELECT COALESCE(p.language,l.language) AS language FROM v2_chef_links l
            LEFT JOIN v2_chef_language_preferences p ON p.user_id=l.user_id
            WHERE l.user_id=? AND l.archived_at IS NULL
        """,(uid,)).fetchone()
    else:
        raise ValueError("recipient_unavailable")
    if not preference or preference["language"] not in ("pt","en"):
        raise ValueError("invalid_recipient_locale")
    return {"pt":"pt-PT","en":"en-GB"}[preference["language"]]


def _key(item):
    return item["recipient_id"], item.get("target_id"), item.get("version")


def prepare(c, *, authorised_athlete_ids, kind, selections, now, custom_copy=None,
            menu_change=None):
    """Recompute candidates and reject stale or out-of-scope selections.

    One request contains one notification per recipient; separate requests
    can target distinct content for the same recipient. Menu classification
    remains an explicit choice until publication provenance is integrated.
    Custom text must be supplied in the recipient's language; no translation
    or silent cross-language fallback is performed here.
    """
    if kind not in KINDS or not isinstance(selections,list) or not 1<=len(selections)<=200:
        raise ValueError("invalid_selection")
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("timezone_required")
    eligible = {_key(item):item for item in preview(c,
        authorised_athlete_ids=authorised_athlete_ids,kind=kind,now=now)["items"]}
    result, seen = [], set()
    for selected in selections:
        if not isinstance(selected,dict):
            raise ValueError("invalid_selection")
        uid = selected.get("recipient_id")
        if not isinstance(uid,str) or uid in seen:
            raise ValueError("invalid_or_duplicate_recipient")
        target, version = selected.get("target_id"), selected.get("version")
        if any(v is not None and not isinstance(v,str) for v in (target,version)):
            raise ValueError("invalid_selection")
        item = eligible.get((uid,target,version))
        if item is None:
            raise ValueError("selection_no_longer_eligible")
        seen.add(uid)
        locale = recipient_locale(c,uid)
        if kind == "custom":
            copy = custom_copy.get(locale) if isinstance(custom_copy,dict) else None
            if not isinstance(copy,dict):
                raise ValueError("missing_custom_language")
            title, body = copy.get("title"), copy.get("body")
            if not isinstance(title,str) or not isinstance(body,str):
                raise ValueError("invalid_custom_copy")
            title, body = title.strip(), body.strip()
        else:
            key = kind
            if kind in ("document","assessment","menu"):
                change = item.get("change_kind") or (menu_change if kind == "menu" else None)
                if change not in ("new","updated"):
                    raise ValueError("missing_content_change")
                key += "_" + change
            title, body = render_template(key,locale,first_name=item.get("first_name"))
        if not 1<=len(title)<=120 or not 1<=len(body)<=1000:
            raise ValueError("invalid_message_length")
        result.append({"recipient_id":uid,"target_id":target,"version":version,
                       "kind":kind,"language":locale,"title":title,"body":body})
    return result


def record_manual(c, *, sender_id, request_id, authorised_athlete_ids, kind,
                  selections, now, custom_copy=None, menu_change=None, expected_digest=None):
    """Record confirmed selections atomically in the caller's transaction.

    A repeated request ID fails closed (no new rows). Caller must roll back
    on any error and never treat this function as proof of push delivery.
    """
    if not isinstance(request_id,str) or not 1<=len(request_id)<=120:
        raise ValueError("invalid_request_id")
    actor = c.execute("SELECT role,active FROM users WHERE id=?",(sender_id,)).fetchone()
    if not actor or actor["role"]!="admin" or not actor["active"]:
        raise PermissionError("sender_not_authorised")
    if c.execute("SELECT 1 FROM v2_manual_notifications WHERE request_id=?",
                 (request_id,)).fetchone():
        raise ValueError("request_already_recorded")
    rows = prepare(c,authorised_athlete_ids=authorised_athlete_ids,kind=kind,
                   selections=selections,now=now,custom_copy=custom_copy,
                   menu_change=menu_change)
    if expected_digest is not None:
        from notification_dispatch_v2 import confirmation_digest
        if confirmation_digest(rows)!=expected_digest:
            raise ValueError('confirmation_changed')
    ids=[]
    for row in rows:
        nid=secrets.token_hex(16)
        c.execute("""
            INSERT INTO v2_manual_notifications
                (id,request_id,recipient_id,sender_id,kind,language,title,body,
                 target_id,content_version,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
        """,(nid,request_id,row["recipient_id"],sender_id,kind,row["language"],
             row["title"],row["body"],row["target_id"],row["version"],int(now.timestamp())))
        ids.append(nid)
    return {"recorded_ids":ids,"push_attempted":False}
