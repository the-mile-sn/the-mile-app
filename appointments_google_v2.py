"""Google Calendar connection for The Mile appointments (phase 5.1).

This module only reads calendar metadata and occupied/free intervals.
It NEVER creates, changes, or deletes Google events. Nor does it store event
titles, attendees, locations, or descriptions. Professional authorization is
an explicit Google OAuth step, tied to an authenticated admin session.

Required server-only environment variables:
  MILE_GOOGLE_CLIENT_ID
  MILE_GOOGLE_CLIENT_SECRET
  MILE_GOOGLE_TOKEN_KEY  (Fernet key, never checked into Git)
  MILE_GOOGLE_REDIRECT_URI (optional; default documented below)

The disabled-by-default configuration protects current bookings until a
Google OAuth client has been configured and a professional has consented.
"""
import hashlib
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken

from appointments_catalog_v2 import ORG_ID

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDARS = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
GOOGLE_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy"
CALLBACK_PATH = "/api/v2/admin/appointments/google/callback"
DEFAULT_REDIRECT = "https://admin.themile.pt" + CALLBACK_PATH
SCOPES = (
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.freebusy",
)
_TIMEOUT = 7
_ACCESS_CACHE = {}
_CACHE_LOCK = threading.Lock()


class GoogleCalendarError(Exception):
    def __init__(self, code="google_unavailable"):
        self.code = code
        super().__init__(code)


def _settings():
    client = os.environ.get("MILE_GOOGLE_CLIENT_ID", "").strip()
    secret = os.environ.get("MILE_GOOGLE_CLIENT_SECRET", "").strip()
    key = os.environ.get("MILE_GOOGLE_TOKEN_KEY", "").strip()
    redirect = os.environ.get("MILE_GOOGLE_REDIRECT_URI", DEFAULT_REDIRECT).strip()
    try:
        parsed = urlparse(redirect)
        if parsed.scheme != "https" or parsed.path != CALLBACK_PATH or parsed.query or parsed.fragment or not parsed.netloc:
            return None
        Fernet(key.encode("ascii"))
    except (ValueError, TypeError, UnicodeError):
        return None
    if not client or not secret:
        return None
    return client, secret, key, redirect


def configured():
    """No partial connection is ever advertised as working."""
    return _settings() is not None


def _cipher():
    values = _settings()
    if not values:
        raise GoogleCalendarError("google_not_configured")
    return Fernet(values[2].encode("ascii"))


