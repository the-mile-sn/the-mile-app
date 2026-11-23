"""Authenticated player language preference; no UI or layout dependency.

The player's preferred language belongs to their own session, never to a
client-supplied athlete ID. Default remains pt-PT. This module does not touch
translations, prescriptions, or account permissions.
"""


def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_player_language_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        language TEXT NOT NULL DEFAULT 'pt' CHECK(language IN ('pt','en'))
    )""")


def get(c, user_id):
    row = c.execute(
        "SELECT language FROM v2_player_language_preferences WHERE user_id=?",
        (user_id,)).fetchone()
    return row["language"] if row and row["language"] in ("pt","en") else "pt"


def set_language(c, user_id, language):
    if language not in ("pt","en"):
        raise ValueError("invalid_language")
    c.execute("""INSERT INTO v2_player_language_preferences(user_id,language)
        VALUES(?,?) ON CONFLICT(user_id) DO UPDATE
        SET language=excluded.language""",(user_id,language))
    return language

def selection_available(c, user_id=None):
    """Gate the existing language control by feature flags and optional pilot user."""
    import os
    if (os.environ.get("MILE_PLAYER_LANGUAGE_SELECTION_ENABLED") != "1"
            or os.environ.get("MILE_APP_TRANSLATIONS_ENABLED") != "1"):
        return False
    # When this variable is present, the pilot fails closed for missing,
    # empty or unlisted usernames. Do not infer eligibility from a client input.
    if "MILE_PLAYER_I18N_PILOT_USERNAMES" in os.environ:
        allowed = {
            username.strip().casefold()
            for username in os.environ["MILE_PLAYER_I18N_PILOT_USERNAMES"].split(",")
            if username.strip()
        }
        if not user_id or not allowed:
            return False
        row = c.execute(
            "SELECT username FROM users WHERE id=? AND role='player' AND active=1",
            (user_id,)
        ).fetchone()
        if not row or not row["username"] or row["username"].casefold() not in allowed:
            return False
    import app_content_i18n_v2
    return app_content_i18n_v2.translation_store_available(c)


def presentation_language(c, user_id):
    """Never show a mixed-language UI while the content source is unavailable."""
    return get(c, user_id) if selection_available(c, user_id) else "pt"
