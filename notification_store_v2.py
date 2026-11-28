"""Proposed v2 notification store, independent of legacy notifications.

Explicit caller-owned transactions only. No import-time database access,
startup hooks, dispatch, timers, or scheduled work. The calling service
must authenticate the actor and validate recipient/target permissions,
eligibility, and language before inserting a notification.
"""

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS v2_notification_template_sources (
        template_key TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        updated_by TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS v2_notification_content_changes (
        recipient_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL CHECK(kind IN (\'document\',\'assessment\',\'menu\')),
        target_id TEXT NOT NULL,
        content_version TEXT NOT NULL,
        change_kind TEXT NOT NULL CHECK(change_kind IN (\'new\',\'updated\')),
        changed_at BIGINT NOT NULL,
        PRIMARY KEY(recipient_id,kind,target_id,content_version)
    )""",
    """CREATE TABLE IF NOT EXISTS v2_manual_notifications (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL REFERENCES users(id),
        sender_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL CHECK(kind IN ('game','weight','document','assessment','menu','birthday','custom')),
        language TEXT NOT NULL CHECK(language IN ('pt-PT','en-GB')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        target_id TEXT,
        content_version TEXT,
        created_at BIGINT NOT NULL,
        read_at BIGINT,
        push_status TEXT NOT NULL DEFAULT 'not_attempted'
            CHECK(push_status IN ('not_attempted','not_subscribed','accepted','failed','unknown')),
        UNIQUE(request_id, recipient_id),
        CHECK((kind IN ('document','assessment','menu') AND target_id IS NOT NULL
               AND content_version IS NOT NULL)
              OR (kind NOT IN ('document','assessment','menu') AND content_version IS NULL)),
        CHECK(kind NOT IN ('game','birthday') OR target_id IS NOT NULL)
    )""",
    """CREATE UNIQUE INDEX IF NOT EXISTS v2_manual_notifications_content_once
        ON v2_manual_notifications(recipient_id,kind,target_id,content_version)
        WHERE content_version IS NOT NULL""",
    """CREATE UNIQUE INDEX IF NOT EXISTS v2_manual_notifications_birthday_once
        ON v2_manual_notifications(recipient_id,target_id)
        WHERE kind='birthday' AND target_id IS NOT NULL""",
    """CREATE INDEX IF NOT EXISTS v2_manual_notifications_recipient_created
        ON v2_manual_notifications(recipient_id,created_at DESC)""",
    """CREATE INDEX IF NOT EXISTS v2_manual_notifications_sender_created
        ON v2_manual_notifications(sender_id,created_at DESC)""",
)


def initialize(c):
    """Explicit schema installation only; not connected to either live service."""
    for statement in SCHEMA:
        c.execute(statement)


def mark_read(c, *, notification_id, recipient_id, now):
    """Only the authenticated recipient can mark its own item read.

    The caller supplies the authenticated recipient ID, never a body parameter.
    The original read timestamp is preserved. Push acceptance is independent.
    """
    result = c.execute(
        """UPDATE v2_manual_notifications SET read_at=COALESCE(read_at,?)
           WHERE id=? AND recipient_id=?""",
        (now, notification_id, recipient_id),
    )
    return result.rowcount == 1


def content_notified(c, *, recipient_id, kind, target_id, version):
    return c.execute(
        """SELECT 1 FROM v2_manual_notifications
           WHERE recipient_id=? AND kind=? AND target_id=? AND content_version=?""",
        (recipient_id, kind, target_id, version),
    ).fetchone() is not None


def record_content_change(c, *, recipient_id, kind, target_id, previous_version,
                          current_version, changed_at):
    """Record a confirmed publication/change within an explicit caller transaction.

    previous_version=None is valid only for an actual first publication, not
    for an unknown historical version. Caller must establish that fact.
    Nothing is sent. No changes to existing content tables.
    """
    if kind not in ("document", "assessment", "menu"):
        raise ValueError("invalid_kind")
    if not current_version or previous_version == current_version:
        return False
    change_kind = "new" if previous_version is None else "updated"
    if previous_version is not None:
        prior = c.execute("""SELECT change_kind FROM v2_notification_content_changes
            WHERE recipient_id=? AND kind=? AND target_id=? AND content_version=?""",
            (recipient_id,kind,target_id,previous_version)).fetchone()
        sent = c.execute("""SELECT 1 FROM v2_manual_notifications
            WHERE recipient_id=? AND kind=? AND target_id=? LIMIT 1""",
            (recipient_id,kind,target_id)).fetchone()
        if prior and prior[0 if isinstance(prior,tuple) else "change_kind"]=="new" and not sent:
            change_kind="new"
    result = c.execute("""
        INSERT INTO v2_notification_content_changes
            (recipient_id,kind,target_id,content_version,change_kind,changed_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(recipient_id,kind,target_id,content_version) DO NOTHING
    """, (recipient_id,kind,target_id,current_version,
          change_kind,changed_at))
    return result.rowcount == 1
