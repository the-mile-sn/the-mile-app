"""The Mile booking catalogue (phase 2): organization-scoped services/professionals.

No booking, payment or calendar operation is performed here. Shopify references
are snapshots for configuration; this module never updates the Shopify store.
"""
import re
import secrets
import time

ORG_ID = "the-mile"
CATEGORIES = ("Wellness", "Performance", "Futebol Profissional", "Avaliações", "Outro")
MODES = ("presencial", "online")

# Confirmed active Shopify service products/variants. Never overwrite edits on restart.
INITIAL_SERVICES = (
    ("wellness-first", "Consulta de Wellness (Primeira)", "Wellness", 90, {
        "presencial": (7000, "7272959344710", "40997362794566"),
        "online": (6000, "7272959344710", "57209910985086")}),
    ("wellness-followup", "Consulta de Wellness (Seguimento)", "Wellness", 45, {
        "presencial": (5000, "7287602708550", "41056506740806"),
        "online": (4500, "7287602708550", "57209914261886")}),
    ("performance", "Consulta de Performance", "Performance", 60, {
        "presencial": (9000, "15848060256638", "57206950625662"),
        "online": (9000, "15869059629438", "57288662614398")}),
    ("professional-football", "Consulta de Futebol Profissional", "Futebol Profissional", 90, {
        "presencial": (15000, "15848070480254", "57206965502334"),
        "online": (15000, "15869062087038", "57288665891198")}),
)


