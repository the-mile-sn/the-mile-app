"""Explicit additive notification migration, disabled by default.

Run only from the production Admin service after review and a verified backup.
Default is read-only. --apply --backup-confirmed creates the new domain once.
Never imports legacy subscriptions, sends notifications or enables flags.
"""
import argparse
import os
import sys
import psycopg
from psycopg.rows import dict_row
import notification_store_v2 as store
import notification_activation_v2 as activation

EXPECTED_DATABASE = "the_mile_db"
DEPENDENCIES = {"users", "sessions", "v2_athletes", "v2_player_links",
                "v2_chef_links", "v2_content_translations", "v2_content_translation_history"}
COLUMNS = {
    "v2_notification_template_sources": {"template_key","title","body","updated_at","updated_by"},
    "v2_notification_content_changes": {"recipient_id","kind","target_id","content_version","change_kind","changed_at"},
    "v2_manual_notifications": {"id","request_id","recipient_id","sender_id","kind","language","title","body",
                               "target_id","content_version","created_at","read_at","push_status"},
    "v2_notification_activation": {"user_id","prompted_at"},
    "v2_notification_devices": {"device_id","user_id","session_token","endpoint","p256dh","auth","created_at"},
}
INDEXES = {"v2_manual_notifications_content_once","v2_manual_notifications_birthday_once",
           "v2_manual_notifications_recipient_created","v2_manual_notifications_sender_created",
           "v2_notification_devices_user"}

class Connection:
    def __init__(self,conn): self.conn=conn
    def execute(self,sql,params=()):
        return self.conn.execute(sql.replace("?","%s"),params if params else None)

def preflight(c):
    info=c.execute("SELECT current_database() AS db,current_schema() AS schema").fetchone()
    if info["db"]!=EXPECTED_DATABASE or info["schema"]!="public":
        raise RuntimeError("Unexpected database/schema; refusing migration")
    tables={r["table_name"] for r in c.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'").fetchall()}
    if not DEPENDENCIES<=tables:
        raise RuntimeError("Missing prerequisites: "+", ".join(sorted(DEPENDENCIES-tables)))
    present=set(COLUMNS)&tables
    if present and present!=set(COLUMNS):
        raise RuntimeError("Partial notification schema; manual review required")
    if present: verify_layout(c)
    return bool(present)

def verify_layout(c):
    rows=c.execute("""SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public'""").fetchall()
    for table,expected in COLUMNS.items():
        found={r["column_name"] for r in rows if r["table_name"]==table}
        if found!=expected:raise RuntimeError("Unexpected notification table layout: "+table)
    indexes={r["indexname"] for r in c.execute("SELECT indexname FROM pg_indexes WHERE schemaname='public'").fetchall()}
    if not INDEXES<=indexes:raise RuntimeError("Notification indexes missing")
    row=c.execute("""SELECT count(*) AS n FROM pg_constraint
        WHERE conrelid='public.v2_notification_devices'::regclass
        AND confrelid='public.sessions'::regclass AND contype='f'
        AND confupdtype='c' AND confdeltype='c'""").fetchone()
    if row["n"]!=1:raise RuntimeError("Session cascade constraint missing")
    for table,column in (("v2_notification_devices","user_id"),("v2_notification_activation","user_id"),
                         ("v2_manual_notifications","recipient_id"),("v2_notification_content_changes","recipient_id")):
        row=c.execute("""SELECT count(*) AS n FROM pg_constraint f
          JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=ANY(f.conkey)
          WHERE f.conrelid=?::regclass AND f.confrelid='public.users'::regclass
          AND f.contype='f' AND f.confdeltype='c' AND a.attname=?""",("public."+table,column)).fetchone()
        if row["n"]!=1:raise RuntimeError("Recipient deletion cascade missing: "+table)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--backup-confirmed",action="store_true")
    args=parser.parse_args()
    if args.apply and not args.backup_confirmed:parser.error("--apply requires --backup-confirmed")
    url=os.environ.get("DATABASE_URL","").strip()
    if not url:raise RuntimeError("DATABASE_URL required; no SQLite fallback")
    if args.apply and any(os.environ.get(name)=="1" for name in (
            "MILE_NOTIFICATIONS_PREVIEW","MILE_NOTIFICATIONS_CAPTURE","MILE_NOTIFICATIONS_SEND",
            "MILE_NOTIFICATIONS_PUSH_SEND","MILE_NOTIFICATIONS_INBOX","MILE_NOTIFICATIONS_PUSH")):
        raise RuntimeError("Disable notification flags before migration")
    with psycopg.connect(url,row_factory=dict_row,connect_timeout=10) as conn:
        c=Connection(conn)
        if not args.apply:c.execute("SET TRANSACTION READ ONLY")
        c.execute("SET LOCAL lock_timeout = '5s'")
        c.execute("SET LOCAL statement_timeout = '30s'")
        if args.apply and not c.execute("SELECT pg_try_advisory_xact_lock(794612,20261128) AS ok").fetchone()["ok"]:
            raise RuntimeError("Migration lock unavailable")
        exists=preflight(c)
        if not args.apply:
            conn.rollback()
            print("READ ONLY: notification schema "+("already present; layout checked" if exists else "absent; prerequisites present"))
            return
        if exists:raise RuntimeError("Schema already present; no automatic changes")
        store.initialize(c)
        activation.initialize(c)
        verify_layout(c)
        for name in COLUMNS:
            if c.execute('SELECT count(*) AS n FROM public."'+name+'"').fetchone()["n"]:
                raise RuntimeError("New notification tables must start empty")
        conn.commit()
        print("MIGRATION COMMITTED: five empty notification tables; no flags enabled")

if __name__=="__main__":
    try: main()
    except (RuntimeError,psycopg.Error) as exc:
        print("STOP:",type(exc).__name__,file=sys.stderr)
        if isinstance(exc,RuntimeError):print(str(exc),file=sys.stderr)
        sys.exit(1)
