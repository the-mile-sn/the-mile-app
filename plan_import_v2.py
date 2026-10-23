"""Isolated, review-only PDF plan imports for the test backoffice.

Only parsed review data is stored. No PDF bytes, no player publication.
"""
import io
import json
import re
import secrets
import time

from pypdf import PdfReader

ALLOWED_COLORS = {"orange", "yellow", "blue", "green", "vp"}
MEAL_MAP = {
    "pequeno almoço": ["breakfast"],
    "pequeno-almoço": ["breakfast"],
    "pequeno almoco": ["breakfast"],
    "pequeno-almoco": ["breakfast"],
    "pequeno almoço / lanche": ["breakfast", "snack"],
    "pequeno-almoço / lanche": ["breakfast", "snack"],
    "almoço / jantar": ["lunch", "dinner"],
    "almoco / jantar": ["lunch", "dinner"],
    "ceia": ["supper"],
    "lanche": ["snack"],
}
OPTION = re.compile(r"^\s*[-–]?\s*Opção\s+(\d+)\b", re.IGNORECASE)
NUTRIENTS = re.compile(r"(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s*$")


FOOD = re.compile(r"^(?P<quantity>\d+(?:[,.]\d+)?\s*(?:un|g|ml|tigela|c\.sopa|c\.café)(?:\s*/\s*\d+\s*g)?)\s+(?P<name>.+)$", re.IGNORECASE)
NOTE_PREFIXES = ("numa ", "servir com", "para a massa", "misturar", "levar ao ", "preparar ", "adicionar ", "aquecer ", "cozinhar ", "juntar ")


def structure_line(raw):
    text = re.sub(r"\\s+", " ", raw).strip()
    if not text:
        return {"kind": "note", "text": raw}
    totals = NUTRIENTS.search(text)
    body = text[:totals.start()].strip() if totals else text
    lower = body.casefold().lstrip("-– ").strip()
    if lower.endswith(":") or lower.startswith(NOTE_PREFIXES):
        kind = "instruction"
    else:
        match = FOOD.match(body)
        kind = "food" if match else ("title" if body.startswith(("-", "–")) else "note")
    entry = {"kind": kind, "text": body, "source": raw}
    if kind == "food":
        match = FOOD.match(body)
        entry["quantity"] = match.group("quantity")
        entry["name"] = match.group("name")
        if totals:
            entry["nutrients"] = {
                "kcal": totals.group(1), "protein_g": totals.group(2),
                "carbs_g": totals.group(3), "fat_g": totals.group(4)
            }
        else:
            entry["needs_review"] = True
    elif totals:
        entry["needs_review"] = True
    return entry


def enrich_groups(groups):
    for group in groups:
        for option in group["options"]:
            if "items" not in option:
                option["items"] = [structure_line(line) for line in option["lines"]]
    return [group for group in groups if group["options"]]


