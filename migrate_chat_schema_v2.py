"""One-time, additive production chat schema migration.

Usage from the production Admin service Shell:
  python migrate_chat_schema_v2.py
  python migrate_chat_schema_v2.py --apply --backup-confirmed

The default invocation is read-only. The explicit apply mode checks for a
complete absence of chat tables, holds a transaction-scoped advisory lock,
creates only the chat domain tables/indexes from the canonical module,
validates the result, and commits once. Any error rolls back everything.
No user records, messages, notifications, or existing application tables
are changed; this does not enable the chat API.
"""
import argparse
import os
import sys

import psycopg

import chat_messaging_v2

EXPECTED_DATABASE = "the_mile_db"
CHAT_TABLES = (
    "v2_chat_conversations",
    "v2_chat_memberships",
    "v2_chat_messages",
    "v2_chat_read_state",
)
CHAT_INDEXES = ("v2_chat_memberships_user", "v2_chat_messages_order")
DEPENDENCIES = ("users", "v2_athletes", "v2_chef_links")


def assert_state(cur, expect_created=False):
    cur.execute("SELECT current_database(), current_schema()")
    db, schema = cur.fetchone()
    if db != EXPECTED_DATABASE or schema != "public":
        raise RuntimeError("Wrong database or schema; refusing to proceed")
    cur.execute(
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema='public'
           AND table_name = ANY(%s)""",
        (list(DEPENDENCIES + CHAT_TABLES),),
    )
    existing = {row[0] for row in cur.fetchall()}
    missing = set(DEPENDENCIES) - existing
    if missing:
        raise RuntimeError("Missing application prerequisites: " + ", ".join(sorted(missing)))
    chat_existing = set(CHAT_TABLES) & existing
    if expect_created:
        if chat_existing != set(CHAT_TABLES):
            raise RuntimeError("Chat tables not fully created; transaction will roll back")
        cur.execute(
            """SELECT indexname FROM pg_indexes
               WHERE schemaname='public' AND indexname = ANY(%s)""",
            (list(CHAT_INDEXES),),
        )
        indexes = {row[0] for row in cur.fetchall()}
        if indexes != set(CHAT_INDEXES):
            raise RuntimeError("Chat indexes not fully created; transaction will roll back")
    elif chat_existing:
        raise RuntimeError(
            "Chat schema already exists or is partially present ("
            + ", ".join(sorted(chat_existing))
            + "); refusing automatic migration"
        )
    return db


class ChatMigrationConnection:
    """Adapt canonical SQLite-style placeholders to psycopg (like app.PgConnection)."""

    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, sql, params=()):
        self.cursor.execute(sql.replace("?", "%s"), params)
        return self.cursor


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="Create schema in a single transaction")
    p.add_argument("--backup-confirmed", action="store_true", help="Confirm Render export completed")
    args = p.parse_args(argv)
    if args.apply and not args.backup_confirmed:
        p.error("--apply requires --backup-confirmed")
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL missing: refusing SQLite fallback")
    with psycopg.connect(url, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '5s'")
            cur.execute("SET LOCAL statement_timeout = '30s'")
            cur.execute("SELECT pg_try_advisory_xact_lock(794612, 20261121)")
            if not cur.fetchone()[0]:
                raise RuntimeError("Another chat migration is running")
            name = assert_state(cur)
            print("Preflight OK: matching production PostgreSQL, dependencies present, no chat tables")
            if not args.apply:
                conn.rollback()
                print("DRY RUN ONLY: no changes made")
                return 0
            chat_messaging_v2.initialize(ChatMigrationConnection(cur))
            assert_state(cur, expect_created=True)
            # A new chat domain must begin empty: never import old notifications.
            for table in CHAT_TABLES:
                cur.execute('SELECT COUNT(*) FROM public."' + table + '"')
                if cur.fetchone()[0] != 0:
                    raise RuntimeError("Unexpected chat data; transaction will roll back")
            conn.commit()
            print("MIGRATION COMMITTED: 4 empty tables, 2 indexes; chat API still disabled")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (psycopg.Error, RuntimeError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        sys.exit(1)
