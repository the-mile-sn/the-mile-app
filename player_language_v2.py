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

def presentation_language(c, user_id):
    """Do not show EN native labels until approved content is readable.

    The user's preference may be saved before the cross-service migration
    completes, but it must not create a mixed-language player experience.
    """
    import os
    if (os.environ.get("MILE_PLAYER_LANGUAGE_SELECTION_ENABLED") != "1"
            or os.environ.get("MILE_APP_TRANSLATIONS_ENABLED") != "1"):
        return "pt"
    import app_content_i18n_v2
    if not app_content_i18n_v2.translation_store_available(c):
        return "pt"
    return get(c, user_id)
