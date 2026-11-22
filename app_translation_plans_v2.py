"""Version-bound, private review of published meal-plan display text.

Never exports whole snapshots, athlete identifiers, clinical records or free-text
notes to third-party services. Never mutates published plans or their nutrition.
The separate admin HTTP boundary enforces session, origin and CSRF.
"""
import hashlib
import json
import re
from collections import Counter

import app_translation_admin_v2 as admin
import content_translations_v2 as store

_REF = re.compile(r"^[a-f0-9]{64}$")
_PATH = re.compile(r"^meals/[0-9]{1,3}/options/[0-9]{1,3}/(?:title|notes/[0-9]{1,3}|foods/[0-9]{1,3}/(?:display_name|display_quantity|label))$")
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_UNIT = re.compile(r"(?<![A-Za-z])(?:kg|mg|mcg|µg|g|ml|l|kcal)\b|%",re.I)
MAX_PUBLICATIONS = 2000
MAX_FIELDS = 4000
# Only unambiguous unit-only display quantities qualify for a suggested rendering.
_PIECE_QUANTITY = re.compile(r"^(\d+(?:[.,]\d+)?)\s*(?:un\.?|unid\.?|unidades?)\s*(?:/\s*(\d+(?:[.,]\d+)?)\s*(g|mg|ml|kg))?$", re.I)


class PlanTranslationError(Exception):
    def __init__(self, status, code):
        self.status = status
        self.code = code
        super().__init__(code)


def _hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _ref(draft_id, raw):
    return _hash(str(draft_id) + "\0" + raw)


def _rows(c):
    rows = c.execute("""SELECT draft_id, plan_type, snapshot_json, published_at, state
        FROM v2_food_plan_editor_publications WHERE state IN ('published','transitional')
        ORDER BY plan_type, draft_id""").fetchall()
    if len(rows) > MAX_PUBLICATIONS:
        raise PlanTranslationError(413, "plan_translation_publication_limit")
    return rows


def _load(c, public_ref):
    if not isinstance(public_ref, str) or not _REF.fullmatch(public_ref):
        raise PlanTranslationError(400, "invalid_plan_publication")
    for row in _rows(c):
        if _ref(row["draft_id"], row["snapshot_json"]) == public_ref:
            try:
                value = json.loads(row["snapshot_json"])
            except (TypeError, ValueError):
                raise PlanTranslationError(409, "invalid_published_snapshot") from None
            if not isinstance(value, dict) or not isinstance(value.get("meals"), list):
                raise PlanTranslationError(409, "invalid_published_snapshot")
            return row, value
    raise PlanTranslationError(409, "plan_publication_changed")


def _name_map(c):
    return {str(row["id"]): str(row["display_name"])
            for row in c.execute("""SELECT id,display_name FROM v2_food_library
                                      WHERE active=1""").fetchall()}