def _professional(c, org_id, professional_id):
    if not isinstance(professional_id, str) or not re.fullmatch(r"[0-9a-f]{32}", professional_id):
        raise LookupError("professional_not_found")
    row = c.execute(
        "SELECT id FROM appt_professionals WHERE org_id=? AND id=?",
        (org_id, professional_id),
    ).fetchone()
    if not row:
        raise LookupError("professional_not_found")
    return row


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_google_connections (
      org_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      refresh_secret TEXT NOT NULL,
      connected_at BIGINT NOT NULL,
      PRIMARY KEY(org_id,professional_id),
      FOREIGN KEY(org_id,professional_id) REFERENCES appt_professionals(org_id,id)
          ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appt_google_selections (
      org_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      blocks_slots INTEGER NOT NULL DEFAULT 0 CHECK(blocks_slots IN (0,1)),
      target_for_events INTEGER NOT NULL DEFAULT 0 CHECK(target_for_events IN (0,1)),
      PRIMARY KEY(org_id,professional_id,calendar_id),
      FOREIGN KEY(org_id,professional_id) REFERENCES appt_google_connections(org_id,professional_id)
          ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appt_google_oauth_states (
      state_hash TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      expires BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appt_google_oauth_state_expiry
      ON appt_google_oauth_states(expires);
    """)


def status(c, org_id, professional_id):
    _professional(c, org_id, professional_id)
    linked = c.execute(
        "SELECT connected_at FROM appt_google_connections WHERE org_id=? AND professional_id=?",
        (org_id, professional_id),
    ).fetchone()
    selections = c.execute(
        """SELECT calendar_id,blocks_slots,target_for_events FROM appt_google_selections
           WHERE org_id=? AND professional_id=? ORDER BY calendar_id""",
        (org_id, professional_id),
    ).fetchall()
    return {
        "configured": configured(),
        "connected": bool(linked),
        "connected_at": linked["connected_at"] if linked else None,
        "busy_calendar_ids": [r["calendar_id"] for r in selections if r["blocks_slots"]],
        "target_calendar_id": next(
            (r["calendar_id"] for r in selections if r["target_for_events"]), ""
        ),
        "busy_check_active": bool(linked and configured() and
                                  any(r["blocks_slots"] for r in selections)),
        "event_sync_active": False,
        "scope": "availability_only",
    }


def start_authorization(c, org_id, professional_id, admin_id):
    values = _settings()
    if not values:
        raise GoogleCalendarError("google_not_configured")
    _professional(c, org_id, professional_id)
    state = secrets.token_urlsafe(32)
    digest = hashlib.sha256(state.encode()).hexdigest()
    now = int(time.time())
    c.execute("DELETE FROM appt_google_oauth_states WHERE expires<=?", (now,))
    c.execute(
        """INSERT INTO appt_google_oauth_states
        (state_hash,org_id,professional_id,admin_id,expires) VALUES(?,?,?,?,?)""",
        (digest, org_id, professional_id, admin_id, now + 600),
    )
    qs = urlencode({
        "client_id": values[0],
        "redirect_uri": values[3],
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    })
    return GOOGLE_AUTH + "?" + qs


def consume_state(c, state, admin_id):
    if not isinstance(state, str) or not 35 <= len(state) <= 180:
        raise GoogleCalendarError("google_invalid_state")
    digest = hashlib.sha256(state.encode()).hexdigest()
    row = c.execute(
        """SELECT org_id,professional_id FROM appt_google_oauth_states
           WHERE state_hash=? AND admin_id=? AND expires>?""",
        (digest, admin_id, int(time.time())),
    ).fetchone()
    if not row:
        raise GoogleCalendarError("google_invalid_state")
    result = c.execute(
        "DELETE FROM appt_google_oauth_states WHERE state_hash=? AND admin_id=? AND expires>?",
        (digest, admin_id, int(time.time())),
    )
    if result.rowcount != 1:
        raise GoogleCalendarError("google_invalid_state")
    return row["org_id"], row["professional_id"]


def _request(url, method="GET", payload=None, token=None):
    """Only fixed Google-owned URLs are ever passed to this transport."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in (
        "oauth2.googleapis.com", "www.googleapis.com"
    ):
        raise GoogleCalendarError("google_unavailable")
    data = None
    headers = {"Accept": "application/json", "User-Agent": "TheMileAppointments/1"}
    if payload is not None:
        if method == "FORM":
            data = urlencode(payload).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            method = "POST"
        else:
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=_TIMEOUT) as response:
            blob = response.read(1_000_001)
        if len(blob) > 1_000_000:
            raise GoogleCalendarError("google_unavailable")
        value = json.loads(blob.decode("utf-8"))
        if not isinstance(value, dict):
            raise GoogleCalendarError("google_unavailable")
        return value
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeError,
            json.JSONDecodeError) as exc:
        raise GoogleCalendarError("google_unavailable") from None