def initialize(c):
    """Idempotent additive migration, portable across SQLite and PostgreSQL."""
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appt_services (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES appt_organizations(id),
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 15 AND 480),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(org_id,id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appt_services_org_name
        ON appt_services(org_id, lower(name));
    CREATE TABLE IF NOT EXISTS appt_service_formats (
        org_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('presencial','online')),
        enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 0 AND 9999999),
        shopify_product_id TEXT,
        shopify_variant_id TEXT,
        PRIMARY KEY(org_id,service_id,mode),
        FOREIGN KEY(org_id,service_id) REFERENCES appt_services(org_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS appt_professionals (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES appt_organizations(id),
        name TEXT NOT NULL,
        email TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        presencial_enabled INTEGER NOT NULL DEFAULT 1 CHECK(presencial_enabled IN (0,1)),
        online_enabled INTEGER NOT NULL DEFAULT 1 CHECK(online_enabled IN (0,1)),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(org_id,id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appt_professionals_org_email
        ON appt_professionals(org_id,lower(email)) WHERE email IS NOT NULL;
    CREATE TABLE IF NOT EXISTS appt_professional_services (
        org_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        PRIMARY KEY(org_id,professional_id,service_id),
        FOREIGN KEY(org_id,professional_id) REFERENCES appt_professionals(org_id,id) ON DELETE CASCADE,
        FOREIGN KEY(org_id,service_id) REFERENCES appt_services(org_id,id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS appt_professional_services_service
        ON appt_professional_services(org_id,service_id);
    """)
    c.execute("INSERT INTO appt_organizations(id,name,timezone) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
              (ORG_ID, "The Mile", "Europe/Lisbon"))
    now = int(time.time())
    for code, name, category, minutes, formats in INITIAL_SERVICES:
        identifier = "the-mile-" + code
        c.execute("""INSERT INTO appt_services(id,org_id,name,category,duration_minutes,active,created_at,updated_at)
                     VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING""",
                  (identifier, ORG_ID, name, category, minutes, now, now))
        for mode, (cents, product, variant) in formats.items():
            # Preserve manual changes (including disabled formats and prices) on redeploy.
            c.execute("""INSERT INTO appt_service_formats
                        (org_id,service_id,mode,enabled,price_cents,shopify_product_id,shopify_variant_id)
                        VALUES(?,?,?,?,?,?,?)
                        ON CONFLICT(org_id,service_id,mode) DO NOTHING""",
                      (ORG_ID, identifier, mode, 1, cents,
                       "gid://shopify/Product/" + product,
                       "gid://shopify/ProductVariant/" + variant))


def _text(value, field, max_length, required=True):
    if not isinstance(value, str):
        raise ValueError("invalid_" + field)
    value = " ".join(value.strip().split())
    if len(value) > max_length or (required and len(value) < 2):
        raise ValueError("invalid_" + field)
    return value


def _flag(value, field):
    if not isinstance(value, bool):
        raise ValueError("invalid_" + field)
    return int(value)


def _ids(value, field):
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError("invalid_" + field)
    result = []
    for item in value:
        if not isinstance(item, str) or len(item) > 70 or not item:
            raise ValueError("invalid_" + field)
        if item in result:
            raise ValueError("duplicate_" + field)
        result.append(item)
    return result


def _shopify_gid(value, kind):
    if value in ("", None):
        return None
    if not isinstance(value, str) or not re.fullmatch(r"gid://shopify/" + kind + r"/[0-9]+", value):
        raise ValueError("invalid_shopify_id")
    return value


def _service_data(body):
    name = _text(body.get("name"), "name", 130)
    category = body.get("category")
    if category not in CATEGORIES:
        raise ValueError("invalid_category")
    minutes = body.get("duration_minutes")
    if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes < 15 or minutes > 480:
        raise ValueError("invalid_duration")
    active = _flag(body.get("active"), "active")
    formats = body.get("formats")
    if not isinstance(formats, dict) or set(formats) != set(MODES):
        raise ValueError("invalid_formats")
    cleaned = {}
    for mode in MODES:
        item = formats[mode]
        if not isinstance(item, dict):
            raise ValueError("invalid_formats")
        enabled = _flag(item.get("enabled"), "mode")
        price = item.get("price_cents")
        if type(price) is not int or price < 0 or price > 9999999:
            raise ValueError("invalid_price")
        product = _shopify_gid(item.get("shopify_product_id"), "Product")
        variant = _shopify_gid(item.get("shopify_variant_id"), "ProductVariant")
        if variant and not product:
            raise ValueError("variant_requires_product")
        cleaned[mode] = (enabled, price, product, variant)
    if not any(v[0] for v in cleaned.values()):
        raise ValueError("at_least_one_format")
    return name, category, minutes, active, cleaned, _ids(body.get("professional_ids", []), "professionals")


def _professional_data(body):
    name = _text(body.get("name"), "name", 120)
    raw_email = body.get("email") or ""
    if not isinstance(raw_email, str):
        raise ValueError("invalid_email")
    email = raw_email.strip().lower() or None
    if email and (len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)):
        raise ValueError("invalid_email")
    active = _flag(body.get("active"), "active")
    presencial = _flag(body.get("presencial_enabled"), "mode")
    online = _flag(body.get("online_enabled"), "mode")
    if not (presencial or online):
        raise ValueError("at_least_one_format")
    services = _ids(body.get("service_ids", []), "services")
    return name, email, active, presencial, online, services


def _validate_references(c, org_id, table, ids, field):
    for identifier in ids:
        row = c.execute("SELECT id FROM " + table + " WHERE org_id=? AND id=?",
                        (org_id, identifier)).fetchone()
        if row is None:
            raise ValueError("invalid_" + field)


def catalog(c, org_id=ORG_ID):
    services = [dict(row) for row in c.execute("""
        SELECT id,name,category,duration_minutes,active,created_at,updated_at
        FROM appt_services WHERE org_id=? ORDER BY active DESC, category, name
    """, (org_id,)).fetchall()]
    professionals = [dict(row) for row in c.execute("""
        SELECT id,name,email,active,presencial_enabled,online_enabled,created_at,updated_at
        FROM appt_professionals WHERE org_id=? ORDER BY active DESC,name
    """, (org_id,)).fetchall()]
    by_service = {s["id"]: s for s in services}
    by_professional = {p["id"]: p for p in professionals}
    for s in services:
        s["active"] = bool(s["active"])
        s["formats"] = {}
        s["professional_ids"] = []
    for p in professionals:
        p["active"] = bool(p["active"])
        p["presencial_enabled"] = bool(p["presencial_enabled"])
        p["online_enabled"] = bool(p["online_enabled"])
        p["service_ids"] = []
    for row in c.execute("""SELECT service_id,mode,enabled,price_cents,shopify_product_id,shopify_variant_id
                            FROM appt_service_formats WHERE org_id=?""", (org_id,)).fetchall():
        s = by_service.get(row["service_id"])
        if s:
            s["formats"][row["mode"]] = {
                "enabled": bool(row["enabled"]), "price_cents": row["price_cents"],
                "shopify_product_id": row["shopify_product_id"],
                "shopify_variant_id": row["shopify_variant_id"]
            }
    for row in c.execute("""SELECT service_id,professional_id FROM appt_professional_services
                            WHERE org_id=?""", (org_id,)).fetchall():
        s = by_service.get(row["service_id"])
        p = by_professional.get(row["professional_id"])
        if s and p:
            s["professional_ids"].append(p["id"])
            p["service_ids"].append(s["id"])
    return {"organization": {"id": org_id, "timezone": "Europe/Lisbon"},
            "services": services, "professionals": professionals}


def save_service(c, body, identifier=None, org_id=ORG_ID):
    name, category, minutes, active, formats, professionals = _service_data(body)
    if identifier is not None and c.execute(
            "SELECT id FROM appt_services WHERE org_id=? AND id=?",
            (org_id, identifier)).fetchone() is None:
        raise LookupError("service_not_found")
    duplicate = c.execute("""SELECT id FROM appt_services
             WHERE org_id=? AND lower(name)=lower(?) AND id<>?""",
             (org_id, name, identifier or "")).fetchone()
    if duplicate:
        raise ValueError("service_name_exists")
    _validate_references(c, org_id, "appt_professionals", professionals, "professionals")
    now = int(time.time())
    if identifier is None:
        identifier = secrets.token_hex(16)
        c.execute("""INSERT INTO appt_services(id,org_id,name,category,duration_minutes,active,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?)""",
                  (identifier, org_id, name, category, minutes, active, now, now))
    else:
        c.execute("""UPDATE appt_services SET name=?,category=?,duration_minutes=?,active=?,updated_at=?
                     WHERE org_id=? AND id=?""",
                  (name, category, minutes, active, now, org_id, identifier))
    for mode, (enabled, price, product, variant) in formats.items():
        c.execute("""INSERT INTO appt_service_formats
                      (org_id,service_id,mode,enabled,price_cents,shopify_product_id,shopify_variant_id)
                      VALUES(?,?,?,?,?,?,?)
                      ON CONFLICT(org_id,service_id,mode) DO UPDATE SET
                      enabled=EXCLUDED.enabled,price_cents=EXCLUDED.price_cents,
                      shopify_product_id=EXCLUDED.shopify_product_id,
                      shopify_variant_id=EXCLUDED.shopify_variant_id""",
                  (org_id, identifier, mode, enabled, price, product, variant))
    c.execute("DELETE FROM appt_professional_services WHERE org_id=? AND service_id=?",
              (org_id, identifier))
    for pid in professionals:
        c.execute("""INSERT INTO appt_professional_services(org_id,professional_id,service_id)
                     VALUES(?,?,?)""", (org_id, pid, identifier))
    return identifier


def save_professional(c, body, identifier=None, org_id=ORG_ID):
    name, email, active, presencial, online, services = _professional_data(body)
    if identifier is not None and c.execute(
            "SELECT id FROM appt_professionals WHERE org_id=? AND id=?",
            (org_id, identifier)).fetchone() is None:
        raise LookupError("professional_not_found")
    if email:
        dupe = c.execute("""SELECT id FROM appt_professionals
                WHERE org_id=? AND lower(email)=lower(?) AND id<>?""",
                (org_id, email, identifier or "")).fetchone()
        if dupe:
            raise ValueError("professional_email_exists")
    _validate_references(c, org_id, "appt_services", services, "services")
    now = int(time.time())
    if identifier is None:
        identifier = secrets.token_hex(16)
        c.execute("""INSERT INTO appt_professionals
                      (id,org_id,name,email,active,presencial_enabled,online_enabled,created_at,updated_at)
                      VALUES(?,?,?,?,?,?,?,?,?)""",
                  (identifier, org_id, name, email, active, presencial, online, now, now))
    else:
        c.execute("""UPDATE appt_professionals SET name=?,email=?,active=?,
                     presencial_enabled=?,online_enabled=?,updated_at=?
                     WHERE org_id=? AND id=?""",
                  (name, email, active, presencial, online, now, org_id, identifier))
    c.execute("DELETE FROM appt_professional_services WHERE org_id=? AND professional_id=?",
              (org_id, identifier))
    for sid in services:
        c.execute("""INSERT INTO appt_professional_services(org_id,professional_id,service_id)
                     VALUES(?,?,?)""", (org_id, identifier, sid))
    return identifier
