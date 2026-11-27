"""Chef account foundation: isolated athlete association and safe role upgrade.

The players' existing users, sessions, roles and v2_player_links remain intact.
Never call these migration routines from a request handler.
"""
import re


def enable_role(c):
    """Allow chef in users.role without changing existing identities.

    PostgreSQL: alter only the existing role CHECK constraint.
    SQLite: preserve schema columns, data and explicitly created indexes/triggers
    in a single transaction; validate all foreign keys before committing.
    """
    if hasattr(c, "conn"):  # app.PgConnection
        rows = c.execute(
            "SELECT conname, pg_get_constraintdef(oid) AS definition "
            "FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c'"
        ).fetchall()
        checks = [row for row in rows if "role" in row["definition"].lower()]
        if not checks:
            # A legacy database without a role constraint may be upgraded
            # without touching existing rows.
            c.execute("ALTER TABLE users ADD CONSTRAINT users_role_check "
                      "CHECK (role IN ('admin','player','chef'))")
            return
        if len(checks) != 1:
            raise RuntimeError("Unexpected users role constraints; refusing migration")
        definition=checks[0]["definition"].lower()
        if "'chef'" in definition:
            return
        if "'admin'" not in definition or "'player'" not in definition:
            raise RuntimeError("Unexpected users role values; refusing migration")
        name=checks[0]["conname"].replace('"','""')
        c.execute('ALTER TABLE users DROP CONSTRAINT "'+name+'"')
        c.execute('ALTER TABLE users ADD CONSTRAINT "'+name+'" '
                  "CHECK (role IN ('admin','player','chef'))")
        return

    row = c.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    if not row:
        raise RuntimeError("Missing users table")
    ddl = row["sql"]
    if re.search(r"CHECK\s*\(\s*role\s+IN\s*\([^)]*'chef'", ddl, re.I):
        return
    pattern = r"CHECK\s*\(\s*role\s+IN\s*\(\s*'admin'\s*,\s*'player'\s*\)\s*\)"
    if not re.search(pattern, ddl, re.I):
        raise RuntimeError("Unexpected SQLite role constraint; refusing chef migration")
    # This is run before any business data changes during application startup.
    c.commit()
    c.execute("PRAGMA foreign_keys=OFF")
    try:
        if c.execute("PRAGMA foreign_keys").fetchone()[0] != 0:
            raise RuntimeError("Could not disable SQLite FK checks for atomic rebuild")
        c.execute("BEGIN IMMEDIATE")
        dependents = [
            item["sql"] for item in c.execute(
                "SELECT sql FROM sqlite_master "
                "WHERE type IN ('index','trigger') AND tbl_name='users' "
                "AND sql IS NOT NULL ORDER BY type,name"
            ).fetchall()
        ]
        new_ddl = re.sub(pattern, "CHECK(role IN ('admin','player','chef'))", ddl, count=1, flags=re.I)
        new_ddl = re.sub(r"^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"\[]?users[\"\]]?",
                         "CREATE TABLE users_chef_role_upgrade", new_ddl, count=1, flags=re.I)
        columns = [row["name"] for row in c.execute("PRAGMA table_info(users)").fetchall()]
        if not columns or "role" not in columns:
            raise RuntimeError("Users schema not recognized")
        escaped = ",".join('"' + col.replace('"','""') + '"' for col in columns)
        c.execute(new_ddl)
        c.execute(f"INSERT INTO users_chef_role_upgrade({escaped}) SELECT {escaped} FROM users")
        c.execute("DROP TABLE users")
        c.execute("ALTER TABLE users_chef_role_upgrade RENAME TO users")
        for sql in dependents:
            c.execute(sql)
        violations = c.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError("SQLite FK integrity check failed: migration rolled back")
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.execute("PRAGMA foreign_keys=ON")


def initialize(c):
    """Add isolated, non-destructive chef-to-athlete associations."""
    c.execute("""
        CREATE TABLE IF NOT EXISTS v2_chef_links (
            user_id TEXT PRIMARY KEY REFERENCES users(id),
            athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
            language TEXT NOT NULL DEFAULT 'pt' CHECK(language IN ('pt','en')),
            linked_at BIGINT NOT NULL,
            created_by TEXT NOT NULL REFERENCES users(id)
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS v2_chef_links_athlete ON v2_chef_links(athlete_id)")
    initialize_language_preferences(c)


def initialize_language_preferences(c):
    """Keep the Chef's own choice independent of the initial account language."""
    c.execute("""CREATE TABLE IF NOT EXISTS v2_chef_language_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        language TEXT NOT NULL CHECK(language IN ('pt','en'))
    )""")


def set_language_preference(c, chef_id, language):
    if type(language) is not str or language not in ('pt','en'):
        raise ValueError("invalid_language")
    c.execute("""INSERT INTO v2_chef_language_preferences(user_id,language)
        VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language""",
        (chef_id,language))


def list_accounts(c):
    return [dict(row) for row in c.execute("""
        SELECT u.id, u.name, u.username, u.active, l.language, l.athlete_id,
               a.name AS athlete_name
        FROM v2_chef_links l JOIN users u ON u.id=l.user_id AND u.role='chef'
        JOIN v2_athletes a ON a.id=l.athlete_id
        ORDER BY u.name,u.id
    """).fetchall()]


def assigned_athlete(c, chef_id):
    """Resolve scope from the authenticated actor; never accept a client athlete id."""
    return c.execute("""
        SELECT a.id,a.name,a.weight_kg,COALESCE(p.language,l.language) AS language
        FROM v2_chef_links l JOIN users u ON u.id=l.user_id
        LEFT JOIN v2_chef_language_preferences p ON p.user_id=l.user_id
        JOIN v2_athletes a ON a.id=l.athlete_id
        WHERE l.user_id=? AND u.role='chef' AND u.active=1
          AND a.archived_at IS NULL
    """, (chef_id,)).fetchone()
