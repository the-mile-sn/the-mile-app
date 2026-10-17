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

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('MILE_DATA_DIR', ROOT / 'data')).resolve()
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
BASE_URL = os.environ.get('MILE_BASE_URL', 'http://localhost:8000').strip().rstrip('/')
ALLOWED_ORIGINS = {BASE_URL, 'https://the-mile-app.onrender.com'}
ALLOWED_ORIGIN_HOSTS = {h for h in (urlparse(x).hostname for x in ALLOWED_ORIGINS) if h}
ALLOWED_ORIGIN_HOSTS.update({'app.themile.pt', 'the-mile-app.onrender.com'})
SECURE = BASE_URL.startswith('https://')
MAX_PDF = 20 * 1024 * 1024
MAX_JSON = 5 * 1024 * 1024
MAX_PHOTO = 3 * 1024 * 1024
FOLDERS = ('nutrition', 'menus', 'other', 'anthropometry', 'weekly', 'weekly_next')
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
    c = sqlite3.connect(DATA / 'mile.sqlite3', timeout=20)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys = ON')
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
            CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL;
            ''')
        else:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','player')), password TEXT, active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS activations(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), folder TEXT NOT NULL, title TEXT NOT NULL, size INTEGER NOT NULL, updated INTEGER NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), data BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_time INTEGER NOT NULL);
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
            }
            for column, spec in additions.items():
                if column not in existing:
                    c.execute(f'ALTER TABLE users ADD COLUMN {column} {spec}')
            c.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL')
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


def player_dict(row, include_private=True):
    data = {
        'id': row['id'], 'name': row['name'], 'username': row['username'], 'role': row['role'],
        'active': bool(row['active']), 'menus_enabled': bool(row['menus_enabled']),
        'anthropometry_enabled': bool(row['anthropometry_enabled']),
        'has_photo': bool(row['photo_mime']),
    }
    if include_private:
        data.update({
            'birth_date': row['birth_date'], 'sex': row['sex'], 'height': row['height'], 'weight': row['weight'],
            'plan_name': row['plan_name'], 'renewal_date': row['renewal_date'], 'weekly_status': row['weekly_status'],
            'weekly_next_activate_at': row['weekly_next_activate_at'],
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
            '/icon-512.png': 'icon-512.png', '/apple-touch-icon.png': 'apple-touch-icon.png',
        }
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

        with connect() as c:
            now = int(time.time())
            user = c.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1', (digest(token), now)).fetchone()
            if user and user['role'] == 'player' and activate_due_weekly(c, user['id'], now):
                user = c.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1', (digest(token), now)).fetchone()

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
                    activate_due_weekly(c, None, now)
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
                    fields = [p['name'], f"{p['username']}@players.themile.local", p['username'], p['birth_date'], p['sex'],
                              p['height'], p['weight'], p['menus_enabled'], p['anthropometry_enabled'], p['plan_name'], p['renewal_date']]
                    sql = 'UPDATE users SET name=?,email=?,username=?,birth_date=?,sex=?,height=?,weight=?,menus_enabled=?,anthropometry_enabled=?,plan_name=?,renewal_date=?'
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
                    if status != 'available':
                        c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly'", (uid,))
                    c.commit()
                    return respond(200, {'ok': True})
                if action == 'weekly-launch':
                    nxt = c.execute("SELECT id FROM documents WHERE user_id=? AND folder='weekly_next' ORDER BY updated DESC LIMIT 1", (uid,)).fetchone()
                    if not nxt:
                        raise Problem(404, 'not_found')
                    c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly'", (uid,))
                    c.execute("UPDATE documents SET folder='weekly',updated=? WHERE id=?", (now, nxt['id']))
                    c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly_next' AND id<>?", (uid, nxt['id']))
                    c.execute("UPDATE users SET weekly_status='available',weekly_next_activate_at=NULL WHERE id=?", (uid,))
                    c.commit()
                    return respond(200, {'ok': True})
                raise Problem(404, 'not_found')

            if path == '/api/documents':
                qs = parse_qs(env.get('QUERY_STRING', ''))
                uid = qs.get('player', [user['id']])[0]
                authorize_owner(user, uid)
                activate_due_weekly(c, uid, now)
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
                    if folder == 'weekly':
                        c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly'", (uid,))
                        c.execute("UPDATE users SET weekly_status='available' WHERE id=?", (uid,))
                    if folder == 'weekly_next':
                        c.execute("DELETE FROM documents WHERE user_id=? AND folder='weekly_next'", (uid,))
                        c.execute("UPDATE users SET weekly_next_activate_at=? WHERE id=?", (next_weekly_activation(now), uid))
                    did = secrets.token_hex(16)
                    c.execute('INSERT INTO documents(id,user_id,folder,title,size,updated,uploaded_by,data) VALUES(?,?,?,?,?,?,?,?)',
                              (did, uid, folder, title, len(blob), now, user['id'], blob))
                    c.commit()
                    return respond(201, {'id': did})

            if path.startswith('/api/documents/'):
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
                    headers.append(('Content-Disposition', "inline; filename=document.pdf; filename*=UTF-8''" + quote((d['title'] if d['title'].lower().endswith('.pdf') else d['title'] + '.pdf'), safe='')))
                    return respond(200, bytes(d['data']), 'application/pdf')
                if method == 'DELETE':
                    admin(user)
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
