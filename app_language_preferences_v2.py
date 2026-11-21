"""Opt-in per-user language preferences; not connected to app.py.

Players use a new additive table. Chefs read existing v2_chef_links.language;
chef writes remain exclusively with the existing /api/v2/chef/preferences.
Neither plan snapshots nor application session data are modified.
All callers must supply the user object from a *verified server session*.
"""
import time

LANGUAGES = ("pt", "en")


def initialize(c):
    """Create player preferences only, safe to call repeatedly on SQLite/PG."""
    c.execute("""
        CREATE TABLE IF NOT EXISTS v2_player_language_preferences (
            user_id TEXT PRIMARY KEY REFERENCES users(id),
            language TEXT NOT NULL DEFAULT 'pt' CHECK(language IN ('pt','en')),
            updated_at BIGINT NOT NULL
        )
    """)


def _identity(c, session_user):
    """Server-side verification: user must match an active player or chef."""
    if not isinstance(session_user, dict):
        raise PermissionError("unauthorized")
    user_id = session_user.get("id")
    role = session_user.get("role")
    if not isinstance(user_id, str) or not user_id or role not in ("player", "chef"):
        raise PermissionError("forbidden")
    row = c.execute(
        "SELECT id,role FROM users WHERE id=? AND role=? AND active=1",
        (user_id, role)).fetchone()
    if row is None:
        raise PermissionError("forbidden")
    return user_id, role


def _chef_language(c, user_id):
    row = c.execute("""
        SELECT l.language
        FROM v2_chef_links l
        JOIN v2_athletes a ON a.id=l.athlete_id
        WHERE l.user_id=? AND l.archived_at IS NULL AND a.archived_at IS NULL
    """, (user_id,)).fetchone()
    if row is None:
        raise PermissionError("chef_unlinked")
    if row["language"] not in LANGUAGES:
        raise ValueError("invalid_stored_language")
    return row["language"]


def read(c, session_user):
    user_id, role = _identity(c, session_user)
    if role == "chef":
        return {"language": _chef_language(c, user_id), "role": "chef"}
    row = c.execute(
        "SELECT language FROM v2_player_language_preferences WHERE user_id=?",
        (user_id,)).fetchone()
    language = row["language"] if row else "pt"
    if language not in LANGUAGES:
        raise ValueError("invalid_stored_language")
    return {"language": language, "role": "player"}


def save(c, session_user, language):
    """Persist only PT/EN for self. Transaction commit belongs to API boundary.

    Existing /api/v2/chef/preferences is intentionally left unchanged; once
    wired, the same chef link remains the only language source of truth.
    """
    if language not in LANGUAGES:
        raise ValueError("invalid_language")
    user_id, role = _identity(c, session_user)
    if role == "chef":
        _chef_language(c, user_id)
        # Existing /api/v2/chef/preferences owns all chef language writes.
        # Refuse a second write path rather than risking divergence.
        raise ValueError("use_existing_chef_preferences_endpoint")
    c.execute("""
        INSERT INTO v2_player_language_preferences(user_id,language,updated_at)
        VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
            language=excluded.language, updated_at=excluded.updated_at
    """, (user_id, language, int(time.time())))
    return {"language": language, "role": role}
