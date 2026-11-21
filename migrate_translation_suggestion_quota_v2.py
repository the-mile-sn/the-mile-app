"""Explicit, additive PostgreSQL quota migration for the admin suggestions pilot.

NOT imported by WSGI, NOT called on boot, NEVER run automatically by CI/deploy.
Requires an operator to verify the database, backup and approvals beforehand.
"""
import os
import sys


def main():
    if (sys.argv[1:] != ["--apply"]
            or os.environ.get("MILE_MANUAL_QUOTA_MIGRATION_APPROVED") != "YES"
            or os.environ.get("MILE_SITE_ROLE") != "admin"
            or not os.environ.get("DATABASE_URL", "").startswith(
                ("postgresql://", "postgres://")
            )):
        print("REFUSED: requires --apply, explicit approval, admin role and PostgreSQL")
        return 2

    # Import only after explicit validation. Do not call app.initialize().
    import app
    import app_translation_suggestions_v2 as suggestions

    with app.connect() as c:
        suggestions.initialize_quota_schema(c)
        if not suggestions.quota_schema_ready(c):
            raise RuntimeError("quota schema verification failed")
        c.commit()
    print("Quota schema verified. No translation data or settings changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