def _fields(plan, food_names):
    fields = []
    linked = 0
    deferred = 0

    def add(path, text, label, group, sensitive, field_kind):
        if not isinstance(text, str) or not text.strip():
            return
        fields.append({"field_path":path, "source_text":text.strip(),
                       "field_label":label, "group":group,
                       "field_kind":field_kind,
                       "sensitive":bool(sensitive)})
        if len(fields) > MAX_FIELDS:
            raise PlanTranslationError(413, "plan_translation_field_limit")

    for mi, meal in enumerate(plan.get("meals") or []):
        if not isinstance(meal, dict):
            continue
        meal_label = str(meal.get("name") or "Refeição")[:120]
        for oi, option in enumerate(meal.get("options") or []):
            if not isinstance(option, dict):
                continue
            prefix = f"meals/{mi}/options/{oi}"
            group = f"{meal_label} · Opção {oi + 1}"
            add(prefix + "/title", option.get("title"),
                "Título da opção", group, False, "option_title")
            for ni, note in enumerate(option.get("notes") or []):
                add(prefix + f"/notes/{ni}", note,
                    f"Nota clínica ou individual · {ni + 1}", group, True,
                    "individual_note")
            for fi, food in enumerate(option.get("foods") or []):
                if not isinstance(food, dict):
                    continue
                fpath = prefix + f"/foods/{fi}"
                if food.get("kind", "food") == "supplement":
                    add(fpath + "/label", food.get("label"),
                        f"Suplemento · texto {fi + 1}", group, True,
                        "supplement_label")
                else:
                    fid = str(food.get("id") or "")
                    text = food.get("display_name")
                    canon = food_names.get(fid)
                    if canon is not None and (
                            not isinstance(text, str) or not text.strip() or
                            text.strip() == canon.strip()):
                        linked += 1
                    if isinstance(text, str) and text.strip() and (
                            not canon or text.strip() != canon.strip()):
                        alternative = food.get("alternative_to") is not None
                        add(fpath + "/display_name", text,
                            (f"Alternativa personalizada · {fi + 1}" if alternative
                             else f"Apresentação personalizada · {fi + 1}"),
                            group, True,
                            "alternative_override" if alternative else "food_override")
                qty = food.get("display_quantity")
                if isinstance(qty, str) and qty.strip():
                    add(fpath + "/display_quantity", qty,
                        f"Quantidade apresentada · {fi + 1}", group, True,
                        "display_quantity")
    return fields, linked, deferred


def _existing(c, public_ref):
    return {r["field_path"]:r for r in c.execute("""
        SELECT field_path,source_hash,translated_text,status
        FROM v2_content_translations
        WHERE entity_kind='plan' AND entity_id=? AND language='en'
    """, ("pub:" + public_ref,)).fetchall()}


def _approved_titles(c):
    """Exact approved plan titles only; conflicting English versions are unusable.

    No notes, clinical text or custom food overrides enter this dictionary.
    This is read-only and never republishes a candidate automatically.
    """
    found = {}
    for row in c.execute("""
        SELECT field_path, source_hash, translated_text
        FROM v2_content_translations
        WHERE entity_kind='plan' AND language='en' AND status='approved'
          AND field_path LIKE 'meals/%/options/%/title'
    """).fetchall():
        if not _PATH.fullmatch(row["field_path"]) or not row["field_path"].endswith("/title"):
            continue
        found.setdefault(row["source_hash"], set()).add(row["translated_text"])
    return {source_hash: next(iter(values)) for source_hash, values in found.items()
            if len(values) == 1}


def _quantity_hint(source):
    """Suggest only a structurally simple unit label (not a dose or clinical note)."""
    match = _PIECE_QUANTITY.fullmatch(source)
    if match is None:
        return None
    number, weight, unit = match.groups()
    suggestion = number + " units"
    if weight:
        suggestion += " / " + weight + " " + unit
    return suggestion if suggestion != source else None


def _safe_suggestion(field, approved_titles):
    source = field["source_text"]
    if field["field_kind"] == "option_title":
        candidate = approved_titles.get(_hash(source))
        origin = "approved_exact_title"
    elif field["field_kind"] == "display_quantity":
        candidate = _quantity_hint(source)
        origin = "simple_unit_rule"
    else:
        return None
    if (not candidate or _numbers(source) != _numbers(candidate)
            or _units(source) != _units(candidate)):
        return None
    return {"text": candidate, "origin": origin, "requires_review": True}


