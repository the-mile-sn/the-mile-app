"""The Mile private document portal. WSGI; standard-library application."""
import base64
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import re
import secrets
import sqlite3
import microcycles_v2
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None


def shift_native_splash_down(png, shift=68):
    """Move the existing monochrome iOS launch artwork down without changing its size."""
    import struct
    import zlib
    import binascii

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', binascii.crc32(tag + data) & 0xffffffff)

    if png[:8] != b'\x89PNG\r\n\x1a\n':
        return png
    pos = 8
    header = None
    compressed = bytearray()
    while pos + 12 <= len(png):
        length = struct.unpack_from('>I', png, pos)[0]
        tag = png[pos + 4:pos + 8]
        data = png[pos + 8:pos + 8 + length]
        pos += 12 + length
        if tag == b'IHDR':
            header = data
        elif tag == b'IDAT':
            compressed.extend(data)
        elif tag == b'IEND':
            break
    if header is None:
        return png
    width, height, depth, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', header)
    if colour != 0 or depth != 1 or interlace != 0:
        return png
    stride = (width + 7) // 8
    raw = zlib.decompress(bytes(compressed))
    rows = []
    previous = bytearray(stride)
    offset = 0
    for _ in range(height):
        kind = raw[offset]
        scan = bytearray(raw[offset + 1:offset + 1 + stride])
        offset += stride + 1
        for j in range(stride):
            left = scan[j - 1] if j else 0
            up = previous[j]
            upper_left = previous[j - 1] if j else 0
            if kind == 1:
                predictor = left
            elif kind == 2:
                predictor = up
            elif kind == 3:
                predictor = (left + up) // 2
            elif kind == 4:
                p = left + up - upper_left
                da, db, dc = abs(p - left), abs(p - up), abs(p - upper_left)
                predictor = left if da <= db and da <= dc else up if db <= dc else upper_left
            elif kind == 0:
                predictor = 0
            else:
                return png
            scan[j] = (scan[j] + predictor) & 255
        rows.append(bytes(scan))
        previous = scan
    shift = min(max(shift, 0), height)
    black = bytes(stride)
    output = b''.join(b'\x00' + row for row in ([black] * shift + rows[:height - shift]))
    return png[:8] + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(output, 9)) + chunk(b'IEND', b'')


ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('MILE_DATA_DIR', ROOT / 'data')).resolve()
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
BASE_URL = os.environ.get('MILE_BASE_URL', 'http://localhost:8000').strip().rstrip('/')
ALLOWED_ORIGINS = {BASE_URL, 'https://the-mile-app.onrender.com'}
ALLOWED_ORIGIN_HOSTS = {h for h in (urlparse(x).hostname for x in ALLOWED_ORIGINS) if h}
ALLOWED_ORIGIN_HOSTS.update({'app.themile.pt', 'the-mile-app.onrender.com', 'the-mile-app-test.onrender.com'})
SECURE = BASE_URL.startswith('https://')
MAX_PDF = 20 * 1024 * 1024
MAX_JSON = 5 * 1024 * 1024
MAX_PHOTO = 3 * 1024 * 1024
FOLDERS = ('nutrition', 'menus', 'other', 'anthropometry', 'weekly')
ADMINS = (('Filipe Sousa', 'filipesousa@themile.pt'), ('Raquel Gomes', 'raquelgomes@themile.pt'))
WEIGHT_FORM_M = os.environ.get('MILE_WEIGHT_FORM_M', 'https://forms.gle/iRhSJ8zkqgUy2eye7').strip()
WEIGHT_FORM_F = os.environ.get('MILE_WEIGHT_FORM_F', 'https://forms.gle/AAc9xFmZE4vrYLbw9').strip()
GAME_FORM = os.environ.get('MILE_GAME_FORM', 'https://forms.gle/NFmz3rLNJmC44VGC8').strip()
USERNAME_RE = re.compile(r'^[a-z]+$')


def connect():
    if DATABASE_URL:
        if psycopg is None:
            raise RuntimeError('DATABASE_URL is set but psycopg is not installed')
        return PgConnection(psycopg.connect(DATABASE_URL, row_factory=dict_row))
    logging.warning('TEST_DB_TRACE before_sqlite_open')
    import faulthandler
    faulthandler.dump_traceback_later(8, repeat=False)
    try:
        c = sqlite3.connect(DATA / 'mile.sqlite3', timeout=20)
    finally:
        faulthandler.cancel_dump_traceback_later()
    logging.warning('TEST_DB_TRACE after_sqlite_open')
    c.row_factory = sqlite3.Row
    logging.warning('TEST_DB_TRACE before_foreign_keys')
    c.execute('PRAGMA foreign_keys = ON')
    logging.warning('TEST_DB_TRACE after_foreign_keys')
    return c


class PgCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()


class PgConnection:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()

    def execute(self, sql, params=()):
        sql = sql.replace('?', '%s')
        if sql.startswith('INSERT OR IGNORE INTO users'):
            sql = sql.replace('INSERT OR IGNORE INTO users', 'INSERT INTO users', 1) + ' ON CONFLICT (email) DO NOTHING'
        elif sql.startswith('INSERT OR REPLACE INTO attempts'):
            sql = 'INSERT INTO attempts(key,count,until_time) VALUES(%s,%s,%s) ON CONFLICT (key) DO UPDATE SET count=EXCLUDED.count, until_time=EXCLUDED.until_time'
        return PgCursor(self.conn.execute(sql, params))

    def executescript(self, script):
        self.conn.execute(script)

    def commit(self):
        self.conn.commit()


