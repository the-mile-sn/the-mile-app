"""Backoffice PT/EN catalog: read-only inventory of canonical content.

Only food names/notes and dish names are editable/reviewable in phase 1.
Other libraries appear as coverage *not yet integrated*, never as 0% translated.
The caller supplies an authenticated server-side admin session.
"""
import hashlib
import app_translation_admin_v2 as review

MAX_SCAN = 25000
CATEGORIES = (
    ("food", "Alimentos", True),
    ("dish", "Pratos", True),
    ("recipe", "Receitas", False),
    ("recipe_category", "Categorias de receitas", False),
    ("supplement", "Suplementos", False),
    ("plan", "Planos alimentares publicados", False),
)
STATUSES = frozenset(("missing", "legacy_review", "pending", "approved", "outdated"))

# Only internal constants are interpolated into SQL, never user-provided strings.
FIELDS_SQL = """
  SELECT 'food' AS entity_kind, f.id AS entity_id,
         'display_name' AS field_path, f.display_name AS source_text,
         f.category AS category, '' AS legacy_en,
         t.source_hash, t.translated_text, t.status
    FROM v2_food_library f
    LEFT JOIN v2_content_translations t
      ON t.entity_kind='food' AND t.entity_id=f.id
      AND t.field_path='display_name' AND t.language='en'
   WHERE f.active=1
  UNION ALL
  SELECT 'food', f.id, 'notes', f.notes, f.category, '',
         t.source_hash, t.translated_text, t.status
    FROM v2_food_library f
    LEFT JOIN v2_content_translations t
      ON t.entity_kind='food' AND t.entity_id=f.id
      AND t.field_path='notes' AND t.language='en'
   WHERE f.active=1 AND LENGTH(TRIM(f.notes))>0
  UNION ALL
  SELECT 'dish', d.id, 'name_pt', d.name_pt, d.category,
         COALESCE(d.name_en,''), t.source_hash, t.translated_text, t.status
    FROM v2_dish_library d
    LEFT JOIN v2_content_translations t
      ON t.entity_kind='dish' AND t.entity_id=d.id
      AND t.field_path='name_pt' AND t.language='en'
   WHERE d.active=1
"""


def _admin(c, actor):
    return review._admin(c, actor)


def _digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _status(row):
    if row["source_hash"] is None:
        return "legacy_review" if row["legacy_en"] and row["legacy_en"].strip() else "missing"
    if row["source_hash"] != _digest(row["source_text"]):
        return "outdated"
    return row["status"] if row["status"] in ("approved", "pending") else "missing"


def _entries(c):
    # A single bounded read. Do not report incomplete counts as coverage.
    data = c.execute("SELECT * FROM (" + FIELDS_SQL + ") catalog LIMIT ?",
                     (MAX_SCAN + 1,)).fetchall()
    if len(data) > MAX_SCAN:
        raise ValueError("translation_catalog_scan_limit")
    return data


def _table_exists(c, table):
    # Internal exact name only; never interpolate a client-provided identifier.
    if hasattr(c, "conn"):
        row = c.execute("""SELECT 1 AS found FROM information_schema.tables
            WHERE table_schema=current_schema() AND table_name=?""",
            (table,)).fetchone()
    else:
        row = c.execute(
            "SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name=?",
            (table,)).fetchone()
    return row is not None


def _counts(c):
    # Unintegrated libraries: show real record counts when a source exists;
    # None = unavailable schema, NOT an invented zero.
    sources = (
        ("recipe", "v2_recipe_library", "SELECT COUNT(*) AS n FROM v2_recipe_library WHERE status='published'"),
        ("recipe_category", "v2_recipe_categories", "SELECT COUNT(*) AS n FROM v2_recipe_categories"),
        ("supplement", "v2_supplement_library", "SELECT COUNT(*) AS n FROM v2_supplement_library"),
        ("plan", "v2_food_plan_editor_publications", "SELECT COUNT(*) AS n FROM v2_food_plan_editor_publications"),
    )
    return {kind: int(c.execute(sql).fetchone()["n"]) if _table_exists(c, table)
            else None for kind, table, sql in sources}


def overview(c, actor):
    _admin(c, actor)
    rows = _entries(c)
    extra = _counts(c)
    summaries = []
    for kind, label, integrated in CATEGORIES:
        counts = {name: 0 for name in sorted(STATUSES)}
        if integrated:
            selected = [row for row in rows if row["entity_kind"] == kind]
            for row in selected:
                counts[_status(row)] += 1
            summaries.append({
                "kind": kind, "label": label, "integrated": True,
                "field_count": len(selected),
                "record_count": len({row["entity_id"] for row in selected}),
                "statuses": counts,
            })
        else:
            summaries.append({
                "kind": kind, "label": label, "integrated": False,
                "record_count": extra[kind], "field_count": None,
                "statuses": None,
            })
    statuses = {status: sum(g["statuses"][status] for g in summaries
                            if g["integrated"]) for status in sorted(STATUSES)}
    return {"language": "en", "libraries": summaries, "statuses": statuses,
            "supported_fields": sum(x["field_count"] for x in summaries if x["integrated"]),
            "scope": "current_active_texts_only",
            "legacy_candidates_require_review": True}


def list_fields(c, actor, *, entity_kind="food", status="all",
                query="", page=1, page_size=25):
    _admin(c, actor)
    if entity_kind not in ("food", "dish"):
        raise ValueError("invalid_catalog_library")
    if status != "all" and status not in STATUSES:
        raise ValueError("invalid_catalog_status")
    if not isinstance(query, str) or len(query) > 120:
        raise ValueError("invalid_catalog_query")
    if type(page) is not int or page < 1 or page > 10000:
        raise ValueError("invalid_catalog_page")
    if type(page_size) is not int or page_size < 1 or page_size > 50:
        raise ValueError("invalid_catalog_page_size")
    q = query.strip().casefold()
    entries = []
    for r in _entries(c):
        if r["entity_kind"] != entity_kind:
            continue
        source_text = r["source_text"]
        if q and not any(q in str(r[x] or "").casefold()
                         for x in ("source_text", "category", "legacy_en")):
            continue
        state = _status(r)
        if status != "all" and state != status:
            continue
        # Every row is source-derived; no clinical values or published plans.
        entries.append({
            "entity_kind": r["entity_kind"], "entity_id": r["entity_id"],
            "field_path": r["field_path"], "source_text": source_text,
            "category": r["category"], "state": state,
            "translation_text": r["translated_text"] or "",
            "legacy_candidate": (r["legacy_en"] or "").strip()
                               if state == "legacy_review" else "",
        })
    entries.sort(key=lambda r: (r["source_text"].casefold(), r["entity_id"],
                                r["field_path"]))
    total = len(entries)
    start = (page - 1) * page_size
    return {"language": "en", "library": entity_kind,
            "page": page, "page_size": page_size, "total": total,
            "items": entries[start:start + page_size]}