def _reuse_audit(c, items, published):
    """Anonymous counts only; no patient names, source text or plan snapshots."""
    titles = Counter()
    kinds = Counter()
    eligible_title_hints = 0
    eligible_unit_hints = 0
    approved_library = {}
    for row in c.execute("""
        SELECT entity_id,source_hash FROM v2_content_translations
        WHERE entity_kind='food' AND field_path='display_name'
          AND language='en' AND status='approved'
    """).fetchall():
        approved_library[str(row["entity_id"])] = row["source_hash"]
    food_names = _name_map(c)
    accepted_titles = _approved_titles(c)
    approved_linked = 0
    for row in published:
        try:
            snapshot = json.loads(row["snapshot_json"])
        except (TypeError, ValueError):
            continue
        if not isinstance(snapshot, dict):
            continue
        fields, _, _ = _fields(snapshot, food_names)
        ref = _ref(row["draft_id"], row["snapshot_json"])
        states = _existing(c, ref)
        for field in fields:
            kind = field["field_kind"]
            kinds[kind] += 1
            if kind == "option_title":
                titles[field["source_text"]] += 1
            if _status(field, states.get(field["field_path"])) != "missing":
                continue
            suggestion = _safe_suggestion(field, accepted_titles)
            if suggestion and suggestion["origin"] == "approved_exact_title":
                eligible_title_hints += 1
            if suggestion and suggestion["origin"] == "simple_unit_rule":
                eligible_unit_hints += 1
        for meal in snapshot.get("meals") or []:
            if not isinstance(meal, dict):
                continue
            for option in meal.get("options") or []:
                if not isinstance(option, dict):
                    continue
                for food in option.get("foods") or []:
                    if not isinstance(food, dict) or food.get("kind", "food") != "food":
                        continue
                    fid = str(food.get("id") or "")
                    canonical = food_names.get(fid)
                    override = food.get("display_name")
                    if (canonical is not None
                            and (not isinstance(override, str) or not override.strip()
                                 or override.strip() == canonical.strip())
                            and approved_library.get(fid) == _hash(canonical)):
                        approved_linked += 1
    return {
        "published_versions": len(items),
        "visible_text_fields": sum(item["field_count"] for item in items),
        "linked_food_references": sum(item["linked_food_count"] for item in items),
        "approved_library_food_references": approved_linked,
        "option_title_occurrences": sum(titles.values()),
        "distinct_option_titles": len(titles),
        "repeated_option_title_occurrences": sum(count-1 for count in titles.values()),
        "approved_title_suggestions": eligible_title_hints,
        "simple_unit_suggestions": eligible_unit_hints,
        "alternative_overrides": kinds["alternative_override"],
        "other_food_overrides": kinds["food_override"],
        "individual_notes": kinds["individual_note"],
        "supplement_labels": kinds["supplement_label"],
        "display_quantities": kinds["display_quantity"],
        "policy": "counts_only_no_auto_match_no_auto_approval"
    }


def _status(field, row):
    if row is None:
        return "missing"
    if row["source_hash"] != _hash(field["source_text"]):
        return "outdated"
    return row["status"] if row["status"] in ("pending", "approved") else "missing"


def _summary(c, row, value, names):
    public_ref = _ref(row["draft_id"], row["snapshot_json"])
    fields, linked, _ = _fields(value, names)
    existing = _existing(c, public_ref)
    status = {"missing":0, "pending":0, "approved":0, "outdated":0}
    for f in fields:
        status[_status(f, existing.get(f["field_path"]))] += 1
    return {
        "publication_ref":public_ref, "plan_type":str(row["plan_type"]),
        # Shown only to authenticated admins; never written to export or URL.
        "player_label":str(value.get("player_name") or ""),
        "state":str(row["state"]), "published_at":int(row["published_at"]),
        "field_count":len(fields), "linked_food_count":linked,
        "statuses":status
    }


def list_publications(c, actor):
    admin._admin(c, actor)
    names = _name_map(c)
    items = []
    rows = _rows(c)
    for row in rows:
        try:
            value = json.loads(row["snapshot_json"])
            if not isinstance(value, dict):
                continue
            items.append(_summary(c, row, value, names))
        except (TypeError, ValueError):
            continue
    return {"language":"en", "items":items, "total":len(items),
            "reuse_audit":_reuse_audit(c,items,rows),
            "scope":"published_versions_only", "csv_export":False}