def initialize():
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    with connect() as c:
        if DATABASE_URL:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','player')), password TEXT, active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires BIGINT NOT NULL);
            CREATE TABLE IF NOT EXISTS activations(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL);
            CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), folder TEXT NOT NULL, title TEXT NOT NULL, size BIGINT NOT NULL, updated BIGINT NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), data BYTEA NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_time BIGINT NOT NULL);
            CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created BIGINT NOT NULL);
            CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL, category TEXT NOT NULL, document_id TEXT, folder TEXT, created BIGINT NOT NULL, read_at BIGINT, document_opened_at BIGINT, created_by TEXT REFERENCES users(id));
            CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id,created DESC);

            ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS sex TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS height DOUBLE PRECISION;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS menus_enabled INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropometry_enabled INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS photo BYTEA;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_mime TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_name TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS renewal_date TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_status TEXT NOT NULL DEFAULT 'waiting';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_next_activate_at BIGINT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS current_weekly_document_id TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS access_until TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL;
            ''')
        else:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','player')), password TEXT, active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS activations(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), folder TEXT NOT NULL, title TEXT NOT NULL, size INTEGER NOT NULL, updated INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), data BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_time INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL, category TEXT NOT NULL, document_id TEXT, folder TEXT, created INTEGER NOT NULL, read_at INTEGER, document_opened_at INTEGER, created_by TEXT REFERENCES users(id));
            CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id,created DESC);

            ''')
            existing = {r['name'] for r in c.execute('PRAGMA table_info(users)').fetchall()}
            additions = {
                'username': 'TEXT',
                'birth_date': 'TEXT',
                'sex': 'TEXT',
                'height': 'REAL',
                'weight': 'REAL',
                'menus_enabled': 'INTEGER NOT NULL DEFAULT 0',
                'anthropometry_enabled': 'INTEGER NOT NULL DEFAULT 0',
                'photo': 'BLOB',
                'photo_mime': 'TEXT',
                'plan_name': 'TEXT',
                'renewal_date': 'TEXT',
                'weekly_status': "TEXT NOT NULL DEFAULT 'waiting'",
                'weekly_next_activate_at': 'INTEGER',
                'current_weekly_document_id': 'TEXT',
                'access_until': 'TEXT',
            }
            for column, spec in additions.items():
                if column not in existing:
                    c.execute(f'ALTER TABLE users ADD COLUMN {column} {spec}')
            c.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL')
        microcycles_v2.initialize(c)
        c.execute("UPDATE documents SET folder='weekly' WHERE folder='weekly_next'")
        c.execute("UPDATE users SET weekly_next_activate_at=NULL")
        c.execute("""UPDATE users SET current_weekly_document_id=(SELECT d.id FROM documents d WHERE d.user_id=users.id AND d.folder='weekly' ORDER BY d.updated DESC LIMIT 1) WHERE role='player' AND weekly_status='available' AND current_weekly_document_id IS NULL""")
        for name, email in ADMINS:
            c.execute('INSERT OR IGNORE INTO users(id,name,email,role) VALUES(?,?,?,?)', (secrets.token_hex(16), name, email, 'admin'))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(value):
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1)
    return salt.hex() + ':' + key.hex()


def password_valid(value, stored):
    if not stored:
        hashlib.scrypt(value.encode(), salt=b'\0' * 16, n=16384, r=8, p=1)
        return False
    salt, key = stored.split(':')
    actual = hashlib.scrypt(value.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, key)


def activation(c, user_id):
    token = secrets.token_urlsafe(32)
    c.execute('DELETE FROM activations WHERE user_id=?', (user_id,))
    c.execute('INSERT INTO activations VALUES(?,?,?)', (digest(token), user_id, int(time.time()) + 86400))
    return BASE_URL + '/?activate=' + quote(token)


def parse_photo(value):
    if not isinstance(value, str) or not value.startswith('data:image/'):
        raise Problem(400, 'photo')
    try:
        header, encoded = value.split(',', 1)
        mime = header.split(';', 1)[0][5:]
        if mime not in ('image/jpeg', 'image/png', 'image/webp'):
            raise ValueError
        blob = base64.b64decode(encoded, validate=True)
    except Exception:
        raise Problem(400, 'photo')
    if not blob or len(blob) > MAX_PHOTO:
        raise Problem(400, 'photo')
    return blob, mime


def clean_player_payload(body, require_password=False, require_photo=False):
    name = str(body.get('name', '')).strip()
    username = str(body.get('username', '')).strip().lower()
    password = body.get('password', '')
    birth_date = str(body.get('birth_date', '')).strip()
    sex = str(body.get('sex', '')).strip().upper()
    plan_name = str(body.get('plan_name', '')).strip()
    renewal_date = str(body.get('renewal_date', '')).strip()
    try:
        height = float(body.get('height'))
        weight = float(body.get('weight'))
    except (TypeError, ValueError):
        raise Problem(400, 'user_fields')
    if not name or len(name) > 120 or not USERNAME_RE.fullmatch(username):
        raise Problem(400, 'user_fields')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', birth_date) or sex not in ('M', 'F'):
        raise Problem(400, 'user_fields')
    if not plan_name or len(plan_name) > 80 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', renewal_date):
        raise Problem(400, 'user_fields')
    if not (50 <= height <= 250) or not (20 <= weight <= 300):
        raise Problem(400, 'user_fields')
    if require_password and (not isinstance(password, str) or len(password) < 8 or len(password) > 256):
        raise Problem(400, 'password_length')
    if password and (not isinstance(password, str) or len(password) < 8 or len(password) > 256):
        raise Problem(400, 'password_length')
    menus_enabled = body.get('menus_enabled')
    anthropometry_enabled = body.get('anthropometry_enabled')
    if not isinstance(menus_enabled, bool) or not isinstance(anthropometry_enabled, bool):
        raise Problem(400, 'user_fields')
    photo = None
    photo_mime = None
    if body.get('photo'):
        photo, photo_mime = parse_photo(body.get('photo'))
    elif require_photo:
        raise Problem(400, 'photo')
    return {
        'name': name, 'username': username, 'password': password, 'birth_date': birth_date,
        'sex': sex, 'height': height, 'weight': weight, 'plan_name': plan_name, 'renewal_date': renewal_date,
        'menus_enabled': int(menus_enabled), 'anthropometry_enabled': int(anthropometry_enabled),
        'photo': photo, 'photo_mime': photo_mime,
    }



