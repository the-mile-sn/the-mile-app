"""The Mile private document portal. WSGI; standard-library application."""
import base64
import csv
import io
from PIL import Image, UnidentifiedImageError
import zipfile
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
import calendar_v2
import events_v2
import day_colors_v2
import peri_v2
import supplements_v2
import assessments_v2
import plan_import_v2
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
ALLOWED_ORIGIN_HOSTS.update({'app.themile.pt', 'admin.themile.pt', 'the-mile-app.onrender.com', 'the-mile-app-test.onrender.com'})
SITE_ROLE = os.environ.get('MILE_SITE_ROLE', 'both').strip().lower()
if SITE_ROLE not in ('both', 'admin', 'player'):
    raise RuntimeError('Invalid MILE_SITE_ROLE')
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


class ClosingSQLiteConnection(sqlite3.Connection):
    """Commit/rollback and close SQLite connections on context exit."""

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def connect():
    if DATABASE_URL:
        if psycopg is None:
            raise RuntimeError('DATABASE_URL is set but psycopg is not installed')
        return PgConnection(psycopg.connect(DATABASE_URL, row_factory=dict_row))
    c = sqlite3.connect(DATA / 'mile.sqlite3', timeout=20, factory=ClosingSQLiteConnection)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys = ON')
    return c


class PgCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    @property
    def rowcount(self):
        return self.cursor.rowcount

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
        c.execute('CREATE TABLE IF NOT EXISTS v2_shared_images (image_key TEXT PRIMARY KEY, image_data ' + ('BYTEA' if DATABASE_URL else 'BLOB') + ' NOT NULL)')
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
        plan_import_v2.initialize(c)
        events_v2.initialize(c)
        day_colors_v2.initialize(c)
        peri_v2.initialize(c)
        supplements_v2.initialize(c)
        assessments_v2.initialize(c)
        c.execute("UPDATE documents SET folder='weekly' WHERE folder='weekly_next'")
        # Preserve scheduled weekly activation timestamps across application restarts.
        c.execute("""UPDATE users SET current_weekly_document_id=(SELECT d.id FROM documents d WHERE d.user_id=users.id AND d.folder='weekly' ORDER BY d.updated DESC LIMIT 1) WHERE role='player' AND weekly_status='available' AND current_weekly_document_id IS NULL""")
        for name, email in ADMINS:
            c.execute('INSERT OR IGNORE INTO users(id,name,email,role) VALUES(?,?,?,?)', (secrets.token_hex(16), name, email, 'admin'))


def store_dish_image(c, filename, image_data):
    """Keep dish photos in the same database both production services use."""
    c.execute('DELETE FROM v2_shared_images WHERE image_key=?', (filename,))
    c.execute('INSERT INTO v2_shared_images(image_key,image_data) VALUES(?,?)', (filename, image_data))


def read_dish_image(c, filename):
    row = c.execute('SELECT image_data FROM v2_shared_images WHERE image_key=?', (filename,)).fetchone()
    if row:
        return bytes(row['image_data'])
    # Compatibility with existing test images; migrate explicitly before production.
    file = DATA / 'v2_dish_images' / filename
    return file.read_bytes() if file.is_file() else None