def inspect(c, actor, public_ref):
    admin._admin(c, actor)
    row, value = _load(c, public_ref)
    fields, linked, _ = _fields(value, _name_map(c))
    existing = _existing(c, public_ref)
    approved_titles = _approved_titles(c)
    displayed = []
    for f in fields:
        candidate = existing.get(f["field_path"])
        state = _status(f, candidate)
        displayed.append({**f, "status":state,
                          "source_hash":_hash(f["source_text"]),
                          "translated_text":candidate["translated_text"] if candidate else "",
                          "candidate_hash":_hash(candidate["translated_text"]) if candidate else None,
                          "suggestion":_safe_suggestion(f, approved_titles)
                                       if state == "missing" else None})
    return {"publication":_summary(c,row,value,_name_map(c)),
            "fields":displayed,
            "policy":"manual_private_review_no_csv_no_external_api",
            "linked_food_count":linked}


def _check_body(body, keys):
    if not isinstance(body, dict) or set(body) != set(keys):
        raise PlanTranslationError(400, "invalid_plan_translation_payload")
    public_ref, field_path = body.get("publication_ref"), body.get("field_path")
    if (not isinstance(public_ref, str) or not _REF.fullmatch(public_ref) or
            not isinstance(field_path, str) or not _PATH.fullmatch(field_path)):
        raise PlanTranslationError(400, "invalid_plan_translation_field")
    return public_ref, field_path


def _source(c, public_ref, field_path):
    _, plan = _load(c, public_ref)
    fields, _, _ = _fields(plan, _name_map(c))
    field = next((f for f in fields if f["field_path"] == field_path), None)
    if field is None:
        raise PlanTranslationError(400, "invalid_plan_translation_field")
    return field


def _numbers(text):
    return [_n.replace(",", ".") for _n in _NUMBER.findall(text)]


def _units(text):
    return sorted(m.group().lower() for m in _UNIT.finditer(text))


def propose(c, actor, body):
    actor_id = admin._admin(c, actor)
    public_ref, field_path = _check_body(body, (
        "publication_ref", "field_path", "expected_source_hash", "translated_text"))
    field = _source(c, public_ref, field_path)
    translated = body["translated_text"]
    if (body["expected_source_hash"] != _hash(field["source_text"])
            or not isinstance(translated, str) or not translated.strip()):
        raise PlanTranslationError(409, "plan_translation_source_changed")
    if _numbers(field["source_text"]) != _numbers(translated):
        raise PlanTranslationError(400, "plan_translation_numbers_changed")
    if _units(field["source_text"]) != _units(translated):
        raise PlanTranslationError(400, "plan_translation_units_changed")
    result = store.submit(c, entity_kind="plan", entity_id="pub:" + public_ref,
                          field_path=field_path, source_text=field["source_text"],
                          translated_text=translated, actor_id=actor_id)
    return {**result, "publication_ref":public_ref, "field_path":field_path}


def approve(c, actor, body):
    actor_id = admin._admin(c, actor)
    public_ref, field_path = _check_body(body, (
        "publication_ref", "field_path",
        "expected_source_hash", "expected_candidate_hash"))
    field = _source(c, public_ref, field_path)
    if body["expected_source_hash"] != _hash(field["source_text"]):
        raise PlanTranslationError(409, "plan_translation_source_changed")
    result = store.approve(c, entity_kind="plan", entity_id="pub:" + public_ref,
                           field_path=field_path, source_text=field["source_text"],
                           reviewer_id=actor_id,
                           expected_candidate_hash=body["expected_candidate_hash"])
    return {**result, "publication_ref":public_ref, "field_path":field_path}


def history(c, actor, public_ref, field_path):
    admin._admin(c, actor)
    if not isinstance(field_path, str) or not _PATH.fullmatch(field_path):
        raise PlanTranslationError(400, "invalid_plan_translation_field")
    _source(c, public_ref, field_path)
    return {"history":store.history(c, entity_kind="plan", entity_id="pub:" + public_ref,
                                   field_path=field_path, limit=50)}
