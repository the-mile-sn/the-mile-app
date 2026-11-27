"""Side-effect-free content candidate policy for manual notifications.

Inputs must come from authorised, currently visible content and a trusted
publication/change record, not from legacy notification or menu history alone.
No database, scheduler, application hooks, or sending.
"""
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json

CONTENT_KINDS = frozenset({"document", "assessment", "menu"})
CHANGE_KINDS = frozenset({"new", "updated"})


def content_version(public_content):
    """Canonical fingerprint of content, not a save timestamp."""
    raw = json.dumps(public_content, sort_keys=True, ensure_ascii=False,
                     separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


@dataclass(frozen=True)
class ContentCandidate:
    kind: str
    target_id: str
    recipient_id: str
    version: str
    visible: bool
    change_kind: str | None = None
    changed_at: datetime | None = None
    folder: str | None = None

    @property
    def notification_key(self):
        return (self.recipient_id, self.kind, self.target_id, self.version)


def _aware(value):
    return isinstance(value, datetime) and value.tzinfo is not None and value.utcoffset() is not None


def suggested_content(candidates, *, notified_keys, since, now):
    """Recent confirmed changes only; filter per recipient and content version.

    Unknown legacy publication times/types are not suggestions. The caller
    supplies the explicit recent window and filters recipient permissions.
    """
    if not _aware(since) or not _aware(now) or since > now:
        raise ValueError("invalid suggestion window")
    notified = set(notified_keys)
    seen = set()
    result = []
    for item in candidates:
        if item.kind not in CONTENT_KINDS or not item.visible:
            continue
        if item.kind == "document" and item.folder == "weekly":
            continue
        if item.change_kind not in CHANGE_KINDS or not _aware(item.changed_at):
            continue
        if not since <= item.changed_at <= now:
            continue
        if item.notification_key in notified or item.notification_key in seen:
            continue
        seen.add(item.notification_key)
        result.append(item)
    return sorted(result, key=lambda item: (item.changed_at, item.kind,
                       item.target_id, item.recipient_id), reverse=True)
