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
