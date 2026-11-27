"""Consultas: registo de cada consulta (Nota e Fecho) sobre as marcações já existentes.

Aditivo: só cria a tabela consult_sessions. Lê marcações (internas e pagas no
site) e perfis de clientes de consulta; nunca altera marcações, pagamentos nem
perfis. Uma consulta fechada fica só de leitura.
"""
import json
import time
import uuid
from datetime import date, timedelta

from appointments_catalog_v2 import ORG_ID
import consult_clients_v2 as clients
import consult_body_comp_v2 as body
import consult_forms_v2 as forms

INDICATORS = ("adherence", "energy", "sleep", "digestion", "hunger", "hydration")
NEXT_ACTIONS = ("", "link", "book")
TEXT_LIMIT = 6000


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS consult_sessions (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        booking_kind TEXT NOT NULL CHECK(booking_kind IN ('manual','shopify')),
        booking_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
        note_text TEXT NOT NULL DEFAULT '',
        indicators_json TEXT NOT NULL DEFAULT '{}',
        internal_note TEXT NOT NULL DEFAULT '',
        plan_changes TEXT NOT NULL DEFAULT '',
        objectives_json TEXT NOT NULL DEFAULT '[]',
        next_weeks INTEGER,
        next_action TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_by TEXT,
        updated_by TEXT,
        closed_by TEXT,
        closed_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(org_id, booking_kind, booking_id)
    );
    CREATE INDEX IF NOT EXISTS consult_sessions_by_client
        ON consult_sessions(org_id, client_id, created_at);

    -- Avaliação de composição corporal registada numa consulta (uma por consulta).
    CREATE TABLE IF NOT EXISTS consult_assessments (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        assessed_on TEXT NOT NULL,
        measures_json TEXT NOT NULL DEFAULT '{}',
        equation TEXT NOT NULL DEFAULT 'peterson',
        results_json TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_by TEXT,
        updated_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS consult_assessments_by_client
        ON consult_assessments(org_id, client_id, assessed_on);
    """)


def _basics(c, client_id, org_id):
    row = c.execute("""SELECT sex,birth_date,height_cm,ethnicity,arm_point_cm,thigh_point_cm FROM consult_clients
        WHERE org_id=? AND id=?""", (org_id, client_id)).fetchone()
    return dict(row) if row else {"sex": "", "birth_date": "", "height_cm": None, "ethnicity": "none",
                                  "arm_point_cm": None, "thigh_point_cm": None}


def _assessment_public(row):
    if not row:
        return None
    data = dict(row)
    data["measures"] = json.loads(data.pop("measures_json") or "{}")
    data["results"] = json.loads(data.pop("results_json") or "{}")
    return data


def _equation_list(sex):
    return [{"key": k, "label": v[0]} for k, v in body.EQUATIONS.items() if not sex or sex in v[1]]


def save_assessment(c, session_id, payload, actor, org_id=ORG_ID, now=None):
    """Grava as medições da avaliação desta consulta e recalcula os resultados no servidor."""
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    now = now or int(time.time())
    row = c.execute("SELECT * FROM consult_sessions WHERE org_id=? AND id=?",
                    (org_id, session_id)).fetchone()
    if not row:
        raise LookupError("session_not_found")
    if row["status"] == "closed":
        raise ValueError("session_closed")
    measures = body.clean_measures(payload.get("measures") or {})
    _save_points(c, row["client_id"], payload.get("points"), actor, org_id, now)
    equation = payload.get("equation") or body.DEFAULT_EQUATION
    if equation not in body.EQUATIONS:
        raise ValueError("invalid_equation")
    b = _linked_booking(c, row["booking_kind"], row["booking_id"], org_id)
    basics = _basics(c, row["client_id"], org_id)
    if "height_cm" not in measures and basics.get("height_cm"):
        measures["height_cm"] = float(basics["height_cm"])
    results = body.compute(measures, basics.get("sex"), body.age_on(basics.get("birth_date"), b["day"]),
                           basics.get("ethnicity") or "none", equation)
    existing = c.execute("SELECT * FROM consult_assessments WHERE org_id=? AND session_id=?",
                         (org_id, session_id)).fetchone()
    if existing:
        if type(payload.get("version")) is not int or payload["version"] != existing["version"]:
            raise ValueError("stale_assessment")
        changed = c.execute("""UPDATE consult_assessments SET measures_json=?,equation=?,results_json=?,
            updated_by=?,updated_at=?,version=version+1 WHERE org_id=? AND id=? AND version=?""",
                            (json.dumps(measures, sort_keys=True), equation, json.dumps(results, sort_keys=True),
                             actor, now, org_id, existing["id"], existing["version"]))
        if changed.rowcount != 1:
            raise ValueError("stale_assessment")
    else:
        c.execute("""INSERT INTO consult_assessments
            (id,org_id,client_id,session_id,assessed_on,measures_json,equation,results_json,
             created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (uuid.uuid4().hex, org_id, row["client_id"], session_id, b["day"],
                   json.dumps(measures, sort_keys=True), equation, json.dumps(results, sort_keys=True),
                   actor, actor, now, now))
    return _assessment_public(c.execute("SELECT * FROM consult_assessments WHERE org_id=? AND session_id=?",
                                        (org_id, session_id)).fetchone())


def _save_points(c, client_id, points, actor, org_id, now):
    """Pontos médios do braço e da coxa: medidos uma vez (1.ª avaliação) e guardados no perfil."""
    if points in (None, {}):
        return
    if not isinstance(points, dict) or any(k not in ("arm_point_cm", "thigh_point_cm") for k in points):
        raise ValueError("invalid_points")
    clean = {k: clients._number(v, k, 1, 100) for k, v in points.items()}
    current = c.execute("SELECT arm_point_cm,thigh_point_cm FROM consult_clients WHERE org_id=? AND id=?",
                        (org_id, client_id)).fetchone()
    changed = {k: v for k, v in clean.items() if current and current[k] != v}
    if not changed:
        return
    sets = ",".join(f"{k}=?" for k in changed)
    c.execute(f"UPDATE consult_clients SET {sets},version=version+1,updated_by=?,updated_at=? WHERE org_id=? AND id=?",
              (*changed.values(), actor, now, org_id, client_id))
    clients._audit(c, org_id, client_id, actor, "updated", {"fields": sorted(changed)}, now)


def _hhmm(minutes):
    return "%02d:%02d" % divmod(int(minutes), 60)


def _linked_bookings(c, org_id, client_id=None):
    """Marcações ligadas a perfis (internas agendadas + pagas no site)."""
    extra = " AND l.client_id=?" if client_id else ""
    args = (org_id, client_id) if client_id else (org_id,)
    manual = c.execute(f"""SELECT l.client_id,'manual' AS kind,b.id,b.day,b.start_minute,b.end_minute,
            b.mode,s.name AS service_name,p.name AS professional_name,b.professional_id
        FROM consult_client_bookings l
        JOIN appt_bookings b ON b.org_id=l.org_id AND b.id=l.booking_id
        JOIN appt_services s ON s.org_id=b.org_id AND s.id=b.service_id
        JOIN appt_professionals p ON p.org_id=b.org_id AND p.id=b.professional_id
        WHERE l.org_id=? AND l.booking_kind='manual' AND b.status='scheduled'{extra}""", args).fetchall()
    paid = c.execute(f"""SELECT l.client_id,'shopify' AS kind,h.id,h.day,h.start_minute,h.end_minute,
            h.mode,s.name AS service_name,p.name AS professional_name,h.professional_id
        FROM consult_client_bookings l
        JOIN appt_checkout_holds h ON h.org_id=l.org_id AND h.id=l.booking_id
        JOIN appt_services s ON s.org_id=h.org_id AND s.id=h.service_id
        JOIN appt_professionals p ON p.org_id=h.org_id AND p.id=h.professional_id
        WHERE l.org_id=? AND l.booking_kind='shopify' AND h.status='confirmed'{extra}""", args).fetchall()
    return [dict(r) for r in list(manual) + list(paid)]


def _sessions_by_booking(c, org_id, client_id=None):
    extra = " AND client_id=?" if client_id else ""
    args = (org_id, client_id) if client_id else (org_id,)
    rows = c.execute(f"SELECT * FROM consult_sessions WHERE org_id=?{extra}", args).fetchall()
    return {(r["booking_kind"], r["booking_id"]): dict(r) for r in rows}


def _first_visit(service_name):
    name = (service_name or "").lower()
    return "primeira" in name


def _item(b, names, session):
    return {
        "client_id": b["client_id"], "client_name": names.get(b["client_id"], ""),
        "kind": b["kind"], "booking_id": b["id"], "date": b["day"],
        "start": _hhmm(b["start_minute"]), "end": _hhmm(b["end_minute"]),
        "mode": b["mode"], "service_name": b["service_name"],
        "professional_name": b["professional_name"], "professional_id": b["professional_id"],
        "first_visit": _first_visit(b["service_name"]),
        "session_id": session["id"] if session else None,
        "session_status": session["status"] if session else None,
    }


def workspace(c, today=None, org_id=ORG_ID):
    """Listas da página Consultas: Hoje, Por tratar, Próximos dias e Todos."""
    today = today or date.today()
    iso = today.isoformat()
    soon = (today + timedelta(days=14)).isoformat()
    since = (today - timedelta(days=90)).isoformat()
    names = {r["id"]: r["name"] for r in c.execute(
        "SELECT id,name FROM consult_clients WHERE org_id=?", (org_id,)).fetchall()}
    sessions = _sessions_by_booking(c, org_id)
    out = {"today": [], "pending": [], "upcoming": []}
    for b in _linked_bookings(c, org_id):
        s = sessions.get((b["kind"], b["id"]))
        item = _item(b, names, s)
        if b["day"] == iso:
            out["today"].append(item)
        elif since <= b["day"] < iso and not (s and s["status"] == "closed"):
            out["pending"].append(item)
        elif iso < b["day"] <= soon:
            out["upcoming"].append(item)
    for key in out:
        out[key].sort(key=lambda x: (x["date"], x["start"]), reverse=(key == "pending"))
    out["clients"] = clients.list_clients(c, "", "active", org_id, iso)["clients"]
    out["date"] = iso
    return out


def _public(s):
    if not s:
        return None
    data = dict(s)
    data["indicators"] = json.loads(data.pop("indicators_json") or "{}")
    data["objectives"] = json.loads(data.pop("objectives_json") or "[]")
    return data


def client_view(c, client_id, today=None, org_id=ORG_ID):
    """Ficha do cliente na página Consultas: perfil, consultas e percurso."""
    today = today or date.today()
    profile = clients.get_client(c, client_id, org_id, today.isoformat())
    sessions = _sessions_by_booking(c, org_id, client_id)
    bookings = sorted(_linked_bookings(c, org_id, client_id), key=lambda b: (b["day"], b["start_minute"]))
    names = {client_id: profile.get("name", "")}
    items = [_item(b, names, sessions.get((b["kind"], b["id"]))) for b in bookings]
    iso = today.isoformat()
    upcoming = [i for i in items if i["date"] >= iso and i["session_status"] != "closed"]
    history = []
    for i in reversed(items):
        s = sessions.get((i["kind"], i["booking_id"]))
        if s and s["status"] == "closed":
            p = _public(s)
            history.append({**i, "note_text": p["note_text"], "objectives": p["objectives"],
                            "plan_changes": p["plan_changes"], "indicators": p["indicators"],
                            "closed_at": p["closed_at"]})
    series = [_assessment_public(r) for r in c.execute("""SELECT * FROM consult_assessments
        WHERE org_id=? AND client_id=? ORDER BY assessed_on,updated_at""", (org_id, client_id)).fetchall()]
    trend = [{"date": a["assessed_on"], "weight_kg": a["measures"].get("weight_kg"),
              "fat_pct": a["results"].get("fat_pct"), "muscle_kg": a["results"].get("muscle_kg")}
             for a in series]
    return {"profile": profile, "assessments": trend, "form": forms.for_client(c, client_id, org_id), "next": upcoming[0] if upcoming else None,
            "upcoming": upcoming, "history": history,
            "total": len(items), "closed": len(history)}


def _linked_booking(c, kind, booking_id, org_id):
    if kind not in ("manual", "shopify") or not isinstance(booking_id, str) or len(booking_id) > 70:
        raise ValueError("invalid_booking")
    row = c.execute("""SELECT client_id FROM consult_client_bookings
        WHERE org_id=? AND booking_kind=? AND booking_id=?""", (org_id, kind, booking_id)).fetchone()
    if not row:
        raise LookupError("booking_not_linked")
    found = [b for b in _linked_bookings(c, org_id, row["client_id"])
             if b["kind"] == kind and b["id"] == booking_id]
    if not found:
        raise LookupError("booking_not_found")
    return found[0]


def start(c, kind, booking_id, actor, org_id=ORG_ID, now=None):
    """Abre (ou retoma) o registo da consulta desta marcação."""
    now = now or int(time.time())
    b = _linked_booking(c, kind, booking_id, org_id)
    existing = c.execute("""SELECT * FROM consult_sessions
        WHERE org_id=? AND booking_kind=? AND booking_id=?""", (org_id, kind, booking_id)).fetchone()
    if not existing:
        c.execute("""INSERT INTO consult_sessions
            (id,org_id,client_id,booking_kind,booking_id,created_by,updated_by,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(org_id,booking_kind,booking_id) DO NOTHING""",
                  (uuid.uuid4().hex, org_id, b["client_id"], kind, booking_id, actor, actor, now, now))
    return session(c, kind, booking_id, org_id)


def session(c, kind, booking_id, org_id=ORG_ID):
    b = _linked_booking(c, kind, booking_id, org_id)
    row = c.execute("""SELECT * FROM consult_sessions
        WHERE org_id=? AND booking_kind=? AND booking_id=?""", (org_id, kind, booking_id)).fetchone()
    previous = c.execute("""SELECT * FROM consult_sessions
        WHERE org_id=? AND client_id=? AND status='closed' AND NOT (booking_kind=? AND booking_id=?)
        ORDER BY closed_at DESC LIMIT 1""", (org_id, b["client_id"], kind, booking_id)).fetchone()
    client = c.execute("SELECT name,notes FROM consult_clients WHERE org_id=? AND id=?",
                       (org_id, b["client_id"])).fetchone()
    names = {b["client_id"]: client["name"] if client else ""}
    basics = _basics(c, b["client_id"], org_id)
    assessment = c.execute("SELECT * FROM consult_assessments WHERE org_id=? AND session_id=?",
                           (org_id, row["id"])).fetchone() if row else None
    prev_assessment = c.execute("""SELECT * FROM consult_assessments WHERE org_id=? AND client_id=?
        AND session_id<>? ORDER BY assessed_on DESC,updated_at DESC LIMIT 1""",
                                (org_id, b["client_id"], row["id"] if row else "")).fetchone()
    return {"booking": _item(b, names, row), "session": _public(row), "previous": _public(previous),
            "profile_notes": client["notes"] if client else "",
            "client": {**basics, "age": body.age_on(basics.get("birth_date"), b["day"])},
            "assessment": _assessment_public(assessment),
            "previous_assessment": _assessment_public(prev_assessment),
            "equations": _equation_list(basics.get("sex")),
            "form": forms.for_client(c, b["client_id"], org_id)}


def _text(value, field, limit=TEXT_LIMIT):
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("invalid_" + field)
    return value.strip()


def save(c, session_id, payload, actor, org_id=ORG_ID, now=None):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    now = now or int(time.time())
    row = c.execute("SELECT * FROM consult_sessions WHERE org_id=? AND id=?",
                    (org_id, session_id)).fetchone()
    if not row:
        raise LookupError("session_not_found")
    if row["status"] == "closed":
        raise ValueError("session_closed")
    if type(payload.get("version")) is not int or payload["version"] != row["version"]:
        raise ValueError("stale_session")
    fields = {}
    for key in ("note_text", "internal_note", "plan_changes"):
        if key in payload:
            fields[key] = _text(payload[key], key)
    if "indicators" in payload:
        raw = payload["indicators"]
        if not isinstance(raw, dict):
            raise ValueError("invalid_indicators")
        clean = {}
        for key, value in raw.items():
            if key not in INDICATORS or (value is not None and (type(value) is not int or not 1 <= value <= 5)):
                raise ValueError("invalid_indicators")
            if value is not None:
                clean[key] = value
        fields["indicators_json"] = json.dumps(clean, sort_keys=True)
    if "objectives" in payload:
        raw = payload["objectives"]
        if not isinstance(raw, list) or len(raw) > 10:
            raise ValueError("invalid_objectives")
        items = [_text(x, "objectives", 200) for x in raw]
        fields["objectives_json"] = json.dumps([x for x in items if x], ensure_ascii=False)
    if "next_weeks" in payload:
        weeks = payload["next_weeks"]
        if weeks is not None and (type(weeks) is not int or not 1 <= weeks <= 26):
            raise ValueError("invalid_next_weeks")
        fields["next_weeks"] = weeks
    if "next_action" in payload:
        if payload["next_action"] not in NEXT_ACTIONS:
            raise ValueError("invalid_next_action")
        fields["next_action"] = payload["next_action"]
    if not fields:
        return row["version"]
    sets = ",".join(f"{k}=?" for k in fields)
    changed = c.execute(f"""UPDATE consult_sessions SET {sets},updated_by=?,updated_at=?,version=version+1
        WHERE org_id=? AND id=? AND version=? AND status='open'""",
                        (*fields.values(), actor, now, org_id, session_id, row["version"]))
    if changed.rowcount != 1:
        raise ValueError("stale_session")
    return row["version"] + 1


def close(c, session_id, version, actor, org_id=ORG_ID, now=None):
    now = now or int(time.time())
    row = c.execute("SELECT * FROM consult_sessions WHERE org_id=? AND id=?",
                    (org_id, session_id)).fetchone()
    if not row:
        raise LookupError("session_not_found")
    if row["status"] == "closed":
        raise ValueError("session_closed")
    if type(version) is not int or version != row["version"]:
        raise ValueError("stale_session")
    changed = c.execute("""UPDATE consult_sessions SET status='closed',closed_by=?,closed_at=?,
        updated_by=?,updated_at=?,version=version+1
        WHERE org_id=? AND id=? AND version=? AND status='open'""",
                        (actor, now, actor, now, org_id, session_id, version))
    if changed.rowcount != 1:
        raise ValueError("stale_session")
    return version + 1


def discard(c, session_id, org_id=ORG_ID):
    """Descarta uma consulta ainda aberta (ex.: aberta só para consultar):
    apaga o registo e a avaliação desta consulta; a marcação fica como estava."""
    row = c.execute("SELECT status FROM consult_sessions WHERE org_id=? AND id=?",
                    (org_id, session_id)).fetchone()
    if not row:
        raise LookupError("session_not_found")
    if row["status"] == "closed":
        raise ValueError("session_closed")
    c.execute("DELETE FROM consult_assessments WHERE org_id=? AND session_id=?", (org_id, session_id))
    c.execute("DELETE FROM consult_sessions WHERE org_id=? AND id=? AND status='open'", (org_id, session_id))
    return {"ok": True}
