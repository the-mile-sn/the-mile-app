"""Isolated visual QA server for the native Food Library in The Mile.

This test-only WSGI application intentionally does NOT import app.py, connect to
PostgreSQL, read DATABASE_URL, or access any production athlete data.
All mutations affect a disposable SQLite file in /tmp on the test instance.
Never merge this file into production or the feature pull request.
"""
import json
import mimetypes
import sqlite3
import threading
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import unquote, parse_qs

ROOT = Path(__file__).resolve().parent
STATIC = (ROOT / "static").resolve()
DEMO_DB = "/tmp/the-mile-food-library-preview-native-20261109.sqlite3"
LOCK = threading.Lock()
SEEDS = [
    {"id": "demo-aveia", "display_name": "Aveia em flocos", "base_name": "Aveia em flocos", "category": "Cereais",
     "variant": "plain", "edible_fraction": 1, "reference_g": 100, "kcal": 370, "protein_g": 13.0, "carbs_g": 61, "fat_g": 7, "notes": "Alimento de demonstração"},
    {"id": "demo-banana", "display_name": "Banana", "base_name": "Banana", "category": "Fruta",
     "variant": "plain", "edible_fraction": 1, "reference_g": 100, "kcal": 89, "protein_g": 1.1, "carbs_g": 23, "fat_g": 0.3, "notes": "Valores fictícios para teste visual"},
    {"id": "demo-frango", "display_name": "Peito de frango", "base_name": "Peito de frango", "category": "Carne branca",
     "variant": "plain", "edible_fraction": 1, "reference_g": 100, "kcal": 110, "protein_g": 23.1, "carbs_g": 0, "fat_g": 1.2, "notes": "Valores meramente ilustrativos"},
    {"id": "demo-arroz", "display_name": "Arroz branco cozido", "base_name": "Arroz branco cozido", "category": "Cereais",
     "variant": "plain", "edible_fraction": 1, "reference_g": 100, "kcal": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3, "notes": "Exemplo associado a um plano: eliminação bloqueada"},
    {"id": "demo-leite", "display_name": "Leite meio-gordo", "base_name": "Leite meio-gordo", "category": "Laticínios",
     "variant": "plain", "edible_fraction": 1, "reference_g": 200, "kcal": 47, "protein_g": 3.5, "carbs_g": 4.8, "fat_g": 1.6, "notes": "Exemplo de biblioteca"},
    {"id": "demo-azeite", "display_name": "Azeite virgem extra", "base_name": "Azeite virgem extra", "category": "Gorduras",
     "variant": "plain", "edible_fraction": 1, "reference_g": 10, "kcal": 900, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "notes": "Exemplo de biblioteca"}
]

