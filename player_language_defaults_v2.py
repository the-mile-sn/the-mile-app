"""Backoffice-owned initial language (never the player's own chosen preference).

Two services share this table; the backoffice writes the starting language,
the player app reads it only if no explicit player preference exists.
"""


def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_player_language_defaults (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        language TEXT NOT NULL DEFAULT 'pt' CHECK(language IN ('pt','en'))
    )""")


def get(c, user_id):
    if not user_id:
        return None
    row = c.execute(
        "SELECT language FROM v2_player_language_defaults WHERE user_id=?",
        (user_id,)).fetchone()
    return row["language"] if row and row["language"] in ("pt", "en") else "pt"


def set_initial(c, user_id, language):
    if type(language) is not str or language not in ("pt", "en"):
        raise ValueError("invalid_initial_language")
    c.execute("""INSERT INTO v2_player_language_defaults(user_id,language)
        VALUES(?,?) ON CONFLICT(user_id) DO UPDATE
        SET language=excluded.language""", (user_id, language))
    return language
