"""Clientes de consulta: perfil central de quem faz consultas (fase 1).

Totalmente aditivo: tabelas novas com o prefixo ``consult_``. Não altera
utilizadores (jogadores, chefs, admins) nem as tabelas de agendamento.
As marcações ligam-se ao perfil através de uma tabela de ligação, sem
mexer em ``appt_bookings`` nem em ``appt_checkout_holds``.
"""
import json
import re
import time
import uuid
from datetime import date

from appointments_catalog_v2 import ORG_ID

STATUSES = ("pending", "confirmed", "archived")
SEXES = ("", "F", "M")
ETHNIC = ("none", "african")
BOOKING_KINDS = ("manual", "shopify")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")


def initialize(c):
    """Migração aditiva e repetível."""
    c.executescript("""
    CREATE TABLE IF NOT EXISTS consult_clients (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        birth_date TEXT NOT NULL DEFAULT '',
        sex TEXT NOT NULL DEFAULT '' CHECK(sex IN ('','F','M')),
        height_cm REAL,
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending','confirmed','archived')),
        active_professional_id TEXT,
        guardian_name TEXT NOT NULL DEFAULT '',
        guardian_email TEXT NOT NULL DEFAULT '',
        guardian_phone TEXT NOT NULL DEFAULT '',
        guardian_relation TEXT NOT NULL DEFAULT '',
        arm_point_cm REAL,
        thigh_point_cm REAL,
        ethnic_adjustment TEXT NOT NULL DEFAULT 'none'
            CHECK(ethnic_adjustment IN ('none','african')),
        notes TEXT NOT NULL DEFAULT '',
        merged_into TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_by TEXT,
        updated_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS consult_clients_by_email
        ON consult_clients(org_id,email);
    CREATE INDEX IF NOT EXISTS consult_clients_by_guardian_email
        ON consult_clients(org_id,guardian_email);
    CREATE TABLE IF NOT EXISTS consult_client_bookings (
        org_id TEXT NOT NULL,
        booking_kind TEXT NOT NULL CHECK(booking_kind IN ('manual','shopify')),
        booking_id TEXT NOT NULL,
        client_id TEXT NOT NULL REFERENCES consult_clients(id),
        linked_by TEXT NOT NULL CHECK(linked_by IN ('auto','manual')),
        linked_at BIGINT NOT NULL,
        PRIMARY KEY(org_id,booking_kind,booking_id)
    );
    CREATE INDEX IF NOT EXISTS consult_client_bookings_by_client
        ON consult_client_bookings(org_id,client_id);
    CREATE TABLE IF NOT EXISTS consult_client_audit (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        actor TEXT,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS consult_client_audit_by_client
        ON consult_client_audit(org_id,client_id,created_at);
    """)


# ---------- validação ----------

