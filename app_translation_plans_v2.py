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
          AND field_path LIKE ?
    """, ("meals/%/options/%/title",)).fetchall():
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



# Shared plan text is strictly limited to visible option titles and
# unambiguous presentation units. Alternative labels, notes, free-text
# quantities and prescription labels never enter this cross-plan queue.
_COMMON_KINDS = {"option_title", "display_quantity"}
MAX_COMMON_BATCH = 100


def _group_identity(field, plan):
    kind = field["field_kind"]
    if kind not in _COMMON_KINDS:
        return None
    if kind == "display_quantity" and _quantity_hint(field["source_text"]) is None:
        return None
    context = ""
    if kind == "option_title":
        match = re.match(r"^meals/(\d+)/options/\d+/title$", field["field_path"])
        if match is None:
            return None
        meal_index = int(match.group(1))
        try:
            context = str(plan["meals"][meal_index].get("name") or "").strip()
        except (IndexError, TypeError, AttributeError):
            return None
        if not context:
            return None
    key = _hash(kind + "\0" + context + "\0" + field["source_text"])
    return key, kind, context


def _common_groups(c):
    """Admin-only, contextual groups. No athlete identifiers in the response."""
    rows = _rows(c)
    names = _name_map(c)
    approved = _approved_titles(c)
    groups = {}
    for publication in rows:
        try:
            plan = json.loads(publication["snapshot_json"])
        except (ValueError, TypeError):
            continue
        if not isinstance(plan, dict) or not isinstance(plan.get("meals"), list):
            continue
        publication_ref = _ref(publication["draft_id"], publication["snapshot_json"])
        fields, _, _ = _fields(plan, names)
        existing = _existing(c, publication_ref)
        for field in fields:
            identity = _group_identity(field, plan)
            if identity is None:
                continue
            key, kind, context = identity
            group = groups.setdefault(key, {
                "group_id": key, "field_kind":kind, "meal_context":context,
                "source_hash":_hash(field["source_text"]),
                "source_text":field["source_text"], "total":0,
                "missing":[], "pending_count":0, "approved_count":0,
                "outdated_count":0, "suggestion":None,
            })
            group["total"] += 1
            state = _status(field, existing.get(field["field_path"]))
            if state == "missing":
                group["missing"].append({
                    "publication_ref":publication_ref,
                    "draft_id":publication["draft_id"],
                    "field_path":field["field_path"],
                    "source_hash":_hash(field["source_text"]),
                })
            else:
                group[state + "_count"] += 1
            if group["suggestion"] is None:
                group["suggestion"] = _safe_suggestion(field, approved)
    return groups



def _common_stage_map(c):
    return {str(r["entity_id"]):r for r in c.execute("""
        SELECT entity_id,source_hash,translated_text,status
        FROM v2_content_translations
        WHERE entity_kind='plan_common' AND field_path='text' AND language='en'
    """).fetchall()}


def _csv_eligible(group):
    # No snapshots, players, prescriptions, notes or alternatives are exported.
    # Shared titles require at least two identical occurrences; ordinary
    # presentation units can be exported even when they occur only once.
    return (group["field_kind"] == "display_quantity" or
            (group["field_kind"] == "option_title" and group["total"] >= 2))


def _missing_stamp(targets):
    return _hash(json.dumps(
        [(r["publication_ref"],r["field_path"],r["source_hash"])
         for r in targets], separators=(",", ":"), ensure_ascii=False))


def common_preview(c, actor):
    admin._admin(c, actor)
    groups = _common_groups(c)
    stages = _common_stage_map(c)
    items = []
    for group in groups.values():
        targets = sorted(group["missing"],
                         key=lambda r:(r["publication_ref"],r["field_path"]))
        if not targets:
            continue
        stamp = _missing_stamp(targets)
        stage = stages.get(group["group_id"])
        if stage is not None and stage["source_hash"] != group["source_hash"]:
            stage = None
        items.append({
            "group_id":group["group_id"], "field_kind":group["field_kind"],
            "meal_context":group["meal_context"],
            "source_hash":group["source_hash"],
            "source_text":group["source_text"],
            "occurrences":group["total"], "missing_count":len(targets),
            "pending_count":group["pending_count"],
            "approved_count":group["approved_count"],
            "outdated_count":group["outdated_count"],
            "expected_group_hash":stamp,
            "suggestion":group["suggestion"], "batch_limit":MAX_COMMON_BATCH,
            "csv_eligible":_csv_eligible(group),
            "imported_status":stage["status"] if stage else None,
            "imported_text":stage["translated_text"] if stage else None,
            "expected_stage_hash":_hash(stage["translated_text"]) if stage else "",
        })
    items.sort(key=lambda item:(-item["missing_count"],
                                item["field_kind"],item["source_text"].casefold()))
    return {"items":items, "total_groups":len(items),
            "policy":"admin_private_identical_text_same_meal_no_clinical_auto",
            "max_batch":MAX_COMMON_BATCH}



def import_common(c, actor, body):
    """Store up to 100 CSV proposals as plan_common, not as plan approvals.

    Data are limited to grouped generic titles and simple presentation units.
    Nothing writes into athlete plans or approves any position during import.
    """
    actor_id = admin._admin(c, actor)
    if (not isinstance(body, dict) or set(body) != {"rows"} or
            not isinstance(body["rows"], list) or not 1 <= len(body["rows"]) <= 100):
        raise PlanTranslationError(400, "invalid_common_import")
    groups = _common_groups(c)
    stages = _common_stage_map(c)
    pending = []
    seen = set()
    skipped = 0
    for row in body["rows"]:
        expected = {"group_id","source_hash","expected_group_hash",
                    "expected_stage_hash","translated_text"}
        if not isinstance(row, dict) or set(row) != expected:
            raise PlanTranslationError(400, "invalid_common_import")
        group_id = row.get("group_id")
        if not isinstance(group_id, str) or not _REF.fullmatch(group_id) or group_id in seen:
            raise PlanTranslationError(400, "invalid_common_import")
        seen.add(group_id)
        group = groups.get(group_id)
        if group is None or not _csv_eligible(group):
            raise PlanTranslationError(409, "common_import_group_changed")
        if row.get("source_hash") != group["source_hash"]:
            raise PlanTranslationError(409, "common_import_source_changed")
        targets = sorted(group["missing"],
                         key=lambda item:(item["publication_ref"], item["field_path"]))
        if not targets or row.get("expected_group_hash") != _missing_stamp(targets):
            raise PlanTranslationError(409, "common_import_group_changed")
        stage = stages.get(group_id)
        if stage is not None and stage["source_hash"] != group["source_hash"]:
            raise PlanTranslationError(409, "common_import_source_changed")
        stage_hash = _hash(stage["translated_text"]) if stage else ""
        if row.get("expected_stage_hash") != stage_hash:
            raise PlanTranslationError(409, "common_import_proposal_changed")
        translated = row.get("translated_text")
        if not isinstance(translated, str) or not 1 <= len(translated.strip()) <= 10000:
            raise PlanTranslationError(400, "invalid_common_translation")
        translated = translated.strip()
        if _numbers(translated) != _numbers(group["source_text"]):
            raise PlanTranslationError(400, "plan_translation_numbers_changed")
        if _units(translated) != _units(group["source_text"]):
            raise PlanTranslationError(400, "plan_translation_units_changed")
        if stage is not None and stage["status"] == "approved" and translated != stage["translated_text"]:
            raise PlanTranslationError(409, "common_import_approved_locked")
        if stage is not None and translated == stage["translated_text"]:
            skipped += 1
            continue
        pending.append((group_id, group["source_text"], translated))
    try:
        for group_id, original, translated in pending:
            store.submit(c, entity_kind="plan_common", entity_id=group_id,
                         field_path="text", source_text=original,
                         translated_text=translated, actor_id=actor_id)
    except Exception:
        c.rollback()
        raise
    return {"imported":len(pending), "unchanged":skipped,
            "status":"pending", "approved":0}


def approve_common(c, actor, body):
    """One explicit review of identical source+context approves <=100 positions.

    Pre-existing pending/approved/outdated rows are never overwritten.
    All newly created submissions and approvals share the same transaction.
    The WSGI caller commits only after a successful response.
    """
    actor_id = admin._admin(c, actor)
    expected = {"group_id", "source_hash", "expected_group_hash",
                "translated_text", "acknowledged"}
    if (not isinstance(body, dict) or set(body) != expected
            or body.get("acknowledged") is not True
            or not isinstance(body.get("group_id"), str)
            or not _REF.fullmatch(body["group_id"])
            or not isinstance(body.get("source_hash"), str)
            or not _REF.fullmatch(body["source_hash"])
            or not isinstance(body.get("expected_group_hash"), str)
            or not _REF.fullmatch(body["expected_group_hash"])
            or not isinstance(body.get("translated_text"), str)
            or not 1 <= len(body["translated_text"].strip()) <= 10000):
        raise PlanTranslationError(400,"invalid_common_review")
    groups = _common_groups(c)
    group = groups.get(body["group_id"])
    if group is None or group["source_hash"] != body["source_hash"]:
        raise PlanTranslationError(409,"common_translation_changed")
    targets = sorted(group["missing"],
                     key=lambda r:(r["publication_ref"],r["field_path"]))
    stamp = _hash(json.dumps(
        [(r["publication_ref"],r["field_path"],r["source_hash"])
         for r in targets], separators=(",", ":"), ensure_ascii=False))
    if not targets or stamp != body["expected_group_hash"]:
        raise PlanTranslationError(409,"common_translation_changed")
    candidate = body["translated_text"].strip()
    stage = _common_stage_map(c).get(group["group_id"])
    if stage is not None:
        if (stage["source_hash"] != group["source_hash"]
                or stage["translated_text"] != candidate):
            raise PlanTranslationError(409,"common_import_proposal_changed")
    source = group["source_text"]
    if _numbers(candidate) != _numbers(source):
        raise PlanTranslationError(400,"plan_translation_numbers_changed")
    if _units(candidate) != _units(source):
        raise PlanTranslationError(400,"plan_translation_units_changed")
    try:
        if stage is not None and stage["status"] == "pending":
            store.approve(c, entity_kind="plan_common",entity_id=group["group_id"],
                          field_path="text",source_text=source,reviewer_id=actor_id,
                          expected_candidate_hash=_hash(candidate))
        for target in targets[:MAX_COMMON_BATCH]:
            # Fail closed if this publication was replaced after preview.
            field = _source(c,target["publication_ref"],target["field_path"])
            if (field["field_kind"] != group["field_kind"] or
                    _hash(field["source_text"]) != group["source_hash"]):
                raise PlanTranslationError(409,"common_translation_changed")
            # Conditional insert prevents replacing an approval or pending
            # translation created concurrently by another administrator.
            key = ("plan", "pub:" + target["publication_ref"],
                   target["field_path"], "en")
            import time
            now = int(time.time())
            inserted = c.execute("""
                INSERT INTO v2_content_translations
                    (entity_kind,entity_id,field_path,language,source_hash,
                     translated_text,status,updated_at,updated_by,approved_at,approved_by)
                VALUES (?,?,?,?,?,?,'pending',?,?,NULL,NULL)
                ON CONFLICT (entity_kind,entity_id,field_path,language) DO NOTHING
                RETURNING entity_id
            """, (*key, target["source_hash"], candidate, now, actor_id)).fetchone()
            if inserted is None:
                raise PlanTranslationError(409,"common_translation_changed")
            store._history(c,key,target["source_hash"],candidate,
                           "submitted",actor_id,now)
            store.approve(c, entity_kind="plan",entity_id=key[1],
                          field_path=key[2],source_text=field["source_text"],
                          reviewer_id=actor_id,
                          expected_candidate_hash=_hash(candidate))
    except (PlanTranslationError,ValueError,LookupError,PermissionError):
        c.rollback()
        raise
    except Exception:
        c.rollback()
        raise PlanTranslationError(503,"common_translation_unavailable") from None
    return {"approved":min(len(targets),MAX_COMMON_BATCH),
            "remaining":max(0,len(targets)-MAX_COMMON_BATCH),
            "status":"approved", "group_id":body["group_id"]}



def history(c, actor, public_ref, field_path):
    admin._admin(c, actor)
    if not isinstance(field_path, str) or not _PATH.fullmatch(field_path):
        raise PlanTranslationError(400, "invalid_plan_translation_field")
    _source(c, public_ref, field_path)
    return {"history":store.history(c, entity_kind="plan", entity_id="pub:" + public_ref,
                                   field_path=field_path, limit=50)}
