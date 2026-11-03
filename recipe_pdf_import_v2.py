"""Layout-aware, review-first extraction of The Mile Canva recipe PDFs.

Never exposes nutritional figures or writes to meal prescriptions.
"""
import base64
import io
import json
import re
import secrets
import time
import unicodedata

import fitz
from PIL import Image, ImageOps

MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_PAGES = 45
MAX_PHOTO_BYTES = 180000

ING = re.compile(r"^ingredientes\s*:?$", re.I)
PREP = re.compile(r"^(?:modo de (?:preparo|prepara(?:c|ç)[aã]o)|prepara(?:c|ç)[aã]o|confe(?:c|ç)[aã]o)\s*:?$", re.I)
TIPS_END = re.compile(r"\b(?:dicas?\s+uteis|dicas?\s+e\s+observacoes|observacoes|notas?|sugestoes)\s*:?\s*$", re.I)
BLOCK = re.compile(r"^(?:para\s+(?:o|a|os|as|um|uma)\s+.+|acompanhar\s+com\s*:?|para\s+(?:servir|acompanhar|finalizar)\s*:?)$", re.I)
STEP = re.compile(r"^\s*(\d{1,2})\s*[.)]\s*(.*)$")
QUANT = re.compile(r"^(?P<q>(?:\d+(?:[,.]\d+)?(?:\s*(?:g|kg|mg|ml|cl|l|un\.?|unid(?:ade)?s?\.?|c\.?\s*caf[eé]|c\.?\s*sopa))?(?:\s*/\s*\d+(?:[,.]\d+)?\s*(?:g|kg|ml|l|un))?|q\s*\.\s*b\s*\.|opcional))\s+(?P<food>.+)$", re.I)
SINGLE = re.compile(r"^(\d+(?:[,.]\d+)?)\s*(g|kg|mg|ml|cl|l|un\.?|unid(?:ade)?s?\.?)$", re.I)
GRAMS_IN_STEPS = re.compile(r"\b\d+(?:[,.]\d+)?\s*(?:g|kg|ml)\b", re.I)
BAD_TITLES = {"receitas", "the mile", "ingredientes", "modo de preparo", "modo de preparação", "preparação"}


def normal(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).casefold()) if not unicodedata.combining(c)).strip()


def spans(page):
    result = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                text = " ".join(sp.get("text", "").split())
                if text:
                    x, y, _, _ = sp["bbox"]
                    result.append({"text": text, "left": x, "top": y, "size": sp.get("size", 0)})
    return result


def rows(items):
    result = []
    for sp in sorted(items, key=lambda s: (s["top"], s["left"])):
        row = next((r for r in reversed(result[-5:]) if abs(r["top"]-sp["top"]) <= 2.8), None)
        if row is None:
            row = {"top": sp["top"], "items": []}
            result.append(row)
        row["items"].append(sp)
    for row in result:
        row["items"].sort(key=lambda s:s["left"])
        row["text"] = " ".join(sp["text"] for sp in row["items"]).strip()
    return sorted(result, key=lambda r:r["top"])


def ingredient(text):
    match = QUANT.match(text.strip())
    if not match:
        return None
    qty, food = match.group("q").strip(), match.group("food").strip()
    if not food:
        return None
    split = SINGLE.fullmatch(qty)
    return {"name": food[:180], "quantity": split.group(1) if split else qty,
            "unit": split.group(2) if split else ""}


def photo(doc, page):
    selected = None
    for entry in page.get_images(full=True):
        xref = entry[0]
        try:
            rectangles = page.get_image_rects(xref)
        except (RuntimeError, ValueError):
            continue
        for rect in rectangles:
            if rect.x0 < page.rect.width*.48 or not 85 < rect.y0 < page.rect.height*.67:
                continue
            if rect.width < 90 or rect.height < 80:
                continue
            score = rect.get_area()*(1.4 if rect.y0 < page.rect.height*.36 else 1)
            if selected is None or score > selected[0]:
                selected = (score, xref)
    if selected is None:
        return None
    try:
        raw = doc.extract_image(selected[1])["image"]
        with Image.open(io.BytesIO(raw)) as image:
            if image.width*image.height > 12000000:
                return None
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((850,850))
            for quality in (78,65,52):
                output = io.BytesIO()
                image.save(output,format="WEBP",quality=quality,method=4)
                if output.tell() <= MAX_PHOTO_BYTES:
                    return base64.b64encode(output.getvalue()).decode("ascii")
    except (OSError,ValueError,RuntimeError):
        return None
    return None


