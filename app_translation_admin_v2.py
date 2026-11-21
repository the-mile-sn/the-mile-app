"""Opt-in admin-only translation review operations for existing Food/Dish fields.

This is NOT an HTTP endpoint and is not wired to the application.
The future HTTP boundary must enforce the existing authenticated session,
CSRF, HTTP method and SITE_ROLE before calling these operations.
Never accept source_text, actor_id or canonical table names from the request.
"""
import hashlib

import content_translations_v2 as translations


FIELDS = {
    ("food", "display_name"): ("v2_food_library", "display_name"),
    ("food", "notes"): ("v2_food_library", "notes"),
    ("dish", "name_pt"): ("v2_dish_library", "name_pt"),
}


def _admin(c, session_user):
    if not isinstance(session_user, dict):
        raise PermissionError("unauthorized")
    ident = session_user.get("id")
    if not isinstance(ident, str) or not ident or session_user.get("role") != "admin":
        raise PermissionError("forbidden")
    exists = c.execute(
        "SELECT id FROM users WHERE id=? AND role='admin' AND active=1",
        (ident,)).fetchone()
    if exists is None:
        raise PermissionError("forbidden")
    return ident


def _source(c, entity_kind, entity_id, field_path):
    """Lookup from strict SQL allowlist; source always comes from storage."""
    pair = (entity_kind, field_path)
    if pair not in FIELDS:
        raise ValueError("invalid_translation_field")
    if not isinstance(entity_id, str) or not 1 <= len(entity_id) <= 160:
        raise ValueError("invalid_translation_id")
    table, column = FIELDS[pair]
    # Safe: table/column come only from the constant allowlist above.
    row = c.execute(
        "SELECT " + column + " AS source_text FROM " + table +
        " WHERE id=? AND active=1", (entity_id,)).fetchone()
    if row is None:
        raise LookupError("content_not_found")
    text = row["source_text"]
    if not isinstance(text, str):
        raise ValueError("invalid_translation_source")
    return text


def _fingerprint(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _check_language(language):
    if language != "en":
        raise ValueError("invalid_translation_language")


def _body(body, required):
    if not isinstance(body, dict) or set(body) != set(required):
        raise ValueError("invalid_translation_payload")
    return body


def inspect(c, session_user, *, entity_kind, entity_id, field_path, language="en"):
    """Return current original + review candidate to an ACTIVE admin only."""
    _admin(c, session_user)
    _check_language(language)
    source_text = _source(c, entity_kind, entity_id, field_path)
    canonical_hash = _fingerprint(source_text)
    row = c.execute("""
        SELECT source_hash, translated_text, status, updated_at,
               updated_by, approved_at, approved_by
        FROM v2_content_translations
        WHERE entity_kind=? AND entity_id=? AND field_path=? AND language=?
    """, (entity_kind, entity_id, field_path, language)).fetchone()
    candidate = None
    if row:
        state = "outdated" if row["source_hash"] != canonical_hash else row["status"]
        candidate = {
            "text": row["translated_text"], "status": state,
            "candidate_hash": _fingerprint(row["translated_text"]),
            "source_hash": row["source_hash"],
            "updated_at": row["updated_at"], "updated_by": row["updated_by"],
            "approved_at": row["approved_at"], "approved_by": row["approved_by"]}
    return {
        "entity_kind": entity_kind, "entity_id": entity_id,
        "field_path": field_path, "language": language,
        "source_text": source_text, "source_hash": canonical_hash,
        "candidate": candidate,
        "effective": translations.resolve(
            c, entity_kind=entity_kind, entity_id=entity_id,
            field_path=field_path, source_text=source_text, language=language)}


def propose(c, session_user, body):
    """Store proposed EN text against CURRENT server-side Portuguese source.

    expected_source_hash supplies optimistic locking; reject stale editor.
    The full original Portuguese text is never read from the HTTP payload.
    """
    actor = _admin(c, session_user)
    b = _body(body, ("entity_kind", "entity_id", "field_path",
                     "language", "expected_source_hash", "translated_text"))
    _check_language(b["language"])
    source = _source(c, b["entity_kind"], b["entity_id"], b["field_path"])
    if b["expected_source_hash"] != _fingerprint(source):
        raise ValueError("translation_source_changed")
    result = translations.submit(
        c, entity_kind=b["entity_kind"], entity_id=b["entity_id"],
        field_path=b["field_path"], source_text=source,
        translated_text=b["translated_text"], actor_id=actor,
        language="en")
    return {**result, "entity_kind": b["entity_kind"], "entity_id": b["entity_id"],
            "field_path": b["field_path"]}


def approve(c, session_user, body):
    """Approve only the candidate the admin saw, for the current PT version.

    Approval is not automatic and cannot be requested by players or chefs.
    """
    actor = _admin(c, session_user)
    b = _body(body, ("entity_kind", "entity_id", "field_path",
                     "language", "expected_source_hash", "expected_candidate_hash"))
    _check_language(b["language"])
    source = _source(c, b["entity_kind"], b["entity_id"], b["field_path"])
    if b["expected_source_hash"] != _fingerprint(source):
        raise ValueError("translation_source_changed")
    if not isinstance(b["expected_candidate_hash"], str):
        raise ValueError("invalid_translation_candidate")
    return translations.approve(
        c, entity_kind=b["entity_kind"], entity_id=b["entity_id"],
        field_path=b["field_path"], source_text=source,
        reviewer_id=actor, language="en",
        expected_candidate_hash=b["expected_candidate_hash"])


def audit(c, session_user, *, entity_kind, entity_id, field_path,
          language="en", limit=50):
    """History is restricted to authenticated, active backoffice admins."""
    _admin(c, session_user)
    _check_language(language)
    _source(c, entity_kind, entity_id, field_path)
    return translations.history(
        c, entity_kind=entity_kind, entity_id=entity_id,
        field_path=field_path, language=language, limit=limit)
