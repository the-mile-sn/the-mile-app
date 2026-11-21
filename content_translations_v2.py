"""Opt-in PT -> EN translation store for The Mile application content.

This module is deliberately NOT connected to routes or startup yet.
It never modifies a food, a recipe, a plan, a clinical record or a publication.
Clients must obtain source_text from the canonical server-side data source.
"""

import hashlib
import re
import secrets
import time


_KIND = re.compile(r"^[a-z][a-z0-9_]{0,47}$")
_PATH = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,239}$")
_LANGUAGES = {"en"}
_MAX_TEXT = 10000


def initialize(c):
    """Additive, idempotent SQLite/PostgreSQL schema; no existing table altered."""
    c.execute("""
        CREATE TABLE IF NOT EXISTS v2_content_translations (
            entity_kind TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            language TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'approved')),
            updated_at BIGINT NOT NULL,
            updated_by TEXT NOT NULL,
            approved_at BIGINT,
            approved_by TEXT,
            PRIMARY KEY (entity_kind, entity_id, field_path, language)
        )
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS v2_content_translations_review
        ON v2_content_translations(language, status, updated_at)
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS v2_content_translation_history (
            id TEXT PRIMARY KEY,
            entity_kind TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            language TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('submitted', 'approved')),
            actor_id TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS v2_content_translation_history_lookup
        ON v2_content_translation_history(entity_kind, entity_id, field_path,
                                          language, created_at)
    """)


def _key(entity_kind, entity_id, field_path, language):
    if not isinstance(entity_kind, str) or not _KIND.fullmatch(entity_kind):
        raise ValueError("invalid_translation_entity")
    if not isinstance(entity_id, str) or not 1 <= len(entity_id) <= 160:
        raise ValueError("invalid_translation_id")
    if not isinstance(field_path, str) or not _PATH.fullmatch(field_path):
        raise ValueError("invalid_translation_field")
    if language not in _LANGUAGES:
        raise ValueError("invalid_translation_language")
    return entity_kind, entity_id, field_path, language


def _source_hash(source_text):
    if not isinstance(source_text, str) or len(source_text) > _MAX_TEXT:
        raise ValueError("invalid_translation_source")
    return hashlib.sha256(source_text.encode("utf-8")).hexdigest()


def _actor(actor_id):
    if not isinstance(actor_id, str) or not 1 <= len(actor_id.strip()) <= 160:
        raise ValueError("invalid_translation_actor")
    return actor_id.strip()


def _history(c, key, source_hash, translated_text, action, actor_id, timestamp):
    c.execute("""
        INSERT INTO v2_content_translation_history
            (id, entity_kind, entity_id, field_path, language, source_hash,
             translated_text, action, actor_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (secrets.token_hex(16), *key, source_hash,
          translated_text, action, actor_id, time.time_ns()))


def submit(c, *, entity_kind, entity_id, field_path, source_text,
           translated_text, actor_id, language="en"):
    """Store a proposal only; replacing an approval always revokes that approval.

    The caller MUST read source_text from the trusted original record, never
    accept a browser-supplied source as authoritative.
    """
    key = _key(entity_kind, entity_id, field_path, language)
    source_hash = _source_hash(source_text)
    actor_id = _actor(actor_id)
    if (not source_text.strip() or not isinstance(translated_text, str)
            or not translated_text.strip() or len(translated_text) > _MAX_TEXT):
        raise ValueError("invalid_translation_text")
    timestamp = int(time.time())
    c.execute("""
        INSERT INTO v2_content_translations
            (entity_kind, entity_id, field_path, language, source_hash,
             translated_text, status, updated_at, updated_by, approved_at, approved_by)
        VALUES (?,?,?,?,?,?,'pending',?,?,NULL,NULL)
        ON CONFLICT (entity_kind, entity_id, field_path, language) DO UPDATE SET
            source_hash=excluded.source_hash,
            translated_text=excluded.translated_text,
            status='pending',
            updated_at=excluded.updated_at,
            updated_by=excluded.updated_by,
            approved_at=NULL,
            approved_by=NULL
    """, (*key, source_hash, translated_text, timestamp, actor_id))
    _history(c, key, source_hash, translated_text, "submitted", actor_id, timestamp)
    return {"status": "pending", "source_hash": source_hash}


def approve(c, *, entity_kind, entity_id, field_path, source_text,
            reviewer_id, language="en", expected_candidate_hash=None):
    """Approve only a proposal matching the current canonical Portuguese text."""
    key = _key(entity_kind, entity_id, field_path, language)
    current_hash = _source_hash(source_text)
    reviewer_id = _actor(reviewer_id)
    row = c.execute("""
        SELECT source_hash, translated_text, status
        FROM v2_content_translations
        WHERE entity_kind=? AND entity_id=? AND field_path=? AND language=?
    """, key).fetchone()
    if row is None:
        raise ValueError("translation_missing")
    if row["source_hash"] != current_hash:
        raise ValueError("translation_source_changed")
    if expected_candidate_hash is not None:
        if (not isinstance(expected_candidate_hash, str) or
                hashlib.sha256(row["translated_text"].encode("utf-8")).hexdigest()
                != expected_candidate_hash):
            raise ValueError("translation_changed_during_review")
    if row["status"] == "approved":
        return {"status": "approved", "source_hash": current_hash}
    timestamp = int(time.time())
    result = c.execute("""
        UPDATE v2_content_translations
        SET status='approved', approved_at=?, approved_by=?
        WHERE entity_kind=? AND entity_id=? AND field_path=? AND language=?
          AND source_hash=? AND status='pending' AND translated_text=?
    """, (timestamp, reviewer_id, *key, current_hash, row["translated_text"]))
    if result.rowcount != 1:
        raise ValueError("translation_changed_during_review")
    _history(c, key, current_hash, row["translated_text"],
             "approved", reviewer_id, timestamp)
    return {"status": "approved", "source_hash": current_hash}


def resolve(c, *, entity_kind, entity_id, field_path, source_text, language="pt"):
    """Presentation-only lookup. Never changes an original or writes to the DB.

    'pt' always returns the source. An absent, pending or stale English
    translation always falls back to that exact source, fail-closed.
    """
    _source_hash(source_text)
    if language == "pt":
        return {"text": source_text, "status": "original", "language": "pt"}
    key = _key(entity_kind, entity_id, field_path, language)
    row = c.execute("""
        SELECT source_hash, translated_text, status
        FROM v2_content_translations
        WHERE entity_kind=? AND entity_id=? AND field_path=? AND language=?
    """, key).fetchone()
    if row is None:
        return {"text": source_text, "status": "missing", "language": "pt"}
    if row["source_hash"] != _source_hash(source_text):
        return {"text": source_text, "status": "outdated", "language": "pt"}
    if row["status"] != "approved":
        return {"text": source_text, "status": "pending", "language": "pt"}
    return {"text": row["translated_text"], "status": "approved", "language": language}


def history(c, *, entity_kind, entity_id, field_path, language="en", limit=50):
    """Internal audit accessor; callers must enforce admin permissions."""
    key = _key(entity_kind, entity_id, field_path, language)
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("invalid_translation_limit")
    return [dict(row) for row in c.execute("""
        SELECT source_hash, translated_text, action, actor_id, created_at
        FROM v2_content_translation_history
        WHERE entity_kind=? AND entity_id=? AND field_path=? AND language=?
        ORDER BY created_at DESC, id DESC LIMIT ?
    """, (*key, limit)).fetchall()]