def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_plan_imports (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        color TEXT NOT NULL,
        filename TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        extracted_json TEXT NOT NULL,
        created_at BIGINT NOT NULL
    )""")
    # Reserved for a future explicit publication action. No public/player route writes here.
    c.execute("""CREATE TABLE IF NOT EXISTS v2_plan_publications (
        id TEXT PRIMARY KEY,
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        color TEXT NOT NULL,
        source_import_id TEXT NOT NULL REFERENCES v2_plan_imports(id),
        snapshot_json TEXT NOT NULL,
        published_at BIGINT NOT NULL,
        published_by TEXT NOT NULL,
        replaced_at BIGINT,
        UNIQUE(athlete_id, color, published_at)
    )""")
    c.execute("""CREATE INDEX IF NOT EXISTS idx_v2_publications_active
                 ON v2_plan_publications(athlete_id, color, replaced_at)""")


def color_plan_status(c, athlete_id):
    """Admin-only overview; validation is not publication."""
    from microcycles_v2 import COLORS
    rows = c.execute("""SELECT id,color,status,created_at FROM v2_plan_imports
                        WHERE athlete_id=? ORDER BY created_at DESC""", (athlete_id,)).fetchall()
    active = c.execute("""SELECT color,source_import_id,published_at FROM v2_plan_publications
                         WHERE athlete_id=? AND replaced_at IS NULL""", (athlete_id,)).fetchall()
    grouped = {color: [] for color in COLORS}
    for row in rows:
        if row["color"] in grouped:
            grouped[row["color"]].append(dict(row))
    publication_by_color = {row["color"]: dict(row) for row in active}
    return [{"color":color,"plans":grouped[color],
             "validated_count":sum(p["status"]=="validated" for p in grouped[color]),
             "publication":publication_by_color.get(color)} for color in COLORS]



def validated_meal_options(c, athlete_id):
    """Admin-only latest validated options by color and meal; never player-facing."""
    from microcycles_v2 import COLORS, MEALS
    rows = c.execute("""SELECT id,color,extracted_json FROM v2_plan_imports
                        WHERE athlete_id=? AND status='validated'
                        ORDER BY created_at DESC, rowid DESC""", (athlete_id,)).fetchall()
    result = {color: {meal: [] for meal in MEALS} for color in COLORS}
    selected = set()
    for row in rows:
        if row["color"] in selected or row["color"] not in result:
            continue
        selected.add(row["color"])
        data = json.loads(row["extracted_json"])
        for group in enrich_groups(data.get("groups", [])):
            for meal in group.get("meals", []):
                if meal not in result[row["color"]]:
                    continue
                for option in group.get("options", []):
                    result[row["color"]][meal].append({
                        "number": option.get("number"), "title": option.get("title") or
                        next((item.get("text", "").lstrip("-– ") for item in option.get("items", [])
                              if item.get("kind") == "title"), ""),
                        "totals": option.get("totals"), "items": [
                            {"kind": item.get("kind"), "name": item.get("name"),
                             "quantity": item.get("quantity"), "text": item.get("text")}
                            for item in option.get("items", []) if item.get("kind") != "title"
                        ]
                    })
    return result


def extract_plan(pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    if len(reader.pages) < 1 or len(reader.pages) > 40:
        raise ValueError("invalid_pdf_pages")
    groups = []
    current_group = None
    current_option = None
    warnings = []
    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text(extraction_mode="layout") or ""
        if not text.strip():
            warnings.append("Página %s sem texto selecionável; verificar manualmente." % page_number)
            continue
        for raw in text.splitlines():
            line = raw.strip()
            if not line:
                continue
            plain = re.sub(r"\s+", " ", line).strip()
            # A subsection heading has no trailing numeric nutrition columns.
            lowered = plain.casefold()
            meal = MEAL_MAP.get(lowered)
            if meal:
                current_group = {"heading": plain, "meals": meal, "page": page_number, "options": []}
                groups.append(current_group)
                current_option = None
                continue
            option = OPTION.match(plain)
            if current_group is not None and option:
                nutrient_match = NUTRIENTS.search(plain)
                current_option = {
                    "number": int(option.group(1)),
                    "totals": ({"kcal": nutrient_match.group(1),
                                "protein_g": nutrient_match.group(2),
                                "carbs_g": nutrient_match.group(3),
                                "fat_g": nutrient_match.group(4)}
                               if nutrient_match else None),
                    "lines": [],
                    "page": page_number,
                }
                current_group["options"].append(current_option)
                continue
            if current_option is not None:
                if lowered.startswith("www.themile.pt") or lowered in ("plano alimentar",):
                    continue
                current_option["lines"].append(plain)
    groups = enrich_groups(groups)
    if not groups:
        raise ValueError("pdf_structure_unrecognized")
    warnings.append("Rever os alimentos, quantidades, valores e instruções extraídos antes da validação clínica.")
    return {"groups": groups, "warnings": warnings, "pages": len(reader.pages)}


def save_draft(c, athlete_id, color, filename, content):
    if color not in ALLOWED_COLORS or not isinstance(filename, str) or len(filename) > 180:
        raise ValueError("invalid_import")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?", (athlete_id,)).fetchone():
        return None
    data = extract_plan(content)
    draft_id = secrets.token_hex(16)
    c.execute("INSERT INTO v2_plan_imports(id,athlete_id,color,filename,status,extracted_json,created_at) VALUES(?,?,?,?,?,?,?)",
              (draft_id, athlete_id, color, filename, "draft", json.dumps(data, ensure_ascii=False), int(time.time())))
    c.commit()
    return {"id": draft_id, "color": color, "filename": filename, "status": "draft", "extracted": data}


def list_drafts(c, athlete_id):
    rows = c.execute("SELECT id,color,filename,status,created_at FROM v2_plan_imports WHERE athlete_id=? ORDER BY created_at DESC",
                     (athlete_id,)).fetchall()
    return [dict(r) for r in rows]


def get_draft(c, athlete_id, draft_id):
    row = c.execute("SELECT * FROM v2_plan_imports WHERE id=? AND athlete_id=?", (draft_id, athlete_id)).fetchone()
    if row is None:
        return None
    result = dict(row)
    result["extracted"] = json.loads(result.pop("extracted_json"))
    result["extracted"]["groups"] = enrich_groups(result["extracted"]["groups"])
    return result


NUTRIENT_KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")


def update_option(c, athlete_id, draft_id, group_index, option_index, payload):
    """Persist one reviewed option. Never change publication or other athletes."""
    draft = get_draft(c, athlete_id, draft_id)
    if draft is None:
        return None
    if draft["status"] != "draft":
        raise ValueError("plan_not_in_review")
    groups = draft["extracted"]["groups"]
    if type(group_index) is not int or type(option_index) is not int:
        raise ValueError("invalid_option")
    if group_index < 0 or group_index >= len(groups):
        raise ValueError("invalid_option")
    options = groups[group_index]["options"]
    if option_index < 0 or option_index >= len(options):
        raise ValueError("invalid_option")
    if not isinstance(payload, dict):
        raise ValueError("invalid_option")
    items = payload.get("items")
    totals = payload.get("totals")
    title = payload.get("title")
    reviewed = payload.get("reviewed")
    if not isinstance(items, list) or len(items) > 80 or not isinstance(title, str) or len(title) > 300 or type(reviewed) is not bool:
        raise ValueError("invalid_option")
    if totals is not None and (not isinstance(totals, dict) or set(totals) != set(NUTRIENT_KEYS)):
        raise ValueError("invalid_totals")
    if totals is not None and any(not isinstance(v, str) or len(v) > 24 for v in totals.values()):
        raise ValueError("invalid_totals")
    clean = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") not in ("food", "title", "note", "instruction"):
            raise ValueError("invalid_item")
        kind = item["kind"]
        text = item.get("text", "")
        name = item.get("name", "")
        quantity = item.get("quantity", "")
        values = item.get("nutrients")
        if any(not isinstance(v, str) or len(v) > 600 for v in (text, name, quantity)):
            raise ValueError("invalid_item")
        if kind == "food" and (not name.strip() or not quantity.strip()):
            raise ValueError("invalid_food")
        if values is not None and (kind != "food" or not isinstance(values, dict) or set(values) != set(NUTRIENT_KEYS)
                                   or any(not isinstance(v, str) or len(v) > 24 for v in values.values())):
            raise ValueError("invalid_nutrients")
        clean.append({"kind": kind, "text": text, "name": name, "quantity": quantity, "nutrients": values})
    option = options[option_index]
    option["items"] = clean
    option["title"] = title
    option["totals"] = totals
    option["reviewed"] = reviewed
    # Preserve the original PDF lines for traceability.
    draft["extracted"]["groups"] = groups
    c.execute("UPDATE v2_plan_imports SET extracted_json=? WHERE id=? AND athlete_id=? AND status='draft'",
              (json.dumps(draft["extracted"], ensure_ascii=False), draft_id, athlete_id))
    c.commit()
    return option


def set_review_status(c, athlete_id, draft_id, action):
    """Approve a fully reviewed plan or reopen it; never publish to players."""
    draft = get_draft(c, athlete_id, draft_id)
    if draft is None:
        return None
    if action == "approve":
        if draft["status"] != "draft":
            raise ValueError("invalid_status")
        options = [option for group in draft["extracted"]["groups"] for option in group["options"]]
        if not options:
            raise ValueError("empty_plan")
        # Whole-plan approval is an explicit admin action; per-option review is optional.
        new_status = "validated"
    elif action == "reopen":
        if draft["status"] != "validated":
            raise ValueError("invalid_status")
        new_status = "draft"
    else:
        raise ValueError("invalid_action")
    result = c.execute("UPDATE v2_plan_imports SET status=? WHERE id=? AND athlete_id=? AND status=?",
                       (new_status, draft_id, athlete_id, draft["status"]))
    if result.rowcount != 1:
        raise ValueError("status_changed")
    c.commit()
    return new_status


def update_group_meals(c, athlete_id, draft_id, group_index, meals):
    from microcycles_v2 import MEALS
    draft=get_draft(c,athlete_id,draft_id)
    if draft is None: return None
    if draft["status"]!="draft" or type(group_index) is not int or not isinstance(meals,list) or not meals or len(meals)>5 or len(set(meals))!=len(meals) or any(m not in MEALS for m in meals):
        raise ValueError("invalid_meal_mapping")
    groups=draft["extracted"]["groups"]
    if not 0<=group_index<len(groups): raise ValueError("invalid_meal_mapping")
    groups[group_index]["meals"]=meals
    c.execute("UPDATE v2_plan_imports SET extracted_json=? WHERE id=? AND athlete_id=? AND status='draft'",
       (json.dumps(draft["extracted"],ensure_ascii=False),draft_id,athlete_id))
    c.commit()
    return meals