def connect():
    connection = sqlite3.connect(DEMO_DB, timeout=8)
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE IF NOT EXISTS demo_foods (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
    with LOCK:
        count = connection.execute("SELECT COUNT(*) FROM demo_foods").fetchone()[0]
        if count == 0:
            connection.executemany("INSERT INTO demo_foods (id,payload) VALUES (?,?)",
                                   [(x["id"], json.dumps(x, ensure_ascii=False)) for x in SEEDS])
            connection.commit()
    return connection

def output(start_response, payload, code=200, content_type="application/json; charset=utf-8", method="GET"):
    body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    status = {200: "200 OK", 201: "201 Created", 400: "400 Bad Request", 403: "403 Forbidden",
              404: "404 Not Found", 405: "405 Method Not Allowed", 409: "409 Conflict",
              413: "413 Payload Too Large"}.get(code, str(code) + " Error")
    start_response(status, [("Content-Type", content_type), ("Content-Length", str(len(body))),
                            ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
                            ("X-Robots-Tag", "noindex, nofollow")])
    return [b"" if method == "HEAD" else body]

def normalize(text):
    v = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(ch for ch in v if unicodedata.category(ch) != "Mn").strip()

def catalog(environ, start_response, path, method):
    if path == "/api/me" and method in ("GET", "HEAD"):
        return output(start_response, {"user": {"id": "demo-admin", "name": "Administrador · Demo",
                          "email": "demo@the-mile.invalid", "role": "admin", "has_photo": False},
                          "csrf": "demo-csrf-only"}, method=method)
    if path == "/api/v2/athletes" and method in ("GET", "HEAD"):
        return output(start_response, {"athletes": []}, method=method)
    if path == "/api/v2/admin/dashboard" and method in ("GET", "HEAD"):
        return output(start_response, {"players": [], "events": [], "recent": [], "days": [],
                                       "today": "2026-11-09", "week": []}, method=method)
    if path == "/api/v2/food-library" and method == "GET":
        qs = parse_qs(environ.get("QUERY_STRING", ""))
        with connect() as con:
            items = [json.loads(row["payload"]) for row in con.execute("SELECT payload FROM demo_foods ORDER BY id")]
        categories = sorted({x.get("category", "") for x in items if x.get("category")})
        query = normalize(qs.get("q", [""])[0])
        category = qs.get("category", [""])[0]
        matches = [x for x in items if (not query or query in normalize(x.get("display_name", "")))
                   and (not category or x.get("category") == category)]
        page = max(1, int(qs.get("page", ["1"])[0])) if qs.get("page", ["1"])[0].isdigit() else 1
        per_page = 30
        pages = max(1, (len(matches) + per_page - 1) // per_page)
        return output(start_response, {"foods": matches[(page-1)*per_page:page*per_page],
                                       "page": page, "pages": pages, "total": len(matches),
                                       "categories": categories}, method=method)
    if path == "/api/v2/food-library" and method == "POST":
        if environ.get("HTTP_X_CSRF_TOKEN") != "demo-csrf-only":
            return output(start_response, {"error": "csrf_required"}, 403, method=method)
        size = int(environ.get("CONTENT_LENGTH", "0") or 0)
        if size > 32768:
            return output(start_response, {"error": "payload_too_large"}, 413, method=method)
        try:
            item = json.loads(environ["wsgi.input"].read(size))
        except (ValueError, UnicodeDecodeError):
            return output(start_response, {"error": "invalid_json"}, 400, method=method)
        if not isinstance(item, dict) or not str(item.get("display_name", "")).strip() or not str(item.get("category", "")).strip():
            return output(start_response, {"error": "missing_fields"}, 400, method=method)
        food_id = str(item.get("id") or ("demo-" + uuid.uuid4().hex[:12]))
        item["id"] = food_id
        with connect() as con:
            con.execute("INSERT OR REPLACE INTO demo_foods(id,payload) VALUES (?,?)",
                        (food_id, json.dumps(item, ensure_ascii=False)))
            con.commit()
        return output(start_response, {"food": item, "id": food_id}, method=method)
    if path.startswith("/api/v2/food-library/") and method == "DELETE":
        if environ.get("HTTP_X_CSRF_TOKEN") != "demo-csrf-only":
            return output(start_response, {"error": "csrf_required"}, 403, method=method)
        food_id = unquote(path.rsplit("/", 1)[-1])
        if food_id == "demo-arroz":
            return output(start_response, {"error": "food_is_in_use"}, 409, method=method)
        with connect() as con:
            con.execute("DELETE FROM demo_foods WHERE id=?", (food_id,))
            con.commit()
        return output(start_response, {"archived": True}, method=method)
    return output(start_response, {"error": "preview_only", "message": "Apenas a Biblioteca Alimentar usa dados de demonstração."}, 404, method=method)

def application(environ, start_response):
    """Static backoffice with test-only mock API. Never connects to production."""
    path = unquote(environ.get("PATH_INFO", "/") or "/")
    method = (environ.get("REQUEST_METHOD") or "GET").upper()
    if path == "/__preview_meta":
        return output(start_response, {"preview": True, "data": "simulated", "writes": "isolated_tmp_sqlite",
                                       "prod_database": False, "feature": "native_food_library_20261109"}, method=method)
    if path == "/healthz":
        return output(start_response, b"ok", content_type="text/plain; charset=utf-8", method=method)
    if path.startswith("/api/"):
        return catalog(environ, start_response, path, method)
    if method not in ("GET", "HEAD"):
        return output(start_response, b"Method not allowed", 405, "text/plain", method)
    mapping = {"/": "admin-microcycles.html", "/index.html": "admin-microcycles.html",
               "/food-library": "food-library.html", "/create-plan": "create-plan.html"}
    name = mapping.get(path, path.lstrip("/"))
    filename = (STATIC / name).resolve()
    if STATIC not in filename.parents or not filename.is_file():
        return output(start_response, b"Not found", 404, "text/plain; charset=utf-8", method)
    content = filename.read_bytes()
    mime = mimetypes.guess_type(str(filename))[0] or "application/octet-stream"
    if mime.startswith("text/") or mime in ("application/javascript", "application/json"):
        mime += "; charset=utf-8"
    return output(start_response, content, content_type=mime, method=method)
