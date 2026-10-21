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
OPTION = re.compile(r"^\\s*[-–]?\\s*Opção\\s+(\\d+)\\b", re.IGNORECASE)
NUTRIENTS = re.compile(r"(\\d+[,.]?\\d*)\\s+(\\d+[,.]?\\d*)\\s+(\\d+[,.]?\\d*)\\s+(\\d+[,.]?\\d*)\\s*$")


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
            plain = re.sub(r"\\s+", " ", line).strip()
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
    if not groups or not any(g["options"] for g in groups):
        raise ValueError("pdf_structure_unrecognized")
    warnings.append("Confirmar manualmente alimentos, quantidades, valores e instruções; as linhas ainda não são dados validados.")
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
    return result