def complete_authorization(c, org_id, professional_id, code):
    """Only called AFTER state consumption and session identity verification."""
    values = _settings()
    if not values:
        raise GoogleCalendarError("google_not_configured")
    _professional(c, org_id, professional_id)
    if not isinstance(code, str) or not 1 <= len(code) <= 4096:
        raise GoogleCalendarError("google_authorization_failed")
    result = _request(GOOGLE_TOKEN, "FORM", {
        "code": code,
        "client_id": values[0],
        "client_secret": values[1],
        "redirect_uri": values[3],
        "grant_type": "authorization_code",
    })
    if not set(SCOPES).issubset(set(result.get("scope", "").split())):
        raise GoogleCalendarError("google_missing_scope")
    refresh = result.get("refresh_token")
    if not isinstance(refresh, str) or not refresh or len(refresh) > 4096:
        raise GoogleCalendarError("google_missing_refresh_token")
    cipher = _cipher().encrypt(refresh.encode("utf-8")).decode("ascii")
    c.execute(
        """INSERT INTO appt_google_connections
        (org_id,professional_id,refresh_secret,connected_at) VALUES(?,?,?,?)
        ON CONFLICT(org_id,professional_id) DO UPDATE SET
        refresh_secret=EXCLUDED.refresh_secret,connected_at=EXCLUDED.connected_at""",
        (org_id, professional_id, cipher, int(time.time())),
    )
    # Reconnecting must NOT silently preserve choices from another account.
    c.execute(
        "DELETE FROM appt_google_selections WHERE org_id=? AND professional_id=?",
        (org_id, professional_id),
    )
    with _CACHE_LOCK:
        _ACCESS_CACHE.pop((org_id, professional_id), None)


def _refresh_token(c, org_id, professional_id):
    _professional(c, org_id, professional_id)
    row = c.execute(
        """SELECT refresh_secret FROM appt_google_connections
           WHERE org_id=? AND professional_id=?""",
        (org_id, professional_id),
    ).fetchone()
    if not row:
        raise GoogleCalendarError("google_not_connected")
    try:
        refresh = _cipher().decrypt(row["refresh_secret"].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError, UnicodeError):
        raise GoogleCalendarError("google_needs_reconnection") from None
    return refresh


def access_token(c, org_id, professional_id):
    refresh = _refresh_token(c, org_id, professional_id)
    key = (org_id, professional_id)
    with _CACHE_LOCK:
        cached = _ACCESS_CACHE.get(key)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
    values = _settings()
    response = _request(GOOGLE_TOKEN, "FORM", {
        "client_id": values[0],
        "client_secret": values[1],
        "refresh_token": refresh,
        "grant_type": "refresh_token",
    })
    token = response.get("access_token")
    expires = response.get("expires_in", 3600)
    if not isinstance(token, str) or not token or not isinstance(expires, (int, float)):
        raise GoogleCalendarError("google_needs_reconnection")
    with _CACHE_LOCK:
        _ACCESS_CACHE[key] = (token, time.time() + max(30, min(3600, int(expires))))
    return token


def _calendar_list(c, org_id, professional_id):
    token = access_token(c, org_id, professional_id)
    calendars = []
    cursor = ""
    for _ in range(5):
        query = {"maxResults": 250, "showHidden": "false"}
        if cursor:
            query["pageToken"] = cursor
        response = _request(GOOGLE_CALENDARS + "?" + urlencode(query), token=token)
        raw = response.get("items", [])
        if not isinstance(raw, list):
            raise GoogleCalendarError()
        for cal in raw:
            if not isinstance(cal, dict) or not isinstance(cal.get("id"), str):
                continue
            identifier = cal["id"]
            if not identifier or len(identifier) > 1024:
                continue
            calendars.append({
                "id": identifier,
                "name": str(cal.get("summary") or identifier)[:180],
                "primary": cal.get("primary") is True,
                "can_write": cal.get("accessRole") in ("writer", "owner"),
            })
        cursor = response.get("nextPageToken") or ""
        if not cursor:
            break
    if cursor:
        raise GoogleCalendarError("google_calendar_limit")
    return calendars


def calendars(c, org_id, professional_id):
    _professional(c, org_id, professional_id)
    current = status(c, org_id, professional_id)
    if not current["connected"]:
        raise GoogleCalendarError("google_not_connected")
    result = _calendar_list(c, org_id, professional_id)
    return {
        **current,
        "calendars": result,
    }