def send_player_push(c, user_id, title, message, notification_id):
    """Deliver a push to each subscribed device without affecting in-app storage."""
    private = os.environ.get('MILE_VAPID_PRIVATE_KEY_B64', '')
    if not private:
        return
    try:
        from pywebpush import webpush, WebPushException
        from cryptography.hazmat.primitives import serialization
        key = serialization.load_pem_private_key(base64.b64decode(private), password=None)
        der = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        private_key = base64.urlsafe_b64encode(der).rstrip(b'=').decode('ascii')
        subscriptions = c.execute(
            "SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?", (user_id,)).fetchall()
        logging.warning('Push attempt: subscribed devices=%d', len(subscriptions))
        for sub in subscriptions:
            try:
                response = webpush(
                    subscription_info={'endpoint':sub['endpoint'],'keys':{'p256dh':sub['p256dh'],'auth':sub['auth']}},
                    data=json.dumps({'title':title,'body':message,'id':notification_id},ensure_ascii=False),
                    vapid_private_key=private_key,
                    vapid_claims={'sub':'mailto:themile.sn@gmail.com'},
                    timeout=8)
                logging.warning('Push gateway response status=%s', getattr(response, 'status_code', None))
            except WebPushException as exc:
                status = getattr(getattr(exc,'response',None),'status_code',None)
                if status in (404,410):
                    c.execute("DELETE FROM push_subscriptions WHERE endpoint=?",(sub['endpoint'],))
                else:
                    logging.warning('Push delivery failed (status %s)',status)
            except Exception:
                logging.exception('Push delivery failure')
        c.commit()
    except Exception:
        logging.exception('Push dispatch unavailable')


def create_due_renewal_notifications(c, today=None):
    """Create idempotent in-app renewal reminders based on Lisbon calendar days."""
    today = today or datetime.now(ZoneInfo('Europe/Lisbon')).date()
    now = int(time.time())
    players = c.execute("SELECT id,renewal_date FROM users WHERE role='player' AND active=1 AND renewal_date IS NOT NULL AND renewal_date<>''").fetchall()
    created = 0
    for player in players:
        try:
            renewal = datetime.strptime(player['renewal_date'], '%Y-%m-%d').date()
        except (TypeError, ValueError):
            continue
        remaining = (renewal - today).days
        if remaining == 7:
            stage = 'before'
            title = 'Renovação do acompanhamento'
            message = 'O teu acompanhamento The Mile aproxima-se da data de renovação.'
        elif remaining == -1:
            stage = 'after'
            title = 'Renovação pendente'
            message = 'O teu acompanhamento The Mile aguarda renovação. Contacta a nossa equipa para regularizares a situação.'
        else:
            continue
        identity = 'renewal:' + player['id'] + ':' + player['renewal_date'] + ':' + stage
        nid = hashlib.sha256(identity.encode('utf-8')).hexdigest()[:32]
        exists = c.execute("SELECT id FROM notifications WHERE id=?", (nid,)).fetchone()
        if exists:
            continue
        c.execute(
            "INSERT INTO notifications(id,user_id,title,message,category,document_id,folder,created,read_at,document_opened_at,created_by) VALUES(?,?,?,?,?,NULL,NULL,?,NULL,NULL,NULL) ON CONFLICT(id) DO NOTHING",
            (nid, player['id'], title, message, 'renewal', now))
        c.commit()
        send_player_push(c, player['id'], title, message, nid)
        created += 1
    c.commit()
    return created


def start_renewal_notification_scheduler():
    """Best-effort daily check in the paid web process, independent of logins."""
    import threading

    def loop():
        last_checked = None
        while True:
            day = datetime.now(ZoneInfo('Europe/Lisbon')).date()
            if day != last_checked:
                try:
                    with connect() as c:
                        create_due_renewal_notifications(c, day)
                    last_checked = day
                except Exception:
                    logging.exception('Renewal notification check failed')
            time.sleep(3600)

    threading.Thread(target=loop, name='mile-renewal-check', daemon=True).start()


def access_valid(row):
    if row['role'] != 'player':
        return True
    reference = row['access_until'] or row['renewal_date']
    if not reference:
        return True
    try:
        deadline = datetime.strptime(reference, '%Y-%m-%d').date()
        if not row['access_until']:
            deadline += timedelta(days=7)
    except (TypeError, ValueError):
        return False
    return datetime.now(ZoneInfo('Europe/Lisbon')).date() <= deadline


def player_dict(row, include_private=True):
    data = {
        'id': row['id'], 'name': row['name'], 'username': row['username'], 'role': row['role'],
        'active': bool(row['active']), 'access_expired': not access_valid(row), 'menus_enabled': bool(row['menus_enabled']),
        'anthropometry_enabled': bool(row['anthropometry_enabled']),
        'has_photo': bool(row['photo_mime']),
    }
    if include_private:
        data.update({
            'birth_date': row['birth_date'], 'sex': row['sex'], 'height': row['height'], 'weight': row['weight'],
            'plan_name': row['plan_name'], 'renewal_date': row['renewal_date'], 'access_until': row['access_until'], 'weekly_status': row['weekly_status'],
            'weekly_next_activate_at': row['weekly_next_activate_at'], 'current_weekly_document_id': row['current_weekly_document_id'],
        })
    return data



def next_weekly_activation(now=None):
    tz = ZoneInfo('Europe/Lisbon')
    current = datetime.now(tz) if now is None else datetime.fromtimestamp(now, tz)
    days = (7 - current.weekday()) % 7
    target_date = current.date() + timedelta(days=days)
    target = datetime(target_date.year, target_date.month, target_date.day, 0, 1, tzinfo=tz)
    if target <= current:
        target += timedelta(days=7)
    return int(target.timestamp())


def activate_due_weekly(c, uid=None, now=None):
    now = int(time.time()) if now is None else int(now)
    if uid:
        users = c.execute("SELECT id,weekly_next_activate_at FROM users WHERE id=? AND role='player'", (uid,)).fetchall()
    else:
        users = c.execute("SELECT id,weekly_next_activate_at FROM users WHERE role='player' AND weekly_next_activate_at IS NOT NULL AND weekly_next_activate_at<=?", (now,)).fetchall()
    changed = False
    for row in users:
        activate_at = row['weekly_next_activate_at']
        if not activate_at or int(activate_at) > now:
            continue
        nxt = c.execute("SELECT id FROM documents WHERE user_id=? AND folder='weekly_next' ORDER BY updated DESC LIMIT 1", (row['id'],)).fetchone()
        if not nxt:
            c.execute("UPDATE users SET weekly_next_activate_at=NULL WHERE id=?", (row['id'],))
            changed = True
            continue
        c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly'", (row['id'],))
        c.execute("UPDATE documents SET folder='weekly',updated=? WHERE id=?", (now, nxt['id']))
        c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly_next' AND id<>?", (row['id'], nxt['id']))
        c.execute("UPDATE users SET weekly_status='available',weekly_next_activate_at=NULL WHERE id=?", (row['id'],))
        changed = True
    if changed:
        c.commit()
    return changed


