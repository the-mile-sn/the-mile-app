"""Snapshot of every connection the apps use, to compare before/after a change.

Usage:  python3 contract_snapshot.py <branch_dir> <output.json>

Seeds a disposable SQLite database (admin, player linked to an athlete, chef
linked to the same athlete) and sends GET requests to:
  * every static page/asset the server serves;
  * every /api/ path written in the apps' JavaScript/HTML;
  * every exact route and athlete sub-route declared in app.py;
for four visitors (anonymous, admin, player, chef). It records the status code
and the response shape (every JSON key at every depth with its type, or content type + hash for files).
Only GET requests: nothing is written except the seed.
"""
import glob
import hashlib
import importlib
import io
import json
import os
import re
import sys
import tempfile
import time
from datetime import date, timedelta

branch, output = sys.argv[1], sys.argv[2]
os.chdir(branch)
sys.path.insert(0, branch)
os.environ['MILE_DATA_DIR'] = tempfile.mkdtemp()
os.environ['MILE_SITE_ROLE'] = 'both'
os.environ.pop('DATABASE_URL', None)
import logging
logging.disable(logging.CRITICAL)
app = importlib.import_module('app')
app.initialize()
import microcycles_v2

now = int(time.time())
with app.connect() as c:
    try:
        aid = microcycles_v2.create_athlete(c, 'Atleta Teste', weight_kg=70)['id']
    except TypeError:
        aid = microcycles_v2.create_athlete(c, 'Atleta Teste')['id']
    users = [('adm', 'admin', 'adm@example.invalid', None), ('ply', 'player', 'ply@players.themile.local', 'playerseed'),
             ('chf', 'chef', 'chf@chefs.invalid', 'chefseed')]
    for uid, role, email, username in users:
        c.execute("INSERT INTO users(id,name,email,username,role,password,active,sex) VALUES(?,?,?,?,?,?,1,'M')",
                  (uid, uid, email, username, role, 'x'))
        c.execute('INSERT INTO sessions VALUES(?,?,?,?)', (app.digest('tok-' + uid), uid, 'csrf-' + uid, now + 365 * 86400))  # long: /api/me must not rotate it
    c.execute('INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES(?,?,1)', ('ply', aid))
    c.execute("INSERT INTO v2_chef_links(user_id,athlete_id,language,linked_at,created_by) VALUES('chf',?,'pt',1,'adm')", (aid,))

source = open('app.py').read()
paths = set()
for f in glob.glob('static/*.js') + glob.glob('static/*.html'):
    paths.update(re.findall(r"""['"`](/api/[A-Za-z0-9_/.-]*)""", open(f, errors='ignore').read()))
paths.update(re.findall(r"path ?== ?'(/api/[^']+)'", source))
for group in re.findall(r"path in \(([^)]*)\)", source):
    paths.update(re.findall(r"'(/api/[^']+)'", group))
athlete_suffixes = set(re.findall(r"path\.endswith\('(/[a-z0-9/_-]+)'\)", source))
athlete_suffixes |= {'/' + s for s in re.findall(r"segments\[4\] ?== ?'([a-z-]+)'", source)}
athlete_suffixes |= {'/' + s for s in re.findall(r"seg\[4\] ?!= ?'([a-z-]+)'", source)}
for suffix in athlete_suffixes:
    paths.add('/api/v2/athletes/' + aid + suffix)
paths = {p.rstrip('/') if p.endswith('/') and p.count('/') > 2 else p for p in paths}
static_paths = sorted(re.findall(r"'(/[A-Za-z0-9._-]*)': '[A-Za-z0-9._-]+\.(?:html|js|css|png|webmanifest)'", source))

monday = date.today() - timedelta(days=date.today().weekday())
query = 'start=%s&end=%s&date=%s&local_date=%s&q=a' % (monday, monday + timedelta(days=6), date.today(), date.today())
visitors = {'anon': None, 'admin': 'adm', 'player': 'ply', 'chef': 'chf'}


def structure(value):
    """Full shape of a JSON value: every key at every depth, with value types."""
    if isinstance(value, dict):
        return {k: structure(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [len(value)] + [structure(v) for v in value[:3]]
    return type(value).__name__


def get(path, uid):
    out = {}
    env = {'REQUEST_METHOD': 'GET', 'PATH_INFO': path, 'QUERY_STRING': query,
           'HTTP_COOKIE': ('mile_session=tok-' + uid) if uid else '', 'CONTENT_LENGTH': '0',
           'wsgi.input': io.BytesIO(b'')}
    body = b''.join(app.application(env, lambda status, headers: out.update(status=status, headers=dict(headers))))
    kind = out['headers'].get('Content-Type', '')
    if kind.startswith('application/json'):
        try:
            data = json.loads(body)
            shape = structure(data)
            if isinstance(data, dict) and 'error' in data:
                shape = ['error=' + str(data['error'])]
        except ValueError:
            shape = 'invalid-json'
    else:
        shape = kind + ' sha=' + hashlib.sha256(body).hexdigest()[:16]
    return out['status'][:3], shape


result = {}
for path in sorted(static_paths) + sorted(paths):
    for name, uid in visitors.items():
        try:
            result[path.replace(aid, '<atleta>') + ' [' + name + ']'] = get(path, uid)
        except Exception as exc:  # recorded, never hidden
            result[path.replace(aid, '<atleta>') + ' [' + name + ']'] = ('EXC', type(exc).__name__)
json.dump(result, open(output, 'w'), indent=1, ensure_ascii=False, default=str)
print('%d pedidos (%d endereços x %d visitantes) -> %s' % (len(result), len(result) // len(visitors), len(visitors), output))