def parse_page(doc, index):
    page = doc[index]
    items = spans(page)
    ingredient_lines = [sp["top"] for sp in items if ING.match(sp["text"])]
    prep_lines = [sp["top"] for sp in items if PREP.match(sp["text"])]
    if not ingredient_lines or not prep_lines:
        return None, "Página sem estrutura de receita reconhecível"
    y_ingredients = min(ingredient_lines)
    y_prep = next((y for y in sorted(prep_lines) if y > y_ingredients), None)
    if y_prep is None:
        return None, "Estrutura da página ambígua"
    titles = sorted(
        (sp for sp in items if 12.6 <= sp["size"] <= 30 and sp["left"] < page.rect.width*.58
         and 40 <= sp["top"] < y_ingredients-6 and len(sp["text"]) >= 6
         and normal(sp["text"]) not in BAD_TITLES and not sp["text"].isdigit()),
        key=lambda sp:(-sp["size"],sp["top"]))
    if not titles:
        return None,"Título da receita não identificado"
    if len(titles)>1 and titles[1]["size"] >= titles[0]["size"]-1.2:
        return None,"Vários títulos detetados; rever página"
    name=titles[0]["text"][:180]
    ing_region = [sp for sp in items if y_ingredients+6 < sp["top"] < y_prep-6
                  and sp["left"] < page.rect.width*.57 and 9.3 <= sp["size"] <= 13]
    sections=[{"title":"","ingredients":[]}]
    for row in rows(ing_region):
        txt=row["text"]
        if BLOCK.fullmatch(txt):
            sections.append({"title":txt.rstrip(":"),"ingredients":[]})
        else:
            value=ingredient(txt)
            if value:
                sections[-1]["ingredients"].append(value)
    sections=[sec for sec in sections if sec["ingredients"]]
    step_region=[sp for sp in items if y_prep+6 < sp["top"] < page.rect.height-43
                 and sp["size"] >= 9.1 and sp["left"] < page.rect.width-30]
    steps=[]; notes=[]; in_notes=False
    for row in rows(step_region):
        txt=row["text"]
        if not in_notes:
            marker=TIPS_END.search(normal(txt))
            if marker:
                preceding=txt[:marker.start()].strip()
                # Canva sometimes places "Dicas úteis" on the same line as
                # the final preparation step. Keep that step and separate tips.
                if not preceding or preceding.endswith((".", "!", "?", ":")):
                    if preceding:
                        final_step=STEP.match(preceding)
                        if final_step and final_step.group(2).strip():
                            steps.append(final_step.group(2).strip())
                        elif steps and len(preceding)>5:
                            steps[-1]+=" "+preceding
                    in_notes=True
                    continue
        match=STEP.match(txt)
        if in_notes:
            if match and match.group(2).strip():
                notes.append(match.group(2).strip())
            elif notes and len(txt)>5:
                notes[-1]+=" "+txt
            elif len(txt)>5:
                notes.append(txt)
        elif match:
            steps.append(match.group(2).strip())
        elif steps and len(txt)>5:
            steps[-1]+=" "+txt
    steps=[st[:2000] for st in steps if st]
    notes_text="\n".join(note.strip() for note in notes if note.strip())[:6000]
    if not steps and not sections:
        return None,"Ingredientes e preparação não reconhecidos"
    warnings=[]
    if not sections: warnings.append("Ingredientes não identificados")
    if not steps: warnings.append("Preparação não identificada")
    if any("/" in i["quantity"] for sec in sections for i in sec["ingredients"]):
        warnings.append("Confirmar manualmente as quantidades compostas")
    if any(GRAMS_IN_STEPS.search(st) for st in steps):
        warnings.append("Procedimentos contêm gramagens; rever se a receita for adaptável")
    image=photo(doc,page)
    if not image: warnings.append("Fotografia não identificada")
    return {"page":index+1,"name":name,"sections":sections,"steps":steps,
            "notes":notes_text,"servings":1,"photo_webp":image,"warnings":warnings},None


def preview_pdf(raw,filename):
    if not isinstance(raw,bytes) or not raw.startswith(b"%PDF-") or len(raw)>MAX_PDF_BYTES:
        raise ValueError("invalid_pdf")
    try:
        with fitz.open(stream=raw,filetype="pdf") as doc:
            if doc.needs_pass: raise ValueError("encrypted_pdf")
            if len(doc)>MAX_PAGES: raise ValueError("too_many_pages")
            recipes=[];skipped=[]
            for index in range(len(doc)):
                try:
                    candidate,reason=parse_page(doc,index)
                except (ValueError,RuntimeError,UnicodeError):
                    candidate,reason=None,"Não foi possível interpretar esta página"
                if candidate: recipes.append(candidate)
                else: skipped.append({"page":index+1,"reason":reason})
            if len(recipes)>40: raise ValueError("too_many_recipes")
            return {"filename":str(filename)[:180],"total_pages":len(doc),"recipes":recipes,
                    "skipped_pages":skipped}
    except (fitz.FileDataError,fitz.EmptyFileError,fitz.FileNotFoundError):
        raise ValueError("invalid_pdf") from None