def folder_allowed(player, folder):
    if folder in ('nutrition', 'other', 'weekly'):
        return True
    if folder == 'menus':
        return bool(player['menus_enabled'])
    if folder == 'anthropometry':
        return bool(player['anthropometry_enabled'])
    return False


class Problem(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def application(env, start_response):
    headers = [('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'), ('X-Frame-Options', 'DENY'), ('Referrer-Policy', 'no-referrer'), ('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")]
    if SECURE:
        headers.append(('Strict-Transport-Security', 'max-age=31536000'))

    def respond(status, data, mime='application/json; charset=utf-8'):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode()
        headers.extend([('Content-Type', mime), ('Content-Length', str(len(data)))])
        start_response(f'{status} ' + {200:'OK', 201:'Created', 400:'Bad Request', 401:'Unauthorized', 403:'Forbidden', 404:'Not Found', 409:'Conflict', 413:'Payload Too Large', 429:'Too Many Requests', 500:'Internal Server Error'}.get(status, 'Error'), headers)
        return [data]

    try:
        method = env.get('REQUEST_METHOD', 'GET')
        path = env.get('PATH_INFO', '/')
        static_files = {
            '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/logo.png': 'logo.png',
            '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js', '/icon-192.png': 'icon-192.png',
            '/icon-512.png': 'icon-512.png', '/apple-touch-icon.png': 'apple-touch-icon.png', '/pdf-open.html': 'pdf-open.html',
            '/pdf-open.css': 'pdf-open.css', '/pdf-open.js': 'pdf-open.js',
            '/admin-microcycles': 'admin-microcycles.html', '/admin-microcycles.js': 'admin-microcycles.js', '/admin-microcycles.css': 'admin-microcycles.css',
        }
        if method == 'GET' and path == '/ios-launch-1320x2868.png':
            return respond(200, shift_native_splash_down(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAABSgAAAs0AQAAAACjwb+YAAAFX0lEQVR42u3aP27bZhwG4JeyEKtAgGjokCFohZ6gY4cCUW/iI3Tslq83yBFyFHbrmCOoQIeOSpHBKWSzA21HIh07kGhTQZ5nUGRGoV5+//j7GCcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwGN72Vw5z6vNbR/4vtncvDtv3zTrQ75x8jAXcn3axbCneyDLJHl1fqQpq4fpmqGVnT+OvMePvC2Xg3b8192Wi0HP/rBtOT2GlHesg/PRr/aPKmku7v6Xs63XL2P2/D471pTTQfv9616JJkOWRA/dls1Rp6yrrfvkEbdlSZJyeTQpX9ZJkpNm9fHY9dvOhuPl5SErxiFO64skyc/5rlsUdUuikzqrxTht+VNOkqSqU9U3B9fb99DrHVpeJC9G6vG6HYNPkvy4dYdf3HLys7RX9PgpT9pvz/MkT3t/u7O/rUp7USOknF7dCM92TrbJvD/oJ3sv9AennG2tPFXZPT7LavujT3PV5o+fct4m6qzilx8HbafmnI6SctF+c+e+3dyMhO4uYzJKymV7kmlSlX6lVnY/+m6237by4JTlr2k7DN/l9VZtXib9mVIy/7Dfg4RDU1Z5c9GOubd5f19JdLFv/XFoyklTUqp2olxsTY26SrK83L2gTfJ2r5wH9/hlO5EXTbnq5q0hWTpf9c/1TenRU26uCqDL3XVndVtJtOodeayU5227LZNkVW3dGpfd6TxtL2Y+Rsr1ViW5vuexQr3vFuPglKs2XDnv5ltkshu7XabKbIyU9U60cuczmLL3SjLMxqS6ZVJlultsjLnvKZ9aoGbdp0Tzfv3xePueK8+aW7a29S23oosR2rL55PFp5kM9/P/KnxOlTLJojiXl5edP+2Nsy7pbEh1lylVK2Qx1ssFWonefUUVUo7fluvfzL91iozm+Hh90Pg2Wct4r2n7oV3JH15abIU/2gD3+backWo+esun9N9llZr36p3wJs2f8Hi/TpH08uLXslM58WqZ9GjteW06S5PXd3btI8s2YKesqycnsrlW8ffI6L6OOy5JMpzvlRq/YmCU5W46YcpWz5Pnk7iLvSVKVxYgp13menFU7uTfd1aoqeTLOs42bCXya03LfmPg1v41buSXN7nxZ936to86zZr9b0FBt+V9vf3Hey7Paeh0nZduK7z+jBK1HTNku4uud5XHVG7tJmlHXyzc3L3ePir12bMPuKMrO8tjt26bcOygeOuW/ST7sjtRyW3u/HjVlU5I/7/nM33sOywGdNvdvIl41dQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACO0/8MV9LumUcAZAAAAABJRU5ErkJggg==')), 'image/png')
        if method == 'GET' and path in static_files:
            file = ROOT / 'static' / static_files[path]
            mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            if file.name.endswith('.webmanifest'):
                mime = 'application/manifest+json'
            return respond(200, file.read_bytes(), mime)
        if not path.startswith('/api/'):
            raise Problem(404, 'not_found')

        cookies = SimpleCookie()
        try:
            cookies.load(env.get('HTTP_COOKIE', ''))
        except Exception:
            pass
        token = cookies['mile_session'].value if 'mile_session' in cookies else ''

        logging.warning('TEST_API_TRACE before_connect path=%s', path)
        with connect() as c:
            logging.warning('TEST_API_TRACE after_connect path=%s', path)
            now = int(time.time())
            user = c.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1', (digest(token), now)).fetchone()
            logging.warning('TEST_API_TRACE after_session_query path=%s', path)

            if method != 'GET':
                origin = (env.get('HTTP_ORIGIN') or '').strip().rstrip('/')
                if origin:
                    parsed_origin = urlparse(origin)
                    origin_host = (parsed_origin.hostname or '').lower()
                    if parsed_origin.scheme not in ('https', 'http') or origin_host not in ALLOWED_ORIGIN_HOSTS:
                        logging.warning('Blocked origin: %r', origin)
                        raise Problem(403, 'origin')
                if user and not hmac.compare_digest(env.get('HTTP_X_CSRF_TOKEN', ''), user['csrf']):
                    raise Problem(403, 'csrf')

            if path == '/api/v2/athletes':
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                if method == 'GET':
                    return respond(200, {'athletes': microcycles_v2.list_athletes(c)})
                if method == 'POST':
                    try:
                        athlete = microcycles_v2.create_athlete(c, read_json(env).get('name', ''))
                    except ValueError:
                        raise Problem(400, 'invalid_athlete_name')
                    return respond(201, {'athlete': athlete})
            if path.startswith('/api/v2/athletes/'):
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                segments = path.strip('/').split('/')
                if len(segments) == 5 and segments[4] == 'microcycles' and method == 'GET':
                    result = microcycles_v2.get_model(c, segments[3])
                    if result is None:
                        raise Problem(404, 'not_found')
                    return respond(200, result)
                if len(segments) == 6 and segments[4] == 'microcycles' and method == 'PUT':
                    body = read_json(env)
                    if 'color' not in body:
                        raise Problem(400, 'invalid_model_cell')
                    try:
                        ok = microcycles_v2.update_cell(c, segments[3], segments[5],
                            body.get('meal'), body.get('color'), user['id'])
                    except ValueError:
                        raise Problem(400, 'invalid_model_cell')
                    if not ok:
                        raise Problem(404, 'not_found')
                    return respond(200, {'ok': True})

            if path == '/api/me' and method == 'GET':
                if not user:
                    return respond(200, {'user': None, 'csrf': None})
                if user['role'] == 'player':
                    data = player_dict(user)
                    data['weight_form_url'] = WEIGHT_FORM_M if user['sex'] == 'M' else WEIGHT_FORM_F if user['sex'] == 'F' else ''
                    data['game_form_url'] = GAME_FORM
                else:
                    data = {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}
                return respond(200, {'user': data, 'csrf': user['csrf']})

            if path in ('/api/login', '/api/activate') and method == 'POST':
                body = read_json(env)
                limit_key = digest(env.get('REMOTE_ADDR', '') + ':' + path)
                rate_limit(c, limit_key, now)
                password = body.get('password', '')
                if not isinstance(password, str) or len(password) > 256:
                    raise Problem(400, 'password')
                if path == '/api/login':
                    identifier = str(body.get('identifier', body.get('email', ''))).strip().lower()
                    u = c.execute("SELECT * FROM users WHERE active=1 AND ((role='admin' AND lower(email)=?) OR (role='player' AND username=?))", (identifier, identifier)).fetchone()
                    if not password_valid(password, u['password'] if u else None):
                        raise Problem(401, 'credentials')
                else:
                    if len(password) < 12:
                        raise Problem(400, 'password_length')
                    a = c.execute("SELECT u.* FROM activations a JOIN users u ON u.id=a.user_id WHERE a.token=? AND a.expires>? AND u.active=1 AND u.role='admin'", (digest(str(body.get('token', ''))), now)).fetchone()
                    if not a:
                        raise Problem(400, 'activation')
                    c.execute('UPDATE users SET password=? WHERE id=?', (password_hash(password), a['id']))
                    c.execute('DELETE FROM activations WHERE user_id=?', (a['id'],))
                    c.execute('DELETE FROM sessions WHERE user_id=?', (a['id'],))
                    u = a
                session_token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
                c.execute('DELETE FROM sessions WHERE expires<=?', (now,))
                c.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest(session_token), u['id'], csrf, now + 43200))
                c.execute('DELETE FROM attempts WHERE key=?', (limit_key,))
                c.commit()
                headers.append(('Set-Cookie', f'mile_session={session_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200' + ('; Secure' if SECURE else '')))
                return respond(200, {'ok': True})

            if path == '/api/change-password' and method == 'POST':
                body = read_json(env)
                limit_key = digest(env.get('REMOTE_ADDR', '') + ':' + path)
                rate_limit(c, limit_key, now)
                identifier = str(body.get('identifier', '')).strip().lower()
                current = body.get('current_password', '')
                new = body.get('new_password', '')
                if not isinstance(current, str) or not isinstance(new, str) or len(new) < 8 or len(new) > 256:
                    raise Problem(400, 'password_change')
                target = c.execute("SELECT * FROM users WHERE active=1 AND ((role='admin' AND lower(email)=?) OR (role='player' AND username=?))", (identifier, identifier)).fetchone()
                if not target or not password_valid(current, target['password']):
                    raise Problem(400, 'password_change')
                c.execute('UPDATE users SET password=? WHERE id=?', (password_hash(new), target['id']))
                c.execute('DELETE FROM sessions WHERE user_id=?', (target['id'],))
                c.execute('DELETE FROM attempts WHERE key=?', (limit_key,))
                c.commit()
                return respond(200, {'ok': True})

            if not user:
                raise Problem(401, 'login_required')

            if path == '/api/logout' and method == 'POST':
                c.execute('DELETE FROM sessions WHERE token=?', (digest(token),))
                c.commit()
                headers.append(('Set-Cookie', 'mile_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + ('; Secure' if SECURE else '')))
                return respond(200, {'ok': True})

            if path == '/api/password' and method == 'POST':
                body = read_json(env)
                current = body.get('current_password', '')
                new = body.get('new_password', '')
                if not password_valid(current, user['password']) or not isinstance(new, str) or len(new) < 8 or len(new) > 256:
                    raise Problem(400, 'password_change')
                c.execute('UPDATE users SET password=? WHERE id=?', (password_hash(new), user['id']))
                c.execute('DELETE FROM sessions WHERE user_id=? AND token<>?', (user['id'], digest(token)))
                c.commit()
                return respond(200, {'ok': True})

            if path == '/api/players':
                admin(user)
                if method == 'GET':
                    rows = c.execute("""SELECT u.*,(SELECT count(*) FROM documents d WHERE d.user_id=u.id) documents
                                      FROM users u WHERE role='player' ORDER BY u.name""").fetchall()
                    players = []
                    for r in rows:
                        p = player_dict(r)
                        p['documents'] = r['documents']
                        players.append(p)
                    return respond(200, {'players': players})
                if method == 'POST':
                    body = read_json(env)
                    p = clean_player_payload(body, require_password=True, require_photo=True)
                    uid = secrets.token_hex(16)
                    internal_email = f"{p['username']}@players.themile.local"
                    c.execute("""INSERT INTO users(id,name,email,username,role,password,active,birth_date,sex,height,weight,menus_enabled,anthropometry_enabled,photo,photo_mime,plan_name,renewal_date)
                                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                              (uid, p['name'], internal_email, p['username'], 'player', password_hash(p['password']), 1,
                               p['birth_date'], p['sex'], p['height'], p['weight'], p['menus_enabled'], p['anthropometry_enabled'], p['photo'], p['photo_mime'], p['plan_name'], p['renewal_date']))
                    c.commit()
                    return respond(201, {'id': uid})

            if path == '/api/admins' and method == 'GET':
                admin(user)
                rows = c.execute("SELECT id,name,email,active,(password IS NOT NULL) activated FROM users WHERE role='admin' ORDER BY name").fetchall()
                return respond(200, {'admins': [dict(r) for r in rows]})

            if path.startswith('/api/admins/') and method == 'POST':
                admin(user)
                parts = path.split('/')
                if len(parts) != 5:
                    raise Problem(404, 'not_found')
                uid, action = parts[3:]
                target = c.execute("SELECT * FROM users WHERE id=? AND role='admin' AND active=1", (uid,)).fetchone()
                if not target:
                    raise Problem(404, 'not_found')
                if action == 'activation':
                    link = activation(c, uid)
                    c.commit()
                    return respond(200, {'activation_url': link})
                raise Problem(404, 'not_found')

            if path.startswith('/api/players/') and path.endswith('/photo') and method == 'GET':
                parts = path.split('/')
                if len(parts) != 5:
                    raise Problem(404, 'not_found')
                uid = parts[3]
                target = c.execute("SELECT * FROM users WHERE id=? AND role='player'", (uid,)).fetchone()
                if not target:
                    raise Problem(404, 'not_found')
                authorize_owner(user, uid)
                if not target['photo']:
                    raise Problem(404, 'not_found')
                return respond(200, bytes(target['photo']), target['photo_mime'] or 'image/jpeg')

            if path.startswith('/api/players/') and path.endswith('/access-extension') and method == 'POST':
                admin(user)
                parts = path.split('/')
                if len(parts) != 5:
                    raise Problem(404, 'not_found')
                target = c.execute("SELECT id,renewal_date,access_until FROM users WHERE id=? AND role='player'", (parts[3],)).fetchone()
                if not target:
                    raise Problem(404, 'not_found')
                body = read_json(env)
                try:
                    extra = int(body.get('days', 0))
                except (ValueError, TypeError):
                    raise Problem(400, 'invalid_request')
                if extra not in (3, 7, 15, 30):
                    raise Problem(400, 'invalid_request')
                today = datetime.now(ZoneInfo('Europe/Lisbon')).date()
                base_text = target['access_until'] or target['renewal_date']
                try:
                    base = datetime.strptime(base_text, '%Y-%m-%d').date() + timedelta(days=7 if not target['access_until'] else 0)
                except (TypeError, ValueError):
                    raise Problem(400, 'invalid_request')
                until = max(today, base) + timedelta(days=extra)
                c.execute('UPDATE users SET access_until=? WHERE id=?', (until.isoformat(), target['id']))
                c.commit()
                return respond(200, {'ok': True, 'access_until': until.isoformat()})

            if path.startswith('/api/players/') and method in ('PUT', 'DELETE'):
                admin(user)
                parts = path.split('/')
                if len(parts) != 4:
                    raise Problem(404, 'not_found')
                uid = parts[3]
                player = c.execute("SELECT * FROM users WHERE id=? AND role='player'", (uid,)).fetchone()
                if not player:
                    raise Problem(404, 'not_found')
                if method == 'PUT':
                    body = read_json(env)
                    p = clean_player_payload(body)
                    access_until = body.get('access_until')
                    if access_until in (None, ''):
                        access_until = None
                    else:
                        if not isinstance(access_until, str):
                            raise Problem(400, 'invalid_request')
                        try:
                            access_until = datetime.strptime(access_until, '%Y-%m-%d').date().isoformat()
                        except ValueError:
                            raise Problem(400, 'invalid_request')
                    fields = [p['name'], f"{p['username']}@players.themile.local", p['username'], p['birth_date'], p['sex'],
                              p['height'], p['weight'], p['menus_enabled'], p['anthropometry_enabled'], p['plan_name'], p['renewal_date'], access_until]
                    sql = 'UPDATE users SET name=?,email=?,username=?,birth_date=?,sex=?,height=?,weight=?,menus_enabled=?,anthropometry_enabled=?,plan_name=?,renewal_date=?,access_until=?'
                    if p['password']:
                        sql += ',password=?'
                        fields.append(password_hash(p['password']))
                    if p['photo'] is not None:
                        sql += ',photo=?,photo_mime=?'
                        fields.extend([p['photo'], p['photo_mime']])
                    sql += ' WHERE id=?'
                    fields.append(uid)
                    c.execute(sql, tuple(fields))
                    c.commit()
                    return respond(200, {'ok': True})
                c.execute('DELETE FROM documents WHERE user_id=?', (uid,))
                c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
                c.execute('DELETE FROM activations WHERE user_id=?', (uid,))
                c.execute('DELETE FROM users WHERE id=?', (uid,))
                c.commit()
                return respond(200, {'ok': True})

            if path.startswith('/api/players/') and method == 'POST':
                admin(user)
                parts = path.split('/')
                if len(parts) != 5:
                    raise Problem(404, 'not_found')
                uid, action = parts[3:]
                player = c.execute("SELECT * FROM users WHERE id=? AND role='player'", (uid,)).fetchone()
                if not player:
                    raise Problem(404, 'not_found')
                if action == 'status':
                    active = read_json(env).get('active')
                    if not isinstance(active, bool):
                        raise Problem(400, 'user_fields')
                    c.execute('UPDATE users SET active=? WHERE id=?', (int(active), uid))
                    c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
                    c.commit()
                    return respond(200, {'ok': True})
                if action == 'password':
                    password = read_json(env).get('password', '')
                    if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
                        raise Problem(400, 'password_length')
                    c.execute('UPDATE users SET password=? WHERE id=?', (password_hash(password), uid))
                    c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
                    c.commit()
                    return respond(200, {'ok': True})
                if action == 'weekly-status':
                    status = str(read_json(env).get('status', '')).strip()
                    if status not in ('available', 'waiting', 'updating'):
                        raise Problem(400, 'weekly_status')
                    c.execute('UPDATE users SET weekly_status=? WHERE id=?', (status, uid))
                    c.commit()
                    return respond(200, {'ok': True})
                if action == 'weekly-current':
                    did = str(read_json(env).get('document_id', '')).strip()
                    doc = c.execute("SELECT id FROM documents WHERE id=? AND user_id=? AND folder='weekly'", (did, uid)).fetchone()
                    if not doc:
                        raise Problem(404, 'not_found')
                    c.execute("UPDATE users SET current_weekly_document_id=?,weekly_status='available',weekly_next_activate_at=NULL WHERE id=?", (did, uid))
                    c.commit()
                    return respond(200, {'ok': True})
                raise Problem(404, 'not_found')

            if path == '/api/push/config' and method == 'GET':
                if not user or user['role'] != 'player':
                    raise Problem(401, 'unauthorized')
                return respond(200, {'publicKey': os.environ.get('MILE_VAPID_PUBLIC_KEY','')})

            if path == '/api/push/subscription':
                if not user or user['role'] != 'player':
                    raise Problem(401, 'unauthorized')
                if method == 'POST':
                    body = read_json(env)
                    endpoint = body.get('endpoint')
                    keys = body.get('keys')
                    if (not isinstance(endpoint,str) or len(endpoint)>1800 or not endpoint.startswith('https://') or
                        not isinstance(keys,dict) or not all(isinstance(keys.get(k),str) and 10<=len(keys[k])<=300 for k in ('p256dh','auth'))):
                        raise Problem(400,'invalid_request')
                    c.execute("DELETE FROM push_subscriptions WHERE user_id=? OR endpoint=?", (user['id'],endpoint))
                    c.execute("INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created) VALUES(?,?,?,?,?)",(endpoint,user['id'],keys['p256dh'],keys['auth'],now))
                    c.commit()
                    return respond(200, {'ok':True})
                if method == 'DELETE':
                    body=read_json(env)
                    endpoint=body.get('endpoint','')
                    c.execute("DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",(endpoint,user['id']))
                    c.commit()
                    return respond(200, {'ok':True})

            if path == '/api/notifications':
                if not user:
                    raise Problem(401, 'unauthorized')
                if method == 'GET':
                    if user['role'] == 'player':
                        rows = c.execute('SELECT id,title,message,category,document_id,folder,created,read_at,document_opened_at FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 150', (user['id'],)).fetchall()
                    else:
                        rows = c.execute('SELECT id,user_id,title,message,category,document_id,folder,created,read_at,document_opened_at FROM notifications ORDER BY created DESC LIMIT 200').fetchall()
                    return respond(200, {'notifications': [dict(r) for r in rows]})
                if method == 'POST':
                    admin(user)
                    payload = read_json(env)
                    title = str(payload.get('title', '')).strip()
                    message = str(payload.get('message', '')).strip()
                    category = str(payload.get('category', 'manual')).strip()
                    recipients = payload.get('recipients', [])
                    document_id = payload.get('document_id')
                    if (not title or len(title)>120 or not message or len(message)>1000
                            or category not in ('manual','weight','game','document','renewal')
                            or not isinstance(recipients,list) or not 1<=len(recipients)<=200
                            or not all(isinstance(x,str) for x in recipients)
                            or len(set(recipients))!=len(recipients)):
                        raise Problem(400, 'invalid_request')
                    valid = c.execute("SELECT id FROM users WHERE role='player' AND active=1").fetchall()
                    allowed = {r['id'] for r in valid}
                    if not set(recipients).issubset(allowed):
                        raise Problem(400, 'invalid_request')
                    folder_target = None
                    if document_id:
                        if len(recipients)!=1:
                            raise Problem(400, 'invalid_request')
                        d = c.execute('SELECT user_id,folder FROM documents WHERE id=?', (document_id,)).fetchone()
                        if not d or d['user_id']!=recipients[0]:
                            raise Problem(400, 'invalid_request')
                        folder_target = d['folder']
                    created_push=[]
                    for uid in recipients:
                        nid=secrets.token_hex(16)
                        c.execute('INSERT INTO notifications(id,user_id,title,message,category,document_id,folder,created,read_at,document_opened_at,created_by) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?)',
                                  (nid,uid,title,message,category,document_id,folder_target,now,user['id']))
                        created_push.append((uid,nid))
                    c.commit()
                    for uid,nid in created_push:
                        send_player_push(c,uid,title,message,nid)
                    return respond(201, {'ok':True,'sent':len(recipients)})

            if path.startswith('/api/notifications/'):
                if not user:
                    raise Problem(401, 'unauthorized')
                parts = path.strip('/').split('/')
                if len(parts)==4 and parts[1]=='notifications' and parts[3]=='read' and method=='POST':
                    nid=parts[2]
                    c.execute('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?', (now,nid,user['id']))
                    c.commit()
                    return respond(200, {'ok':True})

            if path == '/api/documents':
                if user and user['role']=='player' and not access_valid(user):
                    raise Problem(403, 'access_expired')
                qs = parse_qs(env.get('QUERY_STRING', ''))
                uid = qs.get('player', [user['id']])[0]
                authorize_owner(user, uid)
                owner = c.execute("SELECT * FROM users WHERE id=? AND role='player'", (uid,)).fetchone()
                if not owner:
                    raise Problem(404, 'not_found')
                if method == 'GET':
                    rows = c.execute('SELECT id,folder,title,size,updated FROM documents WHERE user_id=? ORDER BY updated DESC', (uid,)).fetchall()
                    result = [dict(r) for r in rows if user['role'] == 'admin' or folder_allowed(owner, r['folder'])]
                    return respond(200, {'documents': result})
                if method == 'POST':
                    admin(user)
                    folder = qs.get('folder', [''])[0]
                    title = qs.get('title', [''])[0].strip()
                    if folder not in FOLDERS or not title or len(title) > 180 or any(ord(ch) < 32 for ch in title):
                        raise Problem(400, 'document_fields')
                    blob = read_body(env, MAX_PDF)
                    if not blob.startswith(b'%PDF-') or b'%%EOF' not in blob[-4096:]:
                        raise Problem(400, 'pdf_only')
                    did = secrets.token_hex(16)
                    c.execute('INSERT INTO documents(id,user_id,folder,title,size,updated,uploaded_by,data) VALUES(?,?,?,?,?,?,?,?)',
                              (did, uid, folder, title, len(blob), now, user['id'], blob))
                    document_push=None
                    if qs.get('notify', ['0'])[0] == '1':
                        labels = {'weekly':'Plano semanal', 'nutrition':'Plano alimentar', 'menus':'Menu', 'other':'Documento', 'anthropometry':'Avaliação antropométrica'}
                        nid=secrets.token_hex(16)
                        msg=labels.get(folder,'Documento') + ': ' + title
                        c.execute('INSERT INTO notifications(id,user_id,title,message,category,document_id,folder,created,read_at,document_opened_at,created_by) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?)',
                                  (nid,uid,'Novo documento disponível',msg,'document',did,folder,now,user['id']))
                        document_push=(nid,msg)
                    c.commit()
                    if document_push:
                        send_player_push(c,uid,'Novo documento disponível',document_push[1],document_push[0])
                    return respond(201, {'id': did})

            if path.startswith('/api/documents/'):
                if user and user['role']=='player' and not access_valid(user):
                    raise Problem(403, 'access_expired')
                did = path.split('/')[-1]
                d = c.execute('SELECT * FROM documents WHERE id=?', (did,)).fetchone()
                if not d:
                    raise Problem(404, 'not_found')
                authorize_owner(user, d['user_id'])
                owner = c.execute("SELECT * FROM users WHERE id=? AND role='player'", (d['user_id'],)).fetchone()
                if user['role'] != 'admin' and not folder_allowed(owner, d['folder']):
                    raise Problem(403, 'forbidden')
                if method == 'PATCH':
                    admin(user)
                    payload = read_json(env)
                    title = str(payload.get('title', '')).strip()
                    if not title or len(title) > 180 or any(ord(ch) < 32 for ch in title):
                        raise Problem(400, 'document_fields')
                    c.execute('UPDATE documents SET title=?,updated=? WHERE id=?', (title, now, d['id']))
                    c.commit()
                    return respond(200, {'ok': True})
                if method == 'PUT':
                    admin(user)
                    blob = read_body(env, MAX_PDF)
                    if not blob.startswith(b'%PDF-') or b'%%EOF' not in blob[-4096:]:
                        raise Problem(400, 'pdf_only')
                    c.execute('UPDATE documents SET size=?,updated=?,uploaded_by=?,data=? WHERE id=?', (len(blob), now, user['id'], blob, d['id']))
                    c.commit()
                    return respond(200, {'ok': True})
                if method == 'GET':
                    if user['role']=='player':
                        c.execute('UPDATE notifications SET document_opened_at=COALESCE(document_opened_at,?) WHERE user_id=? AND document_id=?', (now,user['id'],did))
                        c.commit()
                    headers.append(('Content-Disposition', "inline; filename=document.pdf; filename*=UTF-8''" + quote((d['title'] if d['title'].lower().endswith('.pdf') else d['title'] + '.pdf'), safe='')))
                    return respond(200, bytes(d['data']), 'application/pdf')
                if method == 'DELETE':
                    admin(user)
                    if d['folder'] == 'weekly':
                        c.execute("UPDATE users SET current_weekly_document_id=NULL,weekly_status=CASE WHEN current_weekly_document_id=? THEN 'waiting' ELSE weekly_status END WHERE id=? AND current_weekly_document_id=?", (did, d['user_id'], did))
                    c.execute('DELETE FROM documents WHERE id=?', (did,))
                    c.commit()
                    return respond(200, {'ok': True})

            raise Problem(404, 'not_found')
    except Problem as e:
        return respond(e.status, {'error': e.code})
    except sqlite3.IntegrityError:
        return respond(409, {'error': 'username_exists'})
    except (ValueError, json.JSONDecodeError):
        return respond(400, {'error': 'invalid_request'})
    except Exception as e:
        if psycopg is not None and isinstance(e, psycopg.errors.UniqueViolation):
            return respond(409, {'error': 'username_exists'})
        logging.exception('The Mile request failed')
        return respond(500, {'error': 'server_error'})


def read_body(env, limit):
    try:
        length = int(env.get('CONTENT_LENGTH') or 0)
    except ValueError:
        raise Problem(400, 'invalid_request')
    if length <= 0:
        raise Problem(400, 'invalid_request')
    if length > limit:
        raise Problem(413, 'file_size')
    data = env['wsgi.input'].read(length)
    if len(data) != length:
        raise Problem(400, 'invalid_request')
    return data


def read_json(env):
    value = json.loads(read_body(env, MAX_JSON))
    if not isinstance(value, dict):
        raise Problem(400, 'invalid_request')
    return value


def admin(user):
    if user['role'] != 'admin':
        raise Problem(403, 'forbidden')


def authorize_owner(user, uid):
    if user['role'] != 'admin' and user['id'] != uid:
        raise Problem(403, 'forbidden')


def rate_limit(c, key, now):
    row = c.execute('SELECT * FROM attempts WHERE key=?', (key,)).fetchone()
    if row and row['until_time'] > now and row['count'] >= 10:
        raise Problem(429, 'rate_limit')
    count = row['count'] + 1 if row and row['until_time'] > now else 1
    until = row['until_time'] if row and row['until_time'] > now else now + 900
    c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)', (key, count, until))
    c.execute('DELETE FROM attempts WHERE until_time<=?', (now,))
    c.commit()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('init', 'activate', 'serve'))
    parser.add_argument('--email')
    args = parser.parse_args()
    initialize()
    if args.command == 'activate':
        with connect() as c:
            user = c.execute("SELECT id FROM users WHERE email=? AND active=1 AND role='admin'", ((args.email or '').lower(),)).fetchone()
            if not user:
                parser.error('Conta de administrador inexistente ou desativada.')
            print(activation(c, user['id']))
    elif args.command == 'serve':
        from wsgiref.simple_server import make_server
        print('Desenvolvimento local: http://localhost:8000')
        make_server('127.0.0.1', 8000, application).serve_forever()
