"""Formulário pré-consulta: respostas do cliente antes da primeira consulta.

Aditivo: só cria a tabela ``consult_forms``. Cada cliente de consulta tem no
máximo um formulário, aberto por um link com um código aleatório. A página
pública vive em themile.pt (app proxy Shopify, assinado) e nunca no admin.

Ao enviar, preenche no perfil apenas os campos ainda vazios (data de
nascimento, sexo, altura). Não altera marcações, pagamentos nem nomes.
"""
import json
import os
import re
import secrets
import time
import uuid
from datetime import date

from appointments_catalog_v2 import ORG_ID
import consult_clients_v2 as clients

TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{30,60}$")
LINK_DAYS = 120
ANSWERS_LIMIT = 60000

FREQ = [["rarely", "Raramente"], ["w1_3", "1–3× semana"], ["w4_6", "4–6× semana"],
        ["d1", "1× dia"], ["d2", "2× dia"], ["d3", "3× dia ou mais"]]
YES_NO = [["yes", "Sim"], ["no", "Não"]]

# Uma só definição de perguntas para a página do cliente e para o backoffice.
# Tipos: choice, text, textarea, date, number, check, grid (frequências), meals.
STEPS = [
    {"id": "about", "title": "Sobre ti", "fields": [
        {"id": "for_whom", "short": "Para quem", "type": "choice", "label": "Para quem é esta consulta?", "required": True,
         "options": [["self", "Para mim"], ["other", "Para outra pessoa"]]},
        {"id": "attendee_name", "short": "Nome de quem vai", "type": "text", "label": "Nome de quem vai à consulta", "required": True,
         "when": {"for_whom": "other"}, "max": 120},
        {"id": "relation", "short": "Relação", "type": "text", "label": "A tua relação com essa pessoa",
         "placeholder": "Ex.: mãe, pai, treinador", "when": {"for_whom": "other"}, "max": 80},
        {"id": "birth_date", "type": "date", "label": "Data de nascimento", "required": True,
         "hint_other": "Da pessoa que vai à consulta."},
        {"id": "occupation", "short": "Profissão", "type": "text", "label": "Profissão ou ocupação",
         "placeholder": "Ex.: enfermeira por turnos, estudante", "max": 120},
        {"id": "goal", "short": "Objetivo", "type": "textarea", "label": "O que te traz à consulta?", "required": True,
         "placeholder": "O teu principal objetivo, por palavras tuas.", "max": 1500},
    ]},
    {"id": "body", "title": "Corpo e saúde", "fields": [
        {"id": "sex", "type": "choice", "label": "Sexo", "required": True,
         "options": [["F", "Feminino"], ["M", "Masculino"]]},
        {"id": "height_cm", "type": "number", "label": "Altura", "unit": "cm", "required": True,
         "min": 90, "max": 230, "step": 1},
        {"id": "weight_kg", "type": "number", "label": "Peso atual", "unit": "kg", "required": True,
         "min": 20, "max": 250, "step": 0.1},
        {"id": "weight_year_kg", "short": "Peso há um ano", "type": "number", "label": "Peso há um ano (aproximado)", "unit": "kg",
         "min": 20, "max": 250, "step": 0.1},
        {"id": "conditions", "short": "Problemas de saúde", "type": "textarea", "label": "Problemas de saúde diagnosticados",
         "placeholder": "Ex.: tiroide, diabetes, colesterol. Deixa em branco se não tiveres.", "max": 1500},
        {"id": "allergies", "short": "Alergias", "type": "text", "label": "Alergias alimentares", "placeholder": "Deixa em branco se não tiveres.", "max": 300},
        {"id": "intolerances", "short": "Intolerâncias", "type": "text", "label": "Intolerâncias alimentares", "placeholder": "Ex.: lactose", "max": 300},
        {"id": "medication", "short": "Medicação", "type": "text", "label": "Medicação habitual", "placeholder": "Deixa em branco se não tomares.", "max": 500},
        {"id": "sleep_hours", "short": "Sono", "type": "number", "label": "Horas de sono por noite", "unit": "h",
         "min": 2, "max": 14, "step": 0.5},
        {"id": "sleep_quality", "short": "Qualidade do sono", "type": "choice", "label": "Como dormes?",
         "options": [["good", "Bem"], ["fair", "Razoavelmente"], ["poor", "Mal"]]},
        {"id": "bowel", "short": "Intestino", "type": "choice", "label": "Funcionamento do intestino",
         "options": [["regular", "Regular"], ["constipation", "Preso"], ["loose", "Solto com frequência"],
                     ["varies", "Varia muito"]]},
    ]},
    {"id": "female", "title": "Saúde feminina", "when": {"sex": "F"}, "fields": [
        {"id": "cycle", "short": "Ciclo", "type": "choice", "label": "Ciclo menstrual",
         "options": [["regular", "Regular"], ["irregular", "Irregular"], ["absent", "Sem menstruação"],
                     ["menopause", "Menopausa"]]},
        {"id": "contraception", "type": "choice", "label": "Contraceção",
         "options": [["hormonal", "Hormonal (pílula, anel, implante…)"], ["other", "Não hormonal"],
                     ["none", "Nenhuma"]]},
        {"id": "pregnancy", "short": "Gravidez", "type": "choice", "label": "Neste momento",
         "options": [["no", "Nada a assinalar"], ["pregnant", "Estou grávida"],
                     ["breastfeeding", "Estou a amamentar"], ["planning", "Estou a planear engravidar"]]},
        {"id": "cycle_notes", "short": "Notas do ciclo", "type": "textarea", "label": "Algo que queiras referir sobre o ciclo",
         "placeholder": "Ex.: dores, alterações do apetite ou da energia.", "max": 1000},
    ]},
    {"id": "training", "title": "Treino", "fields": [
        {"id": "trains", "short": "Faz exercício", "type": "choice", "label": "Fazes exercício ou desporto?", "required": True,
         "options": YES_NO},
        {"id": "sport", "short": "Modalidade", "type": "text", "label": "Modalidade(s)", "when": {"trains": "yes"}, "max": 200},
        {"id": "frequency", "short": "Frequência", "type": "text", "label": "Quantas vezes por semana e quanto tempo",
         "placeholder": "Ex.: 4× por semana, 1 h", "when": {"trains": "yes"}, "max": 200},
        {"id": "sport_goal", "short": "Objetivo desportivo", "type": "text", "label": "Objetivo desportivo",
         "placeholder": "Ex.: meia maratona em abril", "when": {"trains": "yes"}, "max": 300},
        {"id": "training_drink", "short": "Bebe no treino", "type": "choice", "label": "O que bebes durante o treino?",
         "when": {"trains": "yes"},
         "options": [["water", "Só água"], ["sports", "Água e bebida desportiva"], ["little", "Pouco ou nada"]]},
        {"id": "daily_activity", "short": "Dia a dia", "type": "choice", "label": "No dia a dia, passas a maior parte do tempo…",
         "options": [["sitting", "Sentado/a"], ["standing", "Em pé ou a andar"], ["physical", "Em trabalho físico"]]},
    ]},
    {"id": "habits", "title": "Hábitos alimentares", "fields": [
        {"id": "frequency_grid", "type": "grid", "label": "Com que frequência comes…",
         "hint": "Escolhe a opção mais próxima de uma semana normal.", "options": FREQ, "rows": [
             ["soup", "Sopa", ""], ["vegetables", "Legumes no prato", ""], ["fruit", "Fruta", ""],
             ["legumes", "Leguminosas", "feijão, grão, lentilhas"],
             ["fatty_fish", "Peixe gordo", "salmão, sardinha, cavala"],
             ["red_meat", "Carne vermelha", "vaca, porco, borrego"],
             ["dairy", "Laticínios", "leite, iogurte, queijo"],
             ["nuts", "Frutos gordos", "nozes, amêndoas, amendoins"],
             ["whole_grains", "Cereais integrais", "pão, arroz ou massa integrais, aveia"],
             ["eating_out", "Refeições fora de casa", ""], ["fried", "Fritos", ""],
             ["sweets", "Doces e bolos", ""], ["sugary_drinks", "Refrigerantes e sumos", ""],
             ["alcohol", "Bebidas alcoólicas", ""]]},
        {"id": "water", "short": "Água por dia", "type": "choice", "label": "Quanta água bebes por dia?",
         "options": [["lt1", "Menos de 1 L"], ["1_15", "1 a 1,5 L"], ["15_2", "1,5 a 2 L"], ["gt2", "Mais de 2 L"]]},
    ]},
    {"id": "day", "title": "Um dia típico", "fields": [
        {"id": "day_kind", "short": "Dia descrito", "type": "text", "label": "Que dia vais descrever?",
         "placeholder": "Ex.: dia de trabalho com treino ao fim da tarde", "max": 200},
        {"id": "meals", "type": "meals", "label": "O que comes ao longo do dia",
         "hint": "Indica a hora e o que costumas comer. Deixa em branco as refeições que não fazes.",
         "rows": [["breakfast", "Pequeno-almoço"], ["mid_morning", "Meio da manhã"], ["lunch", "Almoço"],
                  ["snack", "Lanche"], ["dinner", "Jantar"], ["supper", "Ceia"],
                  ["training", "Antes ou depois do treino"]]},
    ]},
    {"id": "supplements", "title": "Suplementação e competição", "fields": [
        {"id": "supplements", "short": "Suplementos", "type": "textarea", "label": "Tomas algum suplemento? Quais e quando?",
         "placeholder": "Deixa em branco se não tomares.", "max": 1000},
        {"id": "competes", "short": "Compete", "type": "choice", "label": "Participas em provas ou competições?", "options": YES_NO},
        {"id": "next_event", "short": "Próxima prova", "type": "text", "label": "Próxima prova e data", "when": {"competes": "yes"}, "max": 200},
        {"id": "event_fuel", "short": "Em prova", "type": "textarea", "label": "O que comes e bebes durante as provas?",
         "when": {"competes": "yes"}, "max": 1000},
    ]},
    {"id": "notes", "title": "Notas e consentimento", "fields": [
        {"id": "notes", "short": "Notas do cliente", "type": "textarea", "label": "Há mais alguma coisa que queiras que a nutricionista saiba?",
         "max": 3000},
        {"id": "consent", "type": "check", "required": True,
         "label": "Autorizo a The Mile a tratar os dados de saúde deste formulário para preparar e acompanhar as consultas de nutrição."},
    ]},
]
FIELDS = {f["id"]: f for s in STEPS for f in s["fields"]}
STEP_OF = {f["id"]: s for s in STEPS for f in s["fields"]}
CARE_FIELDS = ("allergies", "intolerances", "medication", "conditions")


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS consult_forms (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted')),
        answers_json TEXT NOT NULL DEFAULT '{}',
        step INTEGER NOT NULL DEFAULT 0,
        consent_at BIGINT,
        submitted_at BIGINT,
        expires_at BIGINT NOT NULL,
        created_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(org_id, client_id)
    );
    """)


def public_base():
    return os.environ.get("MILE_FORM_PUBLIC_URL", "https://themile.pt/apps/the-mile-booking/formulario").rstrip("/")


def _link(token):
    return public_base() + "?t=" + token


# ---------- backoffice ----------

def ensure(c, client_id, actor, org_id=ORG_ID, now=None):
    """Devolve o formulário do cliente, criando-o (e o link) se ainda não existir."""
    now = now or int(time.time())
    clients._row(c, client_id, org_id)
    row = c.execute("SELECT * FROM consult_forms WHERE org_id=? AND client_id=?", (org_id, client_id)).fetchone()
    if not row:
        c.execute("""INSERT INTO consult_forms
            (id,org_id,client_id,token,expires_at,created_by,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id,client_id) DO NOTHING""",
                  (uuid.uuid4().hex, org_id, client_id, secrets.token_urlsafe(32),
                   now + LINK_DAYS * 86400, actor, now, now))
    elif row["status"] == "pending" and row["expires_at"] < now:
        c.execute("UPDATE consult_forms SET expires_at=?,updated_at=? WHERE id=?",
                  (now + LINK_DAYS * 86400, now, row["id"]))
    return for_client(c, client_id, org_id)


def for_client(c, client_id, org_id=ORG_ID):
    """Estado e respostas do formulário deste cliente (ou None)."""
    row = c.execute("SELECT * FROM consult_forms WHERE org_id=? AND client_id=?", (org_id, client_id)).fetchone()
    if not row:
        return None
    answers = json.loads(row["answers_json"] or "{}")
    return {"status": row["status"], "link": _link(row["token"]), "submitted_at": row["submitted_at"],
            "updated_at": row["updated_at"], "answers": answers,
            "sections": readable(answers), "care": care(answers)}


def care(answers):
    """O que entra em «A ter em conta»: alergias, intolerâncias, medicação, doenças, gravidez."""
    out = []
    for key in CARE_FIELDS:
        value = (answers.get(key) or "").strip()
        if value:
            out.append({"label": FIELDS[key].get("short", FIELDS[key]["label"]), "value": value})
    if answers.get("sex") == "F" and answers.get("pregnancy") in ("pregnant", "breastfeeding", "planning"):
        out.append({"label": "Gravidez", "value": _option_label("pregnancy", answers["pregnancy"])})
    return out


def _option_label(field_id, value):
    for key, label in FIELDS[field_id].get("options", []):
        if key == value:
            return label
    return value


def _visible(item, answers):
    when = item.get("when") or {}
    return all(answers.get(k) == v for k, v in when.items())


def readable(answers):
    """Respostas organizadas por passo, prontas a mostrar (rótulos em vez de códigos)."""
    sections = []
    for step in STEPS:
        if not _visible(step, answers):
            continue
        rows = []
        for f in step["fields"]:
            if not _visible(f, answers) or f["type"] == "check":
                continue
            value = answers.get(f["id"])
            if f["type"] == "grid":
                grid = value if isinstance(value, dict) else {}
                rows.append({"type": "grid", "label": f["label"], "options": f["options"],
                             "rows": [{"key": k, "label": lab, "hint": hint, "value": grid.get(k, "")}
                                      for k, lab, hint in f["rows"]]})
            elif f["type"] == "meals":
                meals = value if isinstance(value, dict) else {}
                items = []
                for k, lab in f["rows"]:
                    m = meals.get(k) or {}
                    if m.get("time") or m.get("text"):
                        items.append({"key": k, "label": lab, "time": m.get("time", ""), "text": m.get("text", "")})
                rows.append({"type": "meals", "label": f["label"], "items": items})
            else:
                if value in (None, ""):
                    continue
                if f["type"] == "choice":
                    text = _option_label(f["id"], value)
                elif f["type"] == "number":
                    text = ("%g" % value).replace(".", ",") + (" " + f["unit"] if f.get("unit") else "")
                elif f["type"] == "date":
                    try:
                        text = date.fromisoformat(value).strftime("%d/%m/%Y")
                    except ValueError:
                        text = value
                else:
                    text = value
                rows.append({"type": "text", "key": f["id"], "label": f.get("short", f["label"]), "value": text})
        sections.append({"id": step["id"], "title": step["title"], "rows": rows})
    return sections


# ---------- página pública ----------

def _by_token(c, token, now):
    if not isinstance(token, str) or not TOKEN_RE.match(token):
        raise LookupError("form_not_found")
    row = c.execute("SELECT * FROM consult_forms WHERE token=?", (token,)).fetchone()
    if not row or row["expires_at"] < now:
        raise LookupError("form_not_found")
    return row


def _next_booking(c, row, today):
    import consult_sessions_v2 as sessions
    items = sorted(sessions._linked_bookings(c, row["org_id"], row["client_id"]),
                   key=lambda b: (b["day"], b["start_minute"]))
    upcoming = [b for b in items if b["day"] >= today] or items[-1:]
    if not upcoming:
        return None
    b = upcoming[0]
    return {"date": b["day"], "start": sessions._hhmm(b["start_minute"]), "mode": b["mode"],
            "service": b["service_name"], "professional": b["professional_name"]}


def public_view(c, token, now=None, today=None):
    now = now or int(time.time())
    row = _by_token(c, token, now)
    client = c.execute("SELECT name FROM consult_clients WHERE org_id=? AND id=?",
                       (row["org_id"], row["client_id"])).fetchone()
    first = ((client["name"] if client else "") or "").split(" ")[0]
    return {"first_name": first, "status": row["status"], "step": row["step"],
            "answers": json.loads(row["answers_json"] or "{}"),
            "booking": _next_booking(c, row, today or date.today().isoformat()),
            "steps": STEPS}


def _clean_value(f, value):
    kind = f["type"]
    if value in (None, ""):
        return None
    if kind in ("text", "textarea"):
        if not isinstance(value, str):
            raise ValueError("invalid_" + f["id"])
        value = value.strip() if kind == "textarea" else " ".join(value.split())
        if len(value) > f.get("max", 500):
            raise ValueError("invalid_" + f["id"])
        return value or None
    if kind == "choice":
        if value not in [k for k, _ in f["options"]]:
            raise ValueError("invalid_" + f["id"])
        return value
    if kind == "check":
        if value is not True:
            raise ValueError("invalid_" + f["id"])
        return True
    if kind == "date":
        try:
            parsed = date.fromisoformat(value) if isinstance(value, str) and len(value) == 10 else None
        except ValueError:
            parsed = None
        if not parsed or parsed.year < 1900 or parsed > date.today():
            raise ValueError("invalid_" + f["id"])
        return parsed.isoformat()
    if kind == "number":
        if isinstance(value, bool):
            raise ValueError("invalid_" + f["id"])
        try:
            number = float(str(value).replace(",", "."))
        except ValueError:
            raise ValueError("invalid_" + f["id"])
        if not (f["min"] <= number <= f["max"]):
            raise ValueError("invalid_" + f["id"])
        return round(number, 1)
    if kind == "grid":
        if not isinstance(value, dict):
            raise ValueError("invalid_" + f["id"])
        keys = {k for k, _, _ in f["rows"]}
        options = {k for k, _ in f["options"]}
        out = {}
        for k, v in value.items():
            if k not in keys or (v not in options and v not in ("", None)):
                raise ValueError("invalid_" + f["id"])
            if v:
                out[k] = v
        return out or None
    if kind == "meals":
        if not isinstance(value, dict):
            raise ValueError("invalid_" + f["id"])
        keys = {k for k, _ in f["rows"]}
        out = {}
        for k, v in value.items():
            if k not in keys or not isinstance(v, dict):
                raise ValueError("invalid_" + f["id"])
            t = v.get("time") or ""
            text = v.get("text") or ""
            if not isinstance(t, str) or (t and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t)):
                raise ValueError("invalid_" + f["id"])
            if not isinstance(text, str) or len(text) > 600:
                raise ValueError("invalid_" + f["id"])
            if t or text.strip():
                out[k] = {"time": t, "text": text.strip()}
        return out or None
    raise ValueError("invalid_" + f["id"])


def clean_answers(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_answers")
    out = {}
    for key, value in payload.items():
        f = FIELDS.get(key)
        if not f:
            raise ValueError("invalid_answers")
        cleaned = _clean_value(f, value)
        if cleaned is not None:
            out[key] = cleaned
    if len(json.dumps(out, ensure_ascii=False)) > ANSWERS_LIMIT:
        raise ValueError("answers_too_large")
    return out


def missing(answers):
    """Perguntas obrigatórias por responder (só as visíveis)."""
    out = []
    for step in STEPS:
        if not _visible(step, answers):
            continue
        for f in step["fields"]:
            if f.get("required") and _visible(f, answers) and answers.get(f["id"]) in (None, "", {}):
                out.append(f["id"])
    return out


def save(c, token, payload, now=None):
    """Guardado automático (rascunho ou alterações depois de enviado)."""
    now = now or int(time.time())
    row = _by_token(c, token, now)
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    answers = clean_answers(payload.get("answers") or {})
    step = payload.get("step", row["step"])
    if type(step) is not int or not (0 <= step < len(STEPS)):
        step = row["step"]
    consent_at = row["consent_at"]
    if answers.get("consent") and not consent_at:
        consent_at = now
    if not answers.get("consent"):
        consent_at = None
        if row["status"] == "submitted":
            raise ValueError("consent_required")
    c.execute("""UPDATE consult_forms SET answers_json=?,step=?,consent_at=?,updated_at=? WHERE id=?""",
              (json.dumps(answers, ensure_ascii=False, sort_keys=True), step, consent_at, now, row["id"]))
    return {"ok": True, "missing": missing(answers)}


def submit(c, token, payload, now=None):
    now = now or int(time.time())
    save(c, token, payload, now)
    row = _by_token(c, token, now)
    answers = json.loads(row["answers_json"] or "{}")
    gaps = missing(answers)
    if gaps:
        raise ValueError("missing:" + ",".join(gaps))
    first = row["status"] != "submitted"
    c.execute("UPDATE consult_forms SET status='submitted',submitted_at=COALESCE(submitted_at,?),updated_at=? WHERE id=?",
              (now, now, row["id"]))
    _fill_profile(c, row, answers, now)
    if first:
        clients._audit(c, row["org_id"], row["client_id"], None, "form_submitted", {}, now)
    return {"ok": True}


def _fill_profile(c, row, answers, now):
    """Só preenche o que está vazio no perfil; nunca substitui o que a equipa registou."""
    profile = c.execute("SELECT birth_date,sex,height_cm FROM consult_clients WHERE org_id=? AND id=?",
                        (row["org_id"], row["client_id"])).fetchone()
    if not profile:
        return
    changes = {}
    if not profile["birth_date"] and answers.get("birth_date"):
        changes["birth_date"] = answers["birth_date"]
    if not profile["sex"] and answers.get("sex") in ("F", "M"):
        changes["sex"] = answers["sex"]
    if not profile["height_cm"] and answers.get("height_cm"):
        changes["height_cm"] = answers["height_cm"]
    if not changes:
        return
    sets = ",".join(f"{k}=?" for k in changes)
    c.execute(f"UPDATE consult_clients SET {sets},version=version+1,updated_at=? WHERE org_id=? AND id=?",
              (*changes.values(), now, row["org_id"], row["client_id"]))
    clients._audit(c, row["org_id"], row["client_id"], None, "updated_from_form",
                   {"fields": sorted(changes)}, now)