def player_menu_photo(image_bytes):
    """Remove only near-black edge-connected matte; preserve the opaque food."""
    from collections import deque
    try:
        with Image.open(io.BytesIO(image_bytes)) as original:
            rgba = original.convert('RGBA')
            if rgba.width * rgba.height > 800000:
                return image_bytes
            px = rgba.load()
            w, h = rgba.size
            visited = bytearray(w*h)
            queue = deque()
            def candidate(x,y):
                r,g,b,a = px[x,y]
                return a > 0 and max(r,g,b) < 46
            for x in range(w):
                if candidate(x,0): queue.append((x,0))
                if candidate(x,h-1): queue.append((x,h-1))
            for y in range(h):
                if candidate(0,y): queue.append((0,y))
                if candidate(w-1,y): queue.append((w-1,y))
            count=0
            while queue:
                x,y=queue.popleft()
                i=y*w+x
                if visited[i]: continue
                visited[i]=1
                if not candidate(x,y): continue
                r,g,b,a=px[x,y]
                px[x,y]=(r,g,b,0)
                count+=1
                if x>0: queue.append((x-1,y))
                if x+1<w: queue.append((x+1,y))
                if y>0: queue.append((x,y-1))
                if y+1<h: queue.append((x,y+1))
            if not count: return image_bytes
            buf=io.BytesIO()
            rgba.save(buf,'WEBP',lossless=True,method=3)
            return buf.getvalue()
    except (OSError,UnidentifiedImageError):
        return image_bytes


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
        # Deployment-level separation. The test environment defaults to both.
        # Role authorization remains mandatory on all protected API endpoints.
        if SITE_ROLE == 'player':
            if (path in ('/admin-microcycles', '/admin-microcycles.js', '/admin-microcycles.css')
                    or path == '/api/v2/athletes'
                    or path.startswith('/api/v2/athletes/')
                    or path.startswith('/api/v2/supplement-library')
                    or path.startswith('/api/v2/dishes/edit')
                    or path.startswith('/api/v2/dishes/photo')
                    or path.startswith('/api/v2/dishes/import')
                    or path.startswith('/api/players')
                    or path.startswith('/api/admins')):
                raise Problem(404, 'not_found')
        elif SITE_ROLE == 'admin':
            if (path in ('/jogador-v2', '/jogador-v2.js', '/jogador-v2.css')
                    or path.startswith('/api/v2/player/')
                    or path.startswith('/api/push/')):
                raise Problem(404, 'not_found')
        static_files = {
            '/': 'jogador-v2.html' if SITE_ROLE == 'player' else 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/logo.png': 'logo.png',
            '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js', '/icon-192.png': 'icon-192.png',
            '/icon-512.png': 'icon-512.png', '/apple-touch-icon.png': 'apple-touch-icon.png', '/pdf-open.html': 'pdf-open.html',
            '/pdf-open.css': 'pdf-open.css', '/pdf-open.js': 'pdf-open.js',
            '/admin-microcycles': 'admin-microcycles.html', '/admin-microcycles.js': 'admin-microcycles.js', '/admin-microcycles.css': 'admin-microcycles.css',
            '/jogador-v2': 'jogador-v2.html', '/jogador-v2.js': 'jogador-v2.js', '/jogador-v2.css': 'jogador-v2.css',
        }
        if method == 'GET' and path == '/ios-launch-1320x2868.png':
            return respond(200, shift_native_splash_down(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAABSgAAAs0AQAAAACjwb+YAAAFX0lEQVR42u3aP27bZhwG4JeyEKtAgGjokCFohZ6gY4cCUW/iI3Tslq83yBFyFHbrmCOoQIeOSpHBKWSzA21HIh07kGhTQZ5nUGRGoV5+//j7GCcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwGN72Vw5z6vNbR/4vtncvDtv3zTrQ75x8jAXcn3axbCneyDLJHl1fqQpq4fpmqGVnT+OvMePvC2Xg3b8192Wi0HP/rBtOT2GlHesg/PRr/aPKmku7v6Xs63XL2P2/D471pTTQfv9616JJkOWRA/dls1Rp6yrrfvkEbdlSZJyeTQpX9ZJkpNm9fHY9dvOhuPl5SErxiFO64skyc/5rlsUdUuikzqrxTht+VNOkqSqU9U3B9fb99DrHVpeJC9G6vG6HYNPkvy4dYdf3HLys7RX9PgpT9pvz/MkT3t/u7O/rUp7USOknF7dCM92TrbJvD/oJ3sv9AennG2tPFXZPT7LavujT3PV5o+fct4m6qzilx8HbafmnI6SctF+c+e+3dyMhO4uYzJKymV7kmlSlX6lVnY/+m6237by4JTlr2k7DN/l9VZtXib9mVIy/7Dfg4RDU1Z5c9GOubd5f19JdLFv/XFoyklTUqp2olxsTY26SrK83L2gTfJ2r5wH9/hlO5EXTbnq5q0hWTpf9c/1TenRU26uCqDL3XVndVtJtOodeayU5227LZNkVW3dGpfd6TxtL2Y+Rsr1ViW5vuexQr3vFuPglKs2XDnv5ltkshu7XabKbIyU9U60cuczmLL3SjLMxqS6ZVJlultsjLnvKZ9aoGbdp0Tzfv3xePueK8+aW7a29S23oosR2rL55PFp5kM9/P/KnxOlTLJojiXl5edP+2Nsy7pbEh1lylVK2Qx1ssFWonefUUVUo7fluvfzL91iozm+Hh90Pg2Wct4r2n7oV3JH15abIU/2gD3+backWo+esun9N9llZr36p3wJs2f8Hi/TpH08uLXslM58WqZ9GjteW06S5PXd3btI8s2YKesqycnsrlW8ffI6L6OOy5JMpzvlRq/YmCU5W46YcpWz5Pnk7iLvSVKVxYgp13menFU7uTfd1aoqeTLOs42bCXya03LfmPg1v41buSXN7nxZ936to86zZr9b0FBt+V9vf3Hey7Paeh0nZduK7z+jBK1HTNku4uud5XHVG7tJmlHXyzc3L3ePir12bMPuKMrO8tjt26bcOygeOuW/ST7sjtRyW3u/HjVlU5I/7/nM33sOywGdNvdvIl41dQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACO0/8MV9LumUcAZAAAAABJRU5ErkJggg==')), 'image/png')
        if method == 'GET' and path in static_files:
            file = ROOT / 'static' / static_files[path]
            mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            if file.name.endswith('.webmanifest'):
                mime = 'application/manifest+json'
            content = file.read_bytes()
            if SITE_ROLE == 'player' and file.name == 'jogador-v2.html':
                content = content.replace(b'THE MILE <small>TESTES</small>', b'THE MILE')
                content = content.replace('Ambiente de testes · The Mile 2.0'.encode(), b'The Mile')
                content = content.replace('The Mile · Jogador (testes)'.encode(), b'The Mile')
            return respond(200, content, mime)
        if not path.startswith('/api/'):
            raise Problem(404, 'not_found')

        cookies = SimpleCookie()
        try:
            cookies.load(env.get('HTTP_COOKIE', ''))
        except Exception:
            pass
        token = cookies['mile_session'].value if 'mile_session' in cookies else ''

        with connect() as c:
            now = int(time.time())
            user = c.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1', (digest(token), now)).fetchone()

            if SITE_ROLE != 'both' and user and user['role'] != SITE_ROLE:
                user = None

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

            # Players can reschedule ordinary events, but cannot change nutrition or games.
            if path.startswith('/api/v2/player/events/') and method in ('PUT','DELETE'):
                if not user: raise Problem(401,'unauthorized')
                if user['role']!='player': raise Problem(403,'forbidden')
                event_id=path.rsplit('/',1)[-1]
                link=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",(user['id'],)).fetchone()
                if not link:raise Problem(404,'player_not_linked')
                existing=c.execute("""SELECT kind,event_date FROM v2_calendar_events WHERE id=? AND athlete_id=?""",
                                   (event_id,link['athlete_id'])).fetchone()
                if not existing: raise Problem(404,'not_found')
                if existing['kind']=='match':raise Problem(403,'forbidden')
                today=datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
                if method=='DELETE':
                    if existing['event_date']<today:raise Problem(400,'past_event_locked')
                    if not events_v2.delete_event(c,link['athlete_id'],event_id):raise Problem(404,'not_found')
                    return respond(200,{'ok':True})
                body=read_json(env)
                today=datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
                if existing['event_date']<today or body.get('event_date','')<today:
                    raise Problem(400,'past_event_locked')
                try:
                    changed=events_v2.update_event(c,link['athlete_id'],event_id,
                        {'event_date':body.get('event_date'),'session':body.get('session')},
                        user['id'],False)
                except ValueError:raise Problem(400,'invalid_event')
                if changed is None:raise Problem(404,'not_found')
                return respond(200,{'event':changed})

            if path == '/api/v2/supplement-library/bulk-preview' and method=='POST':
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                body=read_json(env)
                try: result=supplements_v2.library_bulk_zip(c,body.get('package_base64',''),False)
                except ValueError:raise Problem(400,'invalid_supplement_package')
                return respond(200,result)
            if path == '/api/v2/supplement-library/bulk-import' and method=='POST':
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                body=read_json(env)
                if body.get('confirmation')!='IMPORTAR':raise Problem(400,'confirmation_required')
                try: result=supplements_v2.library_bulk_zip(c,body.get('package_base64',''),True)
                except ValueError:raise Problem(400,'invalid_supplement_package')
                return respond(200,result)
            if path == '/api/v2/supplement-library' and method in ('GET','POST'):
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                if method=='GET':return respond(200,{'items':supplements_v2.library_list(c)})
                try:ident=supplements_v2.library_save(c,read_json(env))
                except ValueError:raise Problem(400,'invalid_supplement_catalogue')
                return respond(200,{'id':ident})
            if path.startswith('/api/v2/supplement-library/') and method=='DELETE':
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                ident=path.rsplit('/',1)[-1]
                if not re.fullmatch(r'[0-9a-f]{1,64}',ident):raise Problem(400,'invalid_id')
                c.execute('DELETE FROM v2_supplement_library WHERE id=?',(ident,))
                return respond(200,{'ok':True})
            if path.startswith('/api/v2/supplement-library/') and path.endswith('/image') and method=='GET':
                if not user:raise Problem(401,'unauthorized')
                ident=path.split('/')[-2]
                image=supplements_v2.library_image(c,ident)
                if not image:raise Problem(404,'not_found')
                binary=base64.b64decode(image)
                mime='image/png' if binary.startswith(b'\\x89PNG') else 'image/jpeg' if binary.startswith(b'\\xff\\xd8') else 'image/webp'
                return respond(200,binary,mime)
            # Supplementation: published routine and calendar day exceptions.
            if path.startswith('/api/v2/athletes/') and path.endswith('/supplements') and method in ('GET','PUT'):
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                seg=path.strip('/').split('/')
                if len(seg)!=5 or seg[:3]!=['api','v2','athletes']:raise Problem(404,'not_found')
                aid=seg[3]
                if method=='GET':return respond(200,supplements_v2.read(c,aid))
                try: return respond(200,supplements_v2.save(c,aid,read_json(env)))
                except ValueError:raise Problem(400,'invalid_supplementation')
            if path == '/api/v2/player/supplements' and method=='GET':
                if not user or user['role']!='player':raise Problem(403,'forbidden')
                link=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",(user['id'],)).fetchone()
                if not link:raise Problem(404,'player_not_linked')
                return respond(200,{"plan":supplements_v2.read(c,link['athlete_id'])['plan']})
            # Peri-training and peri-match imports: draft review precedes publication.
            if path.startswith('/api/v2/athletes/') and '/peri-imports' in path:
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                seg=path.strip('/').split('/')
                if len(seg)<5 or seg[:3]!=['api','v2','athletes'] or seg[4]!='peri-imports':
                    raise Problem(404,'not_found')
                aid=seg[3]
                if len(seg)==5 and method=='GET':
                    return respond(200,{'imports':peri_v2.list_imports(c,aid),'active':peri_v2.current(c,aid)})
                if len(seg)==5 and method=='POST':
                    body=read_json(env)
                    try:
                        encoded=body.get('pdf_base64','')
                        if not isinstance(encoded,str) or len(encoded)>4*1024*1024:raise ValueError('invalid_pdf')
                        content=base64.b64decode(encoded,validate=True)
                        draft=peri_v2.save_import(c,aid,body.get('kind'),body.get('filename'),content)
                    except (ValueError,TypeError,base64.binascii.Error):
                        raise Problem(400,'invalid_or_unreadable_peri_pdf')
                    if draft is None:raise Problem(404,'not_found')
                    return respond(201,{'draft':draft})
                if len(seg)==6 and method=='GET':
                    draft=peri_v2.get_import(c,aid,seg[5])
                    if draft is None:raise Problem(404,'not_found')
                    return respond(200,{'draft':draft})
                if len(seg)==7 and seg[6]=='copy' and method=='POST':
                    draft=peri_v2.copy_as_draft(c,aid,seg[5])
                    if draft is None:raise Problem(404,'not_found')
                    return respond(201,{'draft':draft})
                if len(seg)==7 and seg[6]=='option' and method=='PUT':
                    body=read_json(env)
                    try:
                        option=peri_v2.update_option(c,aid,seg[5],body.get('group_index'),body.get('option_index'),body.get('option'))
                    except ValueError:raise Problem(400,'invalid_peri_option')
                    if option is None:raise Problem(404,'not_found')
                    return respond(200,{'option':option})
                if len(seg)==7 and seg[6]=='publish' and method=='POST':
                    body=read_json(env)
                    if body.get('confirmation')!='PUBLICAR' or body.get('athlete_id')!=aid:
                        raise Problem(400,'publication_confirmation_required')
                    try: published=peri_v2.publish(c,aid,seg[5],user['id'])
                    except ValueError:raise Problem(400,'peri_review_incomplete')
                    if published is None:raise Problem(404,'not_found')
                    return respond(200,{'publication':published})
                raise Problem(404,'not_found')
            if path.startswith('/api/v2/athletes/') and '/match-peri/' in path and method=='PUT':
                if not user:raise Problem(401,'unauthorized')
                admin(user)
                seg=path.strip('/').split('/')
                if len(seg)!=7 or seg[4]!='match-peri':raise Problem(404,'not_found')
                try: saved=peri_v2.update_match_override(c,seg[3],seg[5],seg[6],read_json(env).get('state'))
                except ValueError:raise Problem(400,'invalid_override')
                if not saved:raise Problem(404,'not_found')
                return respond(200,{'ok':True})

            # Training and other simple calendar events. Nutrition overrides belong to admins.
            if path.startswith('/api/v2/athletes/') and '/events' in path:
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                segments=path.strip('/').split('/')
                if len(segments) not in (5,6) or segments[:3]!=['api','v2','athletes'] or segments[4]!='events':
                    raise Problem(404,'not_found')
                athlete_id=segments[3]
                if len(segments)==5 and method=='GET':
                    q=parse_qs(env.get('QUERY_STRING',''))
                    try: entries=events_v2.list_events(c,athlete_id,(q.get('start') or [''])[0],(q.get('end') or [''])[0])
                    except ValueError: raise Problem(400,'invalid_range')
                    return respond(200,{'events':entries})
                if len(segments)==5 and method=='POST':
                    try: event=events_v2.create_event(c,athlete_id,read_json(env),user['id'])
                    except ValueError: raise Problem(400,'invalid_event')
                    if event is None: raise Problem(404,'not_found')
                    return respond(201,{'event':event})
                if len(segments)==6 and method=='PUT':
                    try: event=events_v2.update_event(c,athlete_id,segments[5],read_json(env),user['id'],True)
                    except ValueError: raise Problem(400,'invalid_event')
                    if event is None: raise Problem(404,'not_found')
                    return respond(200,{'event':event})
                if len(segments)==6 and method=='DELETE':
                    if not events_v2.delete_event(c,athlete_id,segments[5]): raise Problem(404,'not_found')
                    return respond(200,{'ok':True})
                raise Problem(404,'not_found')

            # Administrator-only draft imports. Never expose these via player APIs.
            if path.startswith('/api/v2/athletes/') and '/plan-imports' in path:
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                segments = path.strip('/').split('/')
                if len(segments) < 5 or segments[:3] != ['api', 'v2', 'athletes'] or segments[4] != 'plan-imports':
                    raise Problem(404, 'not_found')
                athlete_id = segments[3]
                if len(segments) == 6 and segments[5] == 'meal-options' and method == 'GET':
                    return respond(200, {'options_by_color': plan_import_v2.validated_meal_options(c, athlete_id)})
                if len(segments) == 6 and segments[5] == 'published-preview' and method == 'GET':
                    return respond(200,{'options_by_color':plan_import_v2.published_meal_options(c,athlete_id)})
                if len(segments) == 6 and segments[5] == 'publication-history' and method == 'GET':
                    return respond(200,{'history':plan_import_v2.publication_history(c,athlete_id)})
                if len(segments) == 7 and segments[6] == 'publish' and method == 'POST':
                    body=read_json(env)
                    if body.get('confirmation')!='PUBLICAR' or body.get('athlete_id')!=athlete_id:
                        raise Problem(400,'publication_confirmation_required')
                    try:
                        publication=plan_import_v2.publish_validated_plan(c,athlete_id,segments[5],user['id'])
                    except ValueError: raise Problem(400,'plan_not_validated')
                    if publication is None: raise Problem(404,'not_found')
                    return respond(200,{'publication':publication})
                if len(segments) == 6 and segments[5] == 'publication-status' and method == 'GET':
                    return respond(200, {'colors': plan_import_v2.color_plan_status(c, athlete_id)})
                if len(segments) == 5:
                    if method == 'GET':
                        return respond(200, {'drafts': plan_import_v2.list_drafts(c, athlete_id)})
                    if method == 'POST':
                        body = read_json(env)
                        try:
                            encoded = body.get('pdf_base64', '')
                            if not isinstance(encoded, str) or len(encoded) > 4 * 1024 * 1024:
                                raise ValueError('invalid_pdf')
                            content = base64.b64decode(encoded, validate=True)
                            if not content.startswith(b'%PDF-') or len(content) > 3 * 1024 * 1024:
                                raise ValueError('invalid_pdf')
                            draft = plan_import_v2.save_draft(c, athlete_id, body.get('color'),
                                                               body.get('filename'), content)
                        except (ValueError, TypeError, base64.binascii.Error):
                            raise Problem(400, 'invalid_or_unreadable_pdf')
                        if draft is None:
                            raise Problem(404, 'not_found')
                        return respond(201, {'draft': draft})
                if len(segments) == 7 and segments[6] == 'group-meals' and method == 'PUT':
                    body=read_json(env)
                    try:
                        meals=plan_import_v2.update_group_meals(c,athlete_id,segments[5],body.get('group_index'),body.get('meals'))
                    except ValueError: raise Problem(400,'invalid_meal_mapping')
                    if meals is None: raise Problem(404,'not_found')
                    return respond(200,{'meals':meals})
                if len(segments) == 7 and segments[6] == 'review-status' and method == 'POST':
                    body = read_json(env)
                    try:
                        state = plan_import_v2.set_review_status(c, athlete_id, segments[5], body.get('action'))
                    except ValueError:
                        raise Problem(400, 'review_incomplete_or_invalid_status')
                    if state is None:
                        raise Problem(404, 'not_found')
                    return respond(200, {'status': state})
                if len(segments) == 6 and method == 'PUT':
                    body = read_json(env)
                    try:
                        updated = plan_import_v2.update_option(c, athlete_id, segments[5],
                            body.get('group_index'), body.get('option_index'), body.get('option'))
                    except ValueError:
                        raise Problem(400, 'invalid_option_data')
                    if updated is None:
                        raise Problem(404, 'not_found')
                    return respond(200, {'option': updated})
                if len(segments) == 6 and method == 'GET':
                    draft = plan_import_v2.get_draft(c, athlete_id, segments[5])
                    if draft is None:
                        raise Problem(404, 'not_found')
                    return respond(200, {'draft': draft})
                raise Problem(404, 'not_found')

            if path.startswith('/api/v2/athletes/') and path.endswith('/calendar/meal-color') and method == 'PUT':
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                aid=path.split('/')[4]
                body=read_json(env)
                try:
                    saved=day_colors_v2.set_color(c,aid,body.get('date'),body.get('meal'),body.get('color'),user['id'])
                except ValueError: raise Problem(400,'invalid_day_meal_color')
                if saved is None: raise Problem(404,'not_found')
                return respond(200,{'override':saved})

            if path.startswith('/api/v2/athletes/') and path.endswith('/calendar') and method == 'GET':
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                aid = path.split('/')[4]
                query = parse_qs(env.get('QUERY_STRING', ''))
                start = (query.get('start') or [''])[0]
                end = (query.get('end') or [''])[0]
                try:
                    from calendar_v2 import classify_range
                    matches = microcycles_v2.list_matches(c, aid)
                    days = classify_range(start, end, [m['match_date'] for m in matches])
                except ValueError:
                    raise Problem(400, 'invalid_calendar_range')
                event_data=events_v2.list_events(c,aid,start,end)
                override_rows=c.execute("SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?",(aid,)).fetchall()
                return respond(200, {'matches': matches, 'days': days,'events':event_data,
                                     'peri_meals':peri_v2.list_event_meals(c,aid,start,end,event_data),
                                     'meal_color_overrides':day_colors_v2.list_colors(c,aid,start,end),
                                     'match_peri_overrides':[dict(r) for r in override_rows]})
            if path == '/api/v2/dishes/photo' and method == 'POST':
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                import uuid
                body=read_json(env)
                dish_id=body.get('id')
                payload=body.get('image')
                if not isinstance(payload,str) or len(payload)>17000000: raise Problem(400,'invalid_image')
                try:
                    raw=base64.b64decode(payload,validate=True)
                    if len(raw)>12000000: raise ValueError()
                    source=Image.open(io.BytesIO(raw))
                    source.verify()
                    source=Image.open(io.BytesIO(raw))
                    if source.width>8000 or source.height>8000 or source.width*source.height>32000000: raise ValueError()
                    source=source.convert('RGB')
                    source.thumbnail((900,900))
                    result=io.BytesIO()
                    source.save(result,format='WEBP',quality=76,method=4)
                    raw=result.getvalue()
                    if len(raw)>1200000: raise ValueError()
                except (ValueError,UnidentifiedImageError,OSError,base64.binascii.Error):
                    raise Problem(400,'invalid_image')
                if dish_id:
                    dish=c.execute("SELECT id FROM v2_dish_library WHERE id=?",(dish_id,)).fetchone()
                    if not dish: raise Problem(404,'not_found')
                else:
                    name_pt=body.get('name_pt')
                    name_en=body.get('name_en','')
                    category=body.get('category')
                    if not all(isinstance(v,str) for v in (name_pt,name_en,category)) or not 1<=len(name_pt.strip())<=200 or not 1<=len(category.strip())<=100 or len(name_en)>200: raise Problem(400,'invalid_dish')
                    dish_id=secrets.token_hex(12)
                filename=dish_id+'.webp'
                store_dish_image(c, filename, raw)
                if not body.get('id'):
                    c.execute("INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename) VALUES(?,?,?,?,?)",(dish_id,category.strip(),name_pt.strip(),name_en.strip(),filename))
                    c.commit()
                return respond(200,{'id':dish_id,'ok':True})
            if path == '/api/v2/dishes/edit' and method == 'PUT':
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                body=read_json(env)
                try:
                    ok=microcycles_v2.update_dish(c,body.get('id'),body.get('name_pt'),body.get('name_en',''),body.get('category'),body.get('active',True))
                except ValueError: raise Problem(400,'invalid_dish')
                if not ok: raise Problem(404,'not_found')
                return respond(200,{'ok':True})
            if path == '/api/v2/dishes' and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                return respond(200, {'dishes':microcycles_v2.list_dish_library(c)})
            if path == '/api/v2/dishes/import' and method == 'POST':
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                raw=read_body(env, 22*1024*1024)
                try:
                    with zipfile.ZipFile(io.BytesIO(raw)) as z:
                        rows=list(csv.DictReader(io.TextIOWrapper(z.open('catalog.csv'),encoding='utf-8-sig')))
                        if not 1 <= len(rows) <= 1000: raise ValueError()
                        files={}
                        for row in rows:
                            dish_id=row['id']
                            filename=row['image_filename']
                            if not re.fullmatch(r'[a-z0-9-]{4,60}',dish_id) or filename!=dish_id+'.webp':
                                raise ValueError()
                            if not row['name_pt'].strip() or not row['category'].strip(): raise ValueError()
                            data=z.read('images/'+filename)
                            if len(data)>400000 or data[:4]!=b'RIFF' or data[8:12]!=b'WEBP': raise ValueError()
                            files[filename]=data
                    for filename,data in files.items():
                        store_dish_image(c,filename,data)
                    microcycles_v2.import_dish_catalog(c,rows)
                except (ValueError,KeyError,zipfile.BadZipFile,FileNotFoundError) as exc:
                    raise Problem(400,'invalid_dish_archive') from exc
                return respond(200,{'imported':len(rows)})
            if path.startswith('/api/v2/dishes/image/') and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                identifier=path.rsplit('/',1)[-1]
                if not re.fullmatch(r'[a-z0-9-]{4,60}',identifier): raise Problem(404,'not_found')
                dish=c.execute("SELECT image_filename FROM v2_dish_library WHERE id=? AND active=1",(identifier,)).fetchone()
                if not dish: raise Problem(404,'not_found')
                image_data=read_dish_image(c,dish['image_filename'])
                if image_data is None: raise Problem(404,'not_found')
                return respond(200,image_data,'image/webp')
            if path.startswith('/api/v2/athletes/') and path.endswith('/profile') and method == 'PUT':
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                athlete_id=path.split('/')[4]
                body=read_json(env)
                try:
                    result=microcycles_v2.update_athlete_profile(c,athlete_id,body.get('name'),body.get('weight_kg'),body.get('height_cm'),body.get('profile_notes',''))
                except ValueError: raise Problem(400,'invalid_athlete_profile')
                if result is None: raise Problem(404,'not_found')
                return respond(200,{'athlete':result})
            if path.startswith('/api/v2/athletes/') and path.endswith('/menus/batch') and method == 'PUT':
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                aid=path.split('/')[4]
                items=read_json(env).get('items')
                if not isinstance(items,list) or len(items)>14:
                    raise Problem(400,'invalid_menu_batch')
                try:
                    validated=[]
                    for item in items:
                        if not isinstance(item,dict): raise ValueError()
                        date=calendar_v2.parse_day(item.get('menu_date')).isoformat()
                        meal=item.get('meal')
                        kind=item.get('kind')
                        value=item.get('value')
                        if meal not in ('lunch','dinner') or kind not in ('category','dish') or not isinstance(value,str) or not value.strip() or len(value)>200: raise ValueError()
                        if kind=='category' and value.strip() not in ('Carne branca','Carne vermelha','Peixe magro','Peixe gordo','Livre','Pós-jogo','Mix'): raise ValueError()
                        validated.append((date,meal,kind,value.strip()))
                    if len(set((v[0],v[1]) for v in validated))!=len(validated): raise ValueError()
                except (ValueError,TypeError,AttributeError):
                    raise Problem(400,'invalid_menu_batch')
                if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?",(aid,)).fetchone(): raise Problem(404,'not_found')
                for date,meal,kind,value in validated:
                    c.execute("""INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value)
                      VALUES(?,?,?,?,?) ON CONFLICT(athlete_id,menu_date,meal) DO UPDATE SET
                      kind=excluded.kind,value=excluded.value""",(aid,date,meal,kind,value))
                c.commit()
                return respond(200,{'saved':len(validated)})
            if path.startswith('/api/v2/athletes/') and path.endswith('/menus'):
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                aid = path.split('/')[4]
                if method == 'GET':
                    q = parse_qs(env.get('QUERY_STRING', ''))
                    try:
                        menus = microcycles_v2.list_menus(c, aid, (q.get('start') or [''])[0], (q.get('end') or [''])[0])
                    except ValueError:
                        raise Problem(400, 'invalid_menu_range')
                    return respond(200, {'menus': menus})
                if method == 'PUT':
                    body = read_json(env)
                    try:
                        item = microcycles_v2.save_menu(c, aid, body.get('menu_date'), body.get('meal'), body.get('kind'), body.get('value'))
                    except ValueError:
                        raise Problem(400, 'invalid_menu')
                    if item is None:
                        raise Problem(404, 'not_found')
                    return respond(200, {'menu': item})
                if method == 'DELETE':
                    body = read_json(env)
                    try:
                        microcycles_v2.delete_menu(c, aid, body.get('menu_date'), body.get('meal'))
                    except ValueError:
                        raise Problem(400, 'invalid_menu')
                    return respond(200, {'ok': True})
            if path.startswith('/api/v2/athletes/') and path.endswith('/matches'):
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                aid = path.split('/')[4]
                if method == 'GET':
                    return respond(200, {'matches': microcycles_v2.list_matches(c, aid)})
                if method == 'POST':
                    body = read_json(env)
                    try:
                        match = microcycles_v2.add_match(c, aid, body.get('match_date'), body.get('match_time'))
                    except ValueError:
                        raise Problem(400, 'invalid_or_duplicate_match')
                    if match is None:
                        raise Problem(404, 'not_found')
                    return respond(201, {'match': match})
            if path.startswith('/api/v2/athletes/') and '/matches/' in path and method == 'PUT':
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                parts = path.split('/')
                if len(parts) != 7 or parts[5] != 'matches':
                    raise Problem(404, 'not_found')
                body = read_json(env)
                try:
                    match = microcycles_v2.update_match(c, parts[4], parts[6], body.get('match_date'), body.get('match_time'))
                except ValueError:
                    raise Problem(400, 'invalid_or_duplicate_match')
                if match is None:
                    raise Problem(404, 'not_found')
                return respond(200, {'match': match})
            if path.startswith('/api/v2/athletes/') and '/matches/' in path and method == 'DELETE':
                if not user:
                    raise Problem(401, 'unauthorized')
                admin(user)
                parts = path.split('/')
                if len(parts) != 7 or parts[5] != 'matches':
                    raise Problem(404, 'not_found')
                if not microcycles_v2.delete_match(c, parts[4], parts[6]):
                    raise Problem(404, 'not_found')
                return respond(200, {'ok': True})

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
                if len(segments) == 5 and segments[4] == 'weight' and method == 'PUT':
                    try:
                        weight = microcycles_v2.update_athlete_weight(c, segments[3], read_json(env).get('weight_kg'))
                    except ValueError:
                        raise Problem(400, 'invalid_weight')
                    return respond(200, {'weight_kg': weight})
                if len(segments) == 5 and segments[4] == 'microcycles' and method == 'GET':
                    result = microcycles_v2.get_model(c, segments[3])
                    if result is None:
                        raise Problem(404, 'not_found')
                    return respond(200, result)
                if len(segments) >= 6 and segments[4] == 'microcycles' and method == 'PUT':
                    body = read_json(env)
                    if 'color' not in body:
                        raise Problem(400, 'invalid_model_cell')
                    try:
                        ok = microcycles_v2.update_cell(c, segments[3], '/'.join(segments[5:]),
                            body.get('meal'), body.get('color'), user['id'])
                    except ValueError:
                        raise Problem(400, 'invalid_model_cell')
                    if not ok:
                        raise Problem(404, 'not_found')
                    return respond(200, {'ok': True})

            # Administrative V2 account management; all operations scoped to an athlete.
            if path.startswith('/api/v2/athletes/') and path.endswith('/access'):
                if not user: raise Problem(401, 'unauthorized')
                admin(user)
                parts=path.strip('/').split('/')
                if len(parts)!=5: raise Problem(404,'not_found')
                aid=parts[3]
                athlete=c.execute("SELECT id,name FROM v2_athletes WHERE id=?",(aid,)).fetchone()
                if not athlete: raise Problem(404,'not_found')
                existing=c.execute("""SELECT u.id,u.username,u.active FROM v2_player_links l
                   JOIN users u ON u.id=l.user_id WHERE l.athlete_id=?""",(aid,)).fetchone()
                if method=='GET':
                    return respond(200,{'access':dict(existing) if existing else None})
                if method=='POST':
                    if existing: raise Problem(409,'access_exists')
                    body=read_json(env);username=str(body.get('username','')).strip().lower()
                    password=body.get('password','')
                    if not re.fullmatch(r'[a-z]{4,40}',username) or not isinstance(password,str) or len(password)<12 or len(password)>256:
                        raise Problem(400,'invalid_credentials')
                    if c.execute("SELECT id FROM users WHERE username=?",(username,)).fetchone():
                        raise Problem(409,'username_exists')
                    uid=secrets.token_hex(16)
                    # Internal unique email is never a login identifier for player accounts.
                    email='v2-'+uid+'@accounts.internal.invalid'
                    c.execute("""INSERT INTO users(id,name,email,username,role,password,active)
                                 VALUES(?,?,?,?,?,?,1)""",(uid,athlete['name'],email,username,'player',password_hash(password)))
                    c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES(?,?,?)",(uid,aid,int(time.time())))
                    c.commit()
                    return respond(201,{'access':{'id':uid,'username':username,'active':1}})
                if method=='PUT':
                    if not existing: raise Problem(404,'access_not_found')
                    body=read_json(env)
                    if type(body.get('active')) is not bool: raise Problem(400,'invalid_status')
                    active=int(body['active'])
                    c.execute("UPDATE users SET active=? WHERE id=? AND role='player'",(active,existing['id']))
                    if not active: c.execute("DELETE FROM sessions WHERE user_id=?",(existing['id'],))
                    c.commit()
                    return respond(200,{'access':{'id':existing['id'],'username':existing['username'],'active':active}})
            # V2 player access: self-only, no athlete id supplied by the client.
            # Accounts are not linked or activated by this read-only endpoint.
            if path == '/api/v2/player/profile-photo' and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                if user['role'] != 'player': raise Problem(403, 'forbidden')
                photo = c.execute("SELECT photo,photo_mime FROM users WHERE id=? AND active=1 AND role='player'", (user['id'],)).fetchone()
                if not photo or not photo['photo']: raise Problem(404, 'not_found')
                return respond(200, bytes(photo['photo']), photo['photo_mime'] or 'image/jpeg')

            if path == '/api/v2/player/assessments' and method == 'GET':
                if not user or user['role'] != 'player': raise Problem(403,'forbidden')
                link=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",(user['id'],)).fetchone()
                if not link: raise Problem(404,'player_not_linked')
                return respond(200,{'assessments':assessments_v2.rows(c,link['athlete_id'],public=True),
                                   'fields':assessments_v2.FIELDS,'averages_fields':assessments_v2.AVERAGES})
            if path.startswith('/api/v2/athletes/') and '/assessments' in path:
                if not user: raise Problem(401,'unauthorized')
                admin(user)
                bits=path.strip('/').split('/')
                if len(bits)!=5 or bits[0:3]!=['api','v2','athletes'] or bits[4]!='assessments':
                    raise Problem(404,'not_found')
                athlete_id=bits[3]
                if not c.execute('SELECT id FROM v2_athletes WHERE id=?',(athlete_id,)).fetchone():
                    raise Problem(404,'not_found')
                if method=='GET':
                    return respond(200,{'assessments':assessments_v2.rows(c,athlete_id),
                                        'fields':assessments_v2.FIELDS,'averages_fields':assessments_v2.AVERAGES})
                if method=='POST':
                    payload=json.loads(read_body(env, 29 * 1024 * 1024))
                    if not isinstance(payload,dict):raise Problem(400,'invalid_request')
                    if payload.get('action')=='preview':
                        try:
                            result=assessments_v2.parse_pdf(payload.get('pdf_base64'))
                        except ValueError:raise Problem(400,'invalid_assessment_pdf')
                        result.pop('pdf_bytes',None)
                        return respond(200,result)
                    if payload.get('action')=='save':
                        try:aid=assessments_v2.save(c,athlete_id,payload,user['id'])
                        except ValueError:raise Problem(400,'invalid_assessment')
                        return respond(200,{'saved':True,'id':aid})
                    raise Problem(400,'invalid_action')
            if path == '/api/v2/player/me' and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                if user['role'] != 'player': raise Problem(403, 'forbidden')
                link = c.execute("""SELECT a.id,a.name,a.weight_kg FROM v2_player_links l
                                    JOIN v2_athletes a ON a.id=l.athlete_id
                                    WHERE l.user_id=?""", (user['id'],)).fetchone()
                if not link: raise Problem(404, 'player_not_linked')
                return respond(200, {'player': dict(link)})
            if path in ('/api/v2/player/calendar', '/api/v2/player/menus') and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                if user['role'] != 'player': raise Problem(403, 'forbidden')
                link = c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?", (user['id'],)).fetchone()
                if not link: raise Problem(404, 'player_not_linked')
                q = parse_qs(env.get('QUERY_STRING', ''))
                first=(q.get('start') or [''])[0]
                last=(q.get('end') or [''])[0]
                try:
                    if path.endswith('/menus'):
                        return respond(200, {'menus': microcycles_v2.list_menus(c, link['athlete_id'], first, last)})
                    days = calendar_v2.classify_range(first, last, [m['match_date'] for m in microcycles_v2.list_matches(c, link['athlete_id'])])
                except ValueError: raise Problem(400, 'invalid_calendar_range')
                model_data = microcycles_v2.get_model(c, link['athlete_id'])
                event_data=events_v2.list_events(c,link['athlete_id'],first,last)
                return respond(200, {'days': days, 'classifications': model_data['classifications'], 'meals':model_data['meals'], 'events':event_data, 'matches':[m for m in microcycles_v2.list_matches(c,link['athlete_id']) if first<=m['match_date']<=last], 'peri_meals':peri_v2.list_event_meals(c,link['athlete_id'],first,last,event_data), 'meal_color_overrides':day_colors_v2.list_colors(c,link['athlete_id'],first,last), 'supplements_by_day':supplements_v2.days(c,link['athlete_id'],first,last,microcycles_v2.list_matches(c,link['athlete_id']),event_data)})
            if path == '/api/v2/player/dishes' and method == 'GET':
                if not user: raise Problem(401,'unauthorized')
                if user['role']!='player': raise Problem(403,'forbidden')
                link=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",(user['id'],)).fetchone()
                if not link: raise Problem(404,'player_not_linked')
                rows=c.execute("""SELECT DISTINCT d.id,d.name_pt FROM v2_dish_library d
                  JOIN v2_weekly_menus m ON m.kind='dish' AND m.value=d.name_pt
                  WHERE m.athlete_id=? AND d.active=1""",(link['athlete_id'],)).fetchall()
                return respond(200,{'dishes':[dict(row) for row in rows]})
            if path.startswith('/api/v2/player/dish-photo/') and method == 'GET':
                if not user: raise Problem(401,'unauthorized')
                if user['role']!='player': raise Problem(403,'forbidden')
                link=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",(user['id'],)).fetchone()
                if not link: raise Problem(404,'player_not_linked')
                identifier=path.rsplit('/',1)[-1]
                if not re.fullmatch(r'[a-z0-9-]{4,60}',identifier): raise Problem(404,'not_found')
                row=c.execute("""SELECT d.image_filename FROM v2_dish_library d
                   JOIN v2_weekly_menus m ON m.kind='dish' AND m.value=d.name_pt
                   WHERE m.athlete_id=? AND d.id=? AND d.active=1 LIMIT 1""",(link['athlete_id'],identifier)).fetchone()
                if not row: raise Problem(404,'not_found')
                image_data=read_dish_image(c,row['image_filename'])
                if image_data is None: raise Problem(404,'not_found')
                return respond(200,player_menu_photo(image_data),'image/webp')
            if path == '/api/v2/player/plans' and method == 'GET':
                if not user: raise Problem(401, 'unauthorized')
                if user['role'] != 'player': raise Problem(403, 'forbidden')
                link = c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?", (user['id'],)).fetchone()
                if not link: raise Problem(404, 'player_not_linked')
                return respond(200, {'options_by_color': plan_import_v2.published_meal_options(c, link['athlete_id']), 'peri_plans': peri_v2.current(c, link['athlete_id'])})
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
                    if SITE_ROLE != 'both' and u and u['role'] != SITE_ROLE:
                        u = None
                    if not password_valid(password, u['password'] if u else None):
                        raise Problem(401, 'credentials')
                else:
                    if SITE_ROLE == 'player':
                        raise Problem(404, 'not_found')
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
                if SITE_ROLE != 'both' and target and target['role'] != SITE_ROLE:
                    target = None
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
                    # Revoke all active sessions when access or credentials change.
                    if p['password'] or (access_until != player['access_until']):
                        c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
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