def _text(value, field, maximum, required=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError("invalid_" + field)
    value = " ".join(value.split()) if field != "notes" else value.strip()
    if len(value) > maximum or (required and not value):
        raise ValueError("invalid_" + field)
    return value


def _email(value, field="email"):
    value = _text(value, field, 254).lower()
    if value and not EMAIL.match(value):
        raise ValueError("invalid_" + field)
    return value


def _number(value, field, low, high):
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError("invalid_" + field)
    try:
        number = float(str(value).replace(",", "."))
    except ValueError:
        raise ValueError("invalid_" + field)
    if not (low <= number <= high):
        raise ValueError("invalid_" + field)
    return round(number, 1)


def _birth_date(value):
    value = _text(value, "birth_date", 10)
    if not value:
        return ""
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValueError("invalid_birth_date")
    if parsed.year < 1900 or parsed > date.today():
        raise ValueError("invalid_birth_date")
    return parsed.isoformat()


def _professional(c, value, org_id):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or len(value) > 70:
        raise ValueError("invalid_professional")
    row = c.execute("SELECT id FROM appt_professionals WHERE org_id=? AND id=?",
                    (org_id, value)).fetchone()
    if not row:
        raise ValueError("invalid_professional")
    return value


EDITABLE = ("name", "email", "phone", "birth_date", "sex", "height_cm",
            "active_professional_id", "guardian_name", "guardian_email",
            "guardian_phone", "guardian_relation", "arm_point_cm",
            "thigh_point_cm", "ethnic_adjustment", "notes")


def _clean(c, payload, org_id, partial=False):
    if not isinstance(payload, dict):
        raise ValueError("invalid_payload")
    out = {}
    for key in EDITABLE:
        if partial and key not in payload:
            continue
        value = payload.get(key)
        if key == "name":
            out[key] = _text(value, "name", 120, required=True)
        elif key in ("email", "guardian_email"):
            out[key] = _email(value, key)
        elif key in ("phone", "guardian_phone"):
            out[key] = _text(value, key, 40)
        elif key == "guardian_name":
            out[key] = _text(value, key, 120)
        elif key == "guardian_relation":
            out[key] = _text(value, key, 40)
        elif key == "birth_date":
            out[key] = _birth_date(value)
        elif key == "sex":
            value = value or ""
            if value not in SEXES:
                raise ValueError("invalid_sex")
            out[key] = value
        elif key == "height_cm":
            out[key] = _number(value, key, 50, 250)
        elif key in ("arm_point_cm", "thigh_point_cm"):
            out[key] = _number(value, key, 1, 100)
        elif key == "ethnic_adjustment":
            value = value or "none"
            if value not in ETHNIC:
                raise ValueError("invalid_ethnic_adjustment")
            out[key] = value
        elif key == "notes":
            out[key] = _text(value, "notes", 4000)
        elif key == "active_professional_id":
            out[key] = _professional(c, value, org_id)
    return out


def _audit(c, org_id, client_id, actor, action, detail=None, now=None):
    c.execute("""INSERT INTO consult_client_audit
        (id,org_id,client_id,actor,action,detail,created_at) VALUES(?,?,?,?,?,?,?)""",
              (uuid.uuid4().hex, org_id, client_id, actor, action,
               json.dumps(detail or {}, ensure_ascii=False), now or int(time.time())))


def _row(c, client_id, org_id):
    if not isinstance(client_id, str) or len(client_id) > 70:
        raise LookupError("client_not_found")
    row = c.execute("SELECT * FROM consult_clients WHERE org_id=? AND id=?",
                    (org_id, client_id)).fetchone()
    if not row:
        raise LookupError("client_not_found")
    return row


def _public(row, extra=None):
    data = {k: row[k] for k in (
        "id", "name", "email", "phone", "birth_date", "sex", "height_cm", "status",
        "active_professional_id", "guardian_name", "guardian_email", "guardian_phone",
        "guardian_relation", "arm_point_cm", "thigh_point_cm", "ethnic_adjustment",
        "notes", "merged_into", "version", "created_at", "updated_at")}
    if extra:
        data.update(extra)
    return data


# ---------- escrita ----------

def create(c, payload, actor, org_id=ORG_ID, now=None, status="confirmed"):
    now = now or int(time.time())
    data = _clean(c, payload, org_id)
    identifier = uuid.uuid4().hex
    c.execute("""INSERT INTO consult_clients
        (id,org_id,name,email,phone,birth_date,sex,height_cm,status,active_professional_id,
         guardian_name,guardian_email,guardian_phone,guardian_relation,arm_point_cm,
         thigh_point_cm,ethnic_adjustment,notes,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
              (identifier, org_id, data["name"], data["email"], data["phone"],
               data["birth_date"], data["sex"], data["height_cm"], status,
               data["active_professional_id"], data["guardian_name"], data["guardian_email"],
               data["guardian_phone"], data["guardian_relation"], data["arm_point_cm"],
               data["thigh_point_cm"], data["ethnic_adjustment"], data["notes"],
               actor, actor, now, now))
    _audit(c, org_id, identifier, actor, "created", {"status": status}, now)
    return identifier


def update(c, client_id, payload, actor, org_id=ORG_ID, now=None):
    now = now or int(time.time())
    row = _row(c, client_id, org_id)
    if row["status"] == "archived":
        raise ValueError("client_archived")
    version = payload.get("version") if isinstance(payload, dict) else None
    if not isinstance(version, int) or isinstance(version, bool) or version != row["version"]:
        raise ValueError("stale_client")
    data = _clean(c, payload, org_id, partial=True)
    if not data:
        return row["version"]
    changed = {k: v for k, v in data.items() if row[k] != v}
    if not changed:
        return row["version"]
    assignments = ",".join(f"{k}=?" for k in changed)
    c.execute(f"""UPDATE consult_clients SET {assignments},version=version+1,
        updated_by=?,updated_at=? WHERE org_id=? AND id=? AND version=?""",
              (*changed.values(), actor, now, org_id, client_id, version))
    # Regista os campos alterados; o ajuste da equação fica com valor (só equipa clínica).
    detail = {"fields": sorted(changed)}
    if "ethnic_adjustment" in changed:
        detail["ethnic_adjustment"] = changed["ethnic_adjustment"]
    _audit(c, org_id, client_id, actor, "updated", detail, now)
    return version + 1


def set_status(c, client_id, status, expected_version, actor, org_id=ORG_ID, now=None):
    if status not in ("confirmed", "archived"):
        raise ValueError("invalid_status")
    now = now or int(time.time())
    row = _row(c, client_id, org_id)
    if expected_version != row["version"]:
        raise ValueError("stale_client")
    if row["status"] == status:
        return row["version"]
    c.execute("""UPDATE consult_clients SET status=?,version=version+1,updated_by=?,updated_at=?
        WHERE org_id=? AND id=? AND version=?""",
              (status, actor, now, org_id, client_id, expected_version))
    _audit(c, org_id, client_id, actor, "status", {"from": row["status"], "to": status}, now)
    return expected_version + 1


def merge(c, source_id, target_id, actor, org_id=ORG_ID, now=None):
    """Junta o perfil ``source`` ao ``target``: move as marcações e arquiva a origem."""
    if source_id == target_id:
        raise ValueError("invalid_merge")
    now = now or int(time.time())
    source = _row(c, source_id, org_id)
    target = _row(c, target_id, org_id)
    if source["merged_into"] or target["status"] == "archived":
        raise ValueError("invalid_merge")
    moved = c.execute("""UPDATE consult_client_bookings SET client_id=?,linked_by='manual',linked_at=?
        WHERE org_id=? AND client_id=?""", (target_id, now, org_id, source_id)).rowcount
    c.execute("""UPDATE consult_clients SET status='archived',merged_into=?,version=version+1,
        updated_by=?,updated_at=? WHERE org_id=? AND id=?""",
              (target_id, actor, now, org_id, source_id))
    _audit(c, org_id, source_id, actor, "merged_into", {"target": target_id, "bookings": moved}, now)
    _audit(c, org_id, target_id, actor, "merged_from", {"source": source_id, "bookings": moved}, now)
    return moved


def _booking_exists(c, kind, booking_id, org_id):
    if kind == "manual":
        return bool(c.execute("SELECT 1 FROM appt_bookings WHERE org_id=? AND id=?",
                              (org_id, booking_id)).fetchone())
    return bool(c.execute("""SELECT 1 FROM appt_checkout_holds h
        JOIN appt_shopify_confirmations p ON p.org_id=h.org_id AND p.hold_id=h.id
        WHERE h.org_id=? AND h.id=? AND h.status='confirmed'""", (org_id, booking_id)).fetchone())


def link_booking(c, kind, booking_id, client_id, actor, org_id=ORG_ID, now=None):
    if kind not in BOOKING_KINDS or not isinstance(booking_id, str) or len(booking_id) > 70:
        raise ValueError("invalid_booking")
    now = now or int(time.time())
    row = _row(c, client_id, org_id)
    if row["status"] == "archived":
        raise ValueError("client_archived")
    if not _booking_exists(c, kind, booking_id, org_id):
        raise LookupError("booking_not_found")
    previous = c.execute("""SELECT client_id FROM consult_client_bookings
        WHERE org_id=? AND booking_kind=? AND booking_id=?""", (org_id, kind, booking_id)).fetchone()
    if previous:
        c.execute("""UPDATE consult_client_bookings SET client_id=?,linked_by='manual',linked_at=?
            WHERE org_id=? AND booking_kind=? AND booking_id=?""",
                  (client_id, now, org_id, kind, booking_id))
    else:
        c.execute("""INSERT INTO consult_client_bookings
            (org_id,booking_kind,booking_id,client_id,linked_by,linked_at) VALUES(?,?,?,?,?,?)""",
                  (org_id, kind, booking_id, client_id, "manual", now))
    _audit(c, org_id, client_id, actor, "booking_linked",
           {"kind": kind, "booking": booking_id,
            "from": previous["client_id"] if previous else None}, now)


# ---------- ligação automática ----------

def _unlinked(c, org_id):
    manual = c.execute("""SELECT 'manual' AS kind,b.id,b.customer_name AS name,
            b.customer_email AS email,b.customer_phone AS phone,b.day,b.start_minute,b.created_at
        FROM appt_bookings b
        LEFT JOIN consult_client_bookings l
          ON l.org_id=b.org_id AND l.booking_kind='manual' AND l.booking_id=b.id
        WHERE b.org_id=? AND l.booking_id IS NULL""", (org_id,)).fetchall()
    paid = c.execute("""SELECT 'shopify' AS kind,h.id,p.customer_name AS name,
            p.customer_email AS email,p.customer_phone AS phone,h.day,h.start_minute,p.created_at
        FROM appt_checkout_holds h
        JOIN appt_shopify_confirmations p ON p.org_id=h.org_id AND p.hold_id=h.id
        LEFT JOIN consult_client_bookings l
          ON l.org_id=h.org_id AND l.booking_kind='shopify' AND l.booking_id=h.id
        WHERE h.org_id=? AND h.status='confirmed' AND l.booking_id IS NULL""", (org_id,)).fetchall()
    return sorted([dict(r) for r in manual] + [dict(r) for r in paid],
                  key=lambda r: (r["created_at"] or 0, r["id"]))


def sync(c, org_id=ORG_ID, now=None):
    """Liga marcações sem perfil. Idempotente.

    - 1 perfil ativo com esse email (ou email do responsável): liga.
    - nenhum: cria um perfil "por confirmar" e liga.
    - vários, ou sem email: fica em "por associar" para decisão manual.
    """
    now = now or int(time.time())
    linked = created = skipped = 0
    for item in _unlinked(c, org_id):
        email = (item["email"] or "").strip().lower()
        if not email or not EMAIL.match(email):
            skipped += 1
            continue
        matches = c.execute("""SELECT id FROM consult_clients WHERE org_id=? AND status!='archived'
            AND (email=? OR guardian_email=?)""", (org_id, email, email)).fetchall()
        if len(matches) > 1:
            skipped += 1
            continue
        if matches:
            client_id = matches[0]["id"]
        else:
            name = " ".join((item["name"] or "").split())[:120] or email
            client_id = create(c, {"name": name, "email": email,
                                   "phone": (item["phone"] or "")[:40]},
                               "system", org_id, now, status="pending")
            created += 1
        c.execute("""INSERT INTO consult_client_bookings
            (org_id,booking_kind,booking_id,client_id,linked_by,linked_at) VALUES(?,?,?,?,?,?)
            ON CONFLICT(org_id,booking_kind,booking_id) DO NOTHING""",
                  (org_id, item["kind"], item["id"], client_id, "auto", now))
        linked += 1
    return {"linked": linked, "created": created, "unassigned": skipped}


# ---------- leitura ----------

def _bookings_for(c, client_ids, org_id):
    if not client_ids:
        return {}
    marks = ",".join("?" for _ in client_ids)
    manual = c.execute(f"""SELECT l.client_id,'manual' AS kind,b.id,b.day,b.start_minute,b.end_minute,
            b.mode,b.status,s.name AS service_name,p.name AS professional_name,b.professional_id
        FROM consult_client_bookings l
        JOIN appt_bookings b ON b.org_id=l.org_id AND b.id=l.booking_id
        JOIN appt_services s ON s.org_id=b.org_id AND s.id=b.service_id
        JOIN appt_professionals p ON p.org_id=b.org_id AND p.id=b.professional_id
        WHERE l.org_id=? AND l.booking_kind='manual' AND l.client_id IN ({marks})""",
                       (org_id, *client_ids)).fetchall()
    paid = c.execute(f"""SELECT l.client_id,'shopify' AS kind,h.id,h.day,h.start_minute,h.end_minute,
            h.mode,'scheduled' AS status,s.name AS service_name,p.name AS professional_name,
            h.professional_id,c2.shopify_order_id
        FROM consult_client_bookings l
        JOIN appt_checkout_holds h ON h.org_id=l.org_id AND h.id=l.booking_id
        JOIN appt_shopify_confirmations c2 ON c2.org_id=h.org_id AND c2.hold_id=h.id
        JOIN appt_services s ON s.org_id=h.org_id AND s.id=h.service_id
        JOIN appt_professionals p ON p.org_id=h.org_id AND p.id=h.professional_id
        WHERE l.org_id=? AND l.booking_kind='shopify' AND l.client_id IN ({marks})""",
                     (org_id, *client_ids)).fetchall()
    out = {}
    for r in list(manual) + list(paid):
        r = dict(r)
        out.setdefault(r.pop("client_id"), []).append(r)
    for items in out.values():
        items.sort(key=lambda r: (r["day"], r["start_minute"]))
    return out


def _summary(bookings, today):
    active = [b for b in bookings if b["status"] != "cancelled"]
    upcoming = [b for b in active if b["day"] >= today]
    past = [b for b in active if b["day"] < today]
    return {
        "bookings_count": len(active),
        "next_booking": upcoming[0] if upcoming else None,
        "last_booking": past[-1] if past else None,
    }


def list_clients(c, query="", status="active", org_id=ORG_ID, today=None):
    if status not in ("active", "pending", "confirmed", "archived", "all"):
        raise ValueError("invalid_status")
    if not isinstance(query, str) or len(query) > 120:
        raise ValueError("invalid_query")
    sql = "SELECT * FROM consult_clients WHERE org_id=? AND merged_into IS NULL"
    params = [org_id]
    if status == "active":
        sql += " AND status!='archived'"
    elif status != "all":
        sql += " AND status=?"
        params.append(status)
    q = " ".join(query.split()).lower()
    if q:
        sql += " AND (lower(name) LIKE ? OR email LIKE ? OR phone LIKE ? OR guardian_email LIKE ?)"
        like = f"%{q}%"
        params += [like, like, like, like]
    sql += " ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, lower(name) LIMIT 501"
    rows = c.execute(sql, tuple(params)).fetchall()
    today = today or date.today().isoformat()
    bookings = _bookings_for(c, [r["id"] for r in rows[:500]], org_id)
    clients = [_public(r, _summary(bookings.get(r["id"], []), today)) for r in rows[:500]]
    return {"clients": clients, "truncated": len(rows) > 500,
            "unassigned": len([u for u in _unlinked(c, org_id)])}


def get_client(c, client_id, org_id=ORG_ID, today=None):
    row = _row(c, client_id, org_id)
    today = today or date.today().isoformat()
    bookings = _bookings_for(c, [client_id], org_id).get(client_id, [])
    audit = c.execute("""SELECT action,detail,actor,created_at FROM consult_client_audit
        WHERE org_id=? AND client_id=? ORDER BY created_at DESC,id LIMIT 100""",
                      (org_id, client_id)).fetchall()
    events = []
    for a in audit:
        try:
            detail = json.loads(a["detail"] or "{}")
        except ValueError:
            detail = {}
        events.append({"action": a["action"], "detail": detail,
                       "actor": a["actor"], "at": a["created_at"]})
    data = _public(row, _summary(bookings, today))
    data["bookings"] = bookings
    data["events"] = events
    return data


def unassigned(c, org_id=ORG_ID):
    return {"bookings": [
        {k: item[k] for k in ("kind", "id", "name", "email", "phone", "day", "start_minute")}
        for item in _unlinked(c, org_id)][:200]}