def commit_drafts(c, category_id, filename, entries, store_image):
    """Validate every reviewed draft and cross-recipe link before any write."""
    import recipe_library_v2

    if not isinstance(category_id, str) or not c.execute(
            "SELECT id FROM v2_recipe_categories WHERE id=?", (category_id,)).fetchone():
        raise ValueError("invalid_recipe_category")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 12:
        raise ValueError("invalid_recipe_import")
    if not isinstance(filename, str) or not filename.strip():
        raise ValueError("invalid_recipe_import")
    filename = " ".join(filename.strip().split())[:180]
    existing = {normal(r["name"]) for r in c.execute(
        "SELECT name FROM v2_recipe_library WHERE category_id=?", (category_id,)).fetchall()}
    created = []
    skipped = []
    now = int(time.time())
    candidates = []
    page_ids = {}

    # First pass allocates stable IDs, including for recipes appearing later
    # in the document. Duplicate/unchecked pages cannot be link targets.
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("invalid_recipe_import")
        name, page = entry.get("name", ""), entry.get("page")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 180:
            raise ValueError("invalid_recipe_import")
        if isinstance(page, bool) or not isinstance(page, int) or not 1 <= page <= MAX_PAGES:
            raise ValueError("invalid_recipe_import")
        if page in page_ids or any(other["page"] == page for other in candidates):
            raise ValueError("invalid_recipe_import")
        if normal(name) in existing:
            skipped.append({"name": name, "reason": "duplicate_name"})
            continue
        rid = secrets.token_hex(12)
        candidates.append({"id": rid, "entry": entry, "page": page})
        page_ids[page] = rid
        existing.add(normal(name))

    prepared = []
    replacements = {}
    for item in candidates:
        entry = item["entry"]
        sections = entry.get("sections", [])
        if not isinstance(sections, list):
            raise ValueError("invalid_recipe_import")
        # Do not mutate the submitted preview while resolving page references.
        sections = json.loads(json.dumps(sections))
        for section in sections:
            if not isinstance(section, dict):
                raise ValueError("invalid_recipe_import")
            ingredients = section.get("ingredients", [])
            if not isinstance(ingredients, list):
                raise ValueError("invalid_recipe_import")
            for ingredient in ingredients:
                if not isinstance(ingredient, dict):
                    raise ValueError("invalid_recipe_import")
                page = ingredient.pop("recipe_ref_page", None)
                if page is not None:
                    if isinstance(page, bool) or not isinstance(page, int) or page not in page_ids:
                        raise ValueError("invalid_recipe_reference")
                    if ingredient.get("recipe_ref_id"):
                        raise ValueError("invalid_recipe_reference")
                    ingredient["recipe_ref_id"] = page_ids[page]
        fields = recipe_library_v2._validated(c, {
            "category_id": category_id,
            "name": entry["name"],
            "recipe_type": entry.get("recipe_type", "standard"),
            "status": "draft",
            "servings": entry.get("servings", 1),
            "sections": sections,
            "steps": entry.get("steps", []),
            "notes": entry.get("notes", "")
        }, allow_ref_ids=page_ids.values())
        replacements[item["id"]] = json.loads(fields[5])
        image_b64 = entry.get("photo_webp")
        data = None
        if image_b64:
            if not isinstance(image_b64, str) or len(image_b64) > 250000:
                raise ValueError("invalid_recipe_image")
            try:
                data = base64.b64decode(image_b64, validate=True)
                if not 0 < len(data) <= MAX_PHOTO_BYTES:
                    raise ValueError()
                with Image.open(io.BytesIO(data)) as img:
                    if img.format != "WEBP" or img.width * img.height > 12000000:
                        raise ValueError()
                    img.verify()
            except (OSError, ValueError, base64.binascii.Error):
                raise ValueError("invalid_recipe_image") from None
        prepared.append((item, fields, data))
    recipe_library_v2._assert_reference_graph(c, replacements)

    try:
        for item, fields, data in prepared:
            rid = item["id"]
            photo_key = recipe_library_v2.photo_key(rid) if data else None
            c.execute("""INSERT INTO v2_recipe_library
                (id,category_id,name,recipe_type,status,servings,sections_json,steps_json,notes,
                 photo_key,source_document,source_page,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (rid, *fields, photo_key, filename, item["page"], now, now))
            if data:
                store_image(c, photo_key, data)
            created.append({"id": rid, "name":item["entry"]["name"].strip(), "page":item["page"]})
        c.commit()
    except Exception:
        c.rollback()
        raise
    return {"created": created, "skipped": skipped}
