"""The Mile / Backoffice translation migration preflight (READ ONLY).

Run from an authorized Render internal shell with the current code present.
The connection is opened with PostgreSQL transaction_read_only=on; every SQL
statement in audit() is a SELECT. No patient names, clinical notes, credentials,
raw recipes or private data appear in the report.

This is not a migration runner, backup validator, or authorization to deploy.
"""
import json
import os

REQUIRED = {
    "users": {"id": "text"},
    "v2_food_library": {
        "id": "text", "display_name": "text", "notes": "text",
        "category": "text", "active": "integer",
    },
    "v2_dish_library": {
        "id": "text", "name_pt": "text", "name_en": "text",
        "category": "text", "active": "integer",
    },
}
TRANSLATION_TABLES = (
    "v2_content_translations", "v2_content_translation_history",
)
OTHER_TABLES = (
    "v2_recipe_library", "v2_recipe_categories",
    "v2_supplement_library", "v2_food_plan_editor_publications",
    "v2_player_language_preferences",
)


def audit(c):
    """Return metadata/aggregates only; caller must use a read-only session."""
    row = c.execute("""
        SELECT current_schema(), current_setting('server_version'),
               current_setting('transaction_read_only'),
               has_schema_privilege(current_user, current_schema(), 'CREATE')
    """).fetchone()
    schema, pg_version, read_only, can_create = row
    # Safety gate: abort BEFORE querying content from a writable transaction.
    if read_only != "on":
        raise RuntimeError("preflight_must_use_read_only_transaction")
    names = sorted(set(REQUIRED) | set(TRANSLATION_TABLES) | set(OTHER_TABLES))
    rows = c.execute("""
        SELECT table_name,column_name,data_type
        FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name=ANY(%s)
        ORDER BY table_name,ordinal_position
    """, (names,)).fetchall()
    columns = {}
    for table, field, datatype in rows:
        columns.setdefault(table, {})[field] = datatype
    problems = []
    for table, expected in REQUIRED.items():
        if table not in columns:
            problems.append("required_table_missing:" + table)
        else:
            for field, dtype in expected.items():
                if columns[table].get(field) != dtype:
                    problems.append("expected_column_mismatch:" + table + "." + field)
    if not can_create:
        problems.append("database_role_lacks_create_on_schema")

    coverage = {}
    if not problems:
        coverage = {
            "active_foods": c.execute(
                "SELECT COUNT(*) FROM v2_food_library WHERE active=1").fetchone()[0],
            "active_foods_with_notes": c.execute("""
                SELECT COUNT(*) FROM v2_food_library
                WHERE active=1 AND notes IS NOT NULL
                  AND length(trim(notes))>0
            """).fetchone()[0],
            "active_dishes": c.execute(
                "SELECT COUNT(*) FROM v2_dish_library WHERE active=1").fetchone()[0],
            "dish_legacy_english_candidates": c.execute("""
                SELECT COUNT(*) FROM v2_dish_library WHERE active=1
                  AND name_en IS NOT NULL AND length(trim(name_en))>0
            """).fetchone()[0],
        }

    return {
        "purpose": "backoffice_translation_readonly_preflight",
        "db_engine": "PostgreSQL",
        "db_major": pg_version.split(".")[0],
        "schema": schema,
        "read_only": True,
        "existing_tables": {name: name in columns for name in names},
        "source_schema_compatible": not any(p.startswith(("required_table_missing",
                                   "expected_column_mismatch")) for p in problems),
        "permission_to_create": bool(can_create),
        "preflight_issues": problems,
        "coverage": coverage,
        "legacy_english_is_not_approved": True,
        "backup_restore_verified": False,
        "production_migration_performed": False,
    }


def main():
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("psycopg driver is not installed") from exc
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL missing; do not paste secrets into console")
    with psycopg.connect(
        url, options="-c default_transaction_read_only=on",
        connect_timeout=8,
    ) as c:
        # A READ ONLY transaction is also explicitly requested.
        with c.transaction():
            result = audit(c)
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