def save_selection(c, org_id, professional_id, data):
    if not isinstance(data, dict):
        raise ValueError("invalid_request")
    ids = data.get("busy_calendar_ids")
    target = data.get("target_calendar_id", "")
    if not isinstance(ids, list) or len(ids) < 1 or len(ids) > 40 or (
        not all(isinstance(x, str) and 0 < len(x) <= 1024 for x in ids)
    ) or len(set(ids)) != len(ids):
        raise ValueError("invalid_busy_calendars")
    if not isinstance(target, str) or len(target) > 1024:
        raise ValueError("invalid_target_calendar")
    allowed = {r["id"]: r for r in _calendar_list(c, org_id, professional_id)}
    if any(x not in allowed for x in ids):
        raise ValueError("invalid_busy_calendars")
    if target and (target not in allowed or not allowed[target]["can_write"]):
        raise ValueError("invalid_target_calendar")
    c.execute("DELETE FROM appt_google_selections WHERE org_id=? AND professional_id=?",
              (org_id, professional_id))
    for cid in sorted(set(ids) | ({target} if target else set())):
        c.execute("""INSERT INTO appt_google_selections
            (org_id,professional_id,calendar_id,blocks_slots,target_for_events)
            VALUES(?,?,?,?,?)""",
            (org_id, professional_id, cid, int(cid in ids), int(cid == target)))
    return status(c, org_id, professional_id)


def disconnect(c, org_id, professional_id):
    _professional(c, org_id, professional_id)
    c.execute("DELETE FROM appt_google_selections WHERE org_id=? AND professional_id=?",
              (org_id, professional_id))
    c.execute("DELETE FROM appt_google_connections WHERE org_id=? AND professional_id=?",
              (org_id, professional_id))
    with _CACHE_LOCK:
        _ACCESS_CACHE.pop((org_id, professional_id), None)


def busy_intervals(c, org_id, professional_id, start, end):
    """Fetch only UTC occupied windows, not event contents. Fail closed on error.

    If no calendar was deliberately selected to block slots, the calendar
    integration does not run, and the existing local scheduler is unchanged.
    """
    selected = [r["calendar_id"] for r in c.execute(
        """SELECT calendar_id FROM appt_google_selections
           WHERE org_id=? AND professional_id=? AND blocks_slots=1
           ORDER BY calendar_id""", (org_id, professional_id)).fetchall()]
    if not selected:
        return []
    if not (isinstance(start, datetime) and isinstance(end, datetime) and
            start.tzinfo and end.tzinfo and start < end and
            (end-start) <= timedelta(days=70)):
        raise ValueError("invalid_calendar_range")
    token = access_token(c, org_id, professional_id)
    data = _request(GOOGLE_FREEBUSY, "POST", {
        "timeMin": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "timeMax": end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "timeZone": "Europe/Lisbon",
        "items": [{"id": item} for item in selected],
    }, token=token)
    grouped = data.get("calendars")
    if not isinstance(grouped, dict):
        raise GoogleCalendarError()
    occupied = []
    for cid in selected:
        item = grouped.get(cid)
        if not isinstance(item, dict) or item.get("errors") or not isinstance(item.get("busy"), list):
            raise GoogleCalendarError()
        for period in item["busy"]:
            if not isinstance(period, dict) or not isinstance(period.get("start"), str) or not isinstance(period.get("end"), str):
                raise GoogleCalendarError()
            try:
                s = datetime.fromisoformat(period["start"].replace("Z", "+00:00"))
                e = datetime.fromisoformat(period["end"].replace("Z", "+00:00"))
            except ValueError:
                raise GoogleCalendarError() from None
            if not s.tzinfo or not e.tzinfo or s >= e:
                raise GoogleCalendarError()
            occupied.append((s.astimezone(timezone.utc), e.astimezone(timezone.utc)))
    return occupied
