"""Controlled recovery of approved EN text for published Planos.

Nothing runs on import, and nothing changes a prescription. Historical approvals
are *suggestions* until a real admin explicitly reviews each field. During an
ordinary republish only unchanged fields from the SAME draft are carried forward,
with the complete option and its meal context checked first.
"""
import json
import re

import app_translation_plans_v2 as plans
import content_translations_v2 as store

MAX_REVIEW = 100
_POSITION = re.compile(r"^meals/(\d+)/options/(\d+)/")


def _candidate(c, field, plan):
    """Unique, approved, source-identical candidate; never a silent approval."""
    source_hash = plans._hash(field["source_text"])
    path = field["field_path"]
    approved = set()
    sources = set()
    rows = c.execute("""
        SELECT translated_text
        FROM v2_content_translations
        WHERE entity_kind='plan' AND field_path=? AND source_hash=?
          AND language='en' AND status='approved'
    """, (path, source_hash)).fetchall()
    for row in rows:
        if isinstance(row["translated_text"], str) and row["translated_text"].strip():
            approved.add(row["translated_text"])
            sources.add("approved_same_path")

    common = plans._group_identity(field, plan)
    if common is not None:
        shared = c.execute("""
            SELECT source_hash,translated_text
            FROM v2_content_translations
            WHERE entity_kind='plan_common' AND entity_id=?
              AND field_path='text' AND language='en' AND status='approved'
        """, (common[0],)).fetchone()
        if (shared and shared["source_hash"] == source_hash
                and isinstance(shared["translated_text"], str)
                and shared["translated_text"].strip()):
            approved.add(shared["translated_text"])
            sources.add("approved_same_context")

    if len(approved) != 1:
        return None, len(approved) > 1
    candidate = next(iter(approved))
    if (plans._numbers(field["source_text"]) != plans._numbers(candidate)
            or plans._units(field["source_text"]) != plans._units(candidate)):
        return None, True
    return {
        "translated_text": candidate,
        "candidate_hash": plans._hash(candidate),
        "origin": "approved_same_context" if "approved_same_context" in sources
                  else "approved_same_path",
    }, False


def preview(c, actor, publication_ref):
    """Private, version-checked recovery inventory, never a data export."""
    plans.admin._admin(c, actor)
    publication, data = plans._load(c, publication_ref)
    fields, _, _ = plans._fields(data, plans._name_map(c))
    current = plans._existing(c, publication_ref)
    candidates = []
    conflicts = 0
    for field in fields:
        if plans._status(field, current.get(field["field_path"])) != "missing":
            continue
        match, conflict = _candidate(c, field, data)
        conflicts += int(conflict)
        if not match:
            continue
        candidates.append({
            "field_path": field["field_path"],
            "group": field["group"],
            "field_label": field["field_label"],
            "field_kind": field["field_kind"],
            "sensitive": field["sensitive"],
            "source_text": field["source_text"],
            "expected_source_hash": plans._hash(field["source_text"]),
            **match,
        })
    return {
        "publication_ref": publication_ref,
        "publication": plans._summary(c, publication, data, plans._name_map(c)),
        "candidates": candidates,
        "conflicts": conflicts,
        "policy": "explicit_admin_field_review_no_automatic_clinical_approval",
    }


def approve_reviewed(c, actor, body):
    """Atomic, explicit review of selected rows, never a broad approval."""
    reviewer = plans.admin._admin(c, actor)
    if (not isinstance(body, dict) or set(body) !=
            {"publication_ref", "rows", "acknowledged"}
            or body["acknowledged"] is not True
            or not isinstance(body["rows"], list)
            or not 1 <= len(body["rows"]) <= MAX_REVIEW):
        raise plans.PlanTranslationError(400, "invalid_plan_recovery")
    publication_ref = body["publication_ref"]
    publication, data = plans._load(c, publication_ref)
    fields, _, _ = plans._fields(data, plans._name_map(c))
    indexed = {f["field_path"]: f for f in fields}
    old = plans._existing(c, publication_ref)
    seen = set()
    entries = []
    for row in body["rows"]:
        required = {"field_path", "expected_source_hash",
                    "expected_candidate_hash", "reviewed"}
        if not isinstance(row, dict) or set(row) != required or row["reviewed"] is not True:
            raise plans.PlanTranslationError(400, "invalid_plan_recovery")
        path = row["field_path"]
        if (not isinstance(path, str) or not plans._PATH.fullmatch(path)
                or path in seen or path not in indexed):
            raise plans.PlanTranslationError(400, "invalid_plan_recovery")
        seen.add(path)
        field = indexed[path]
        if (plans._status(field, old.get(path)) != "missing"
                or row["expected_source_hash"] != plans._hash(field["source_text"])):
            raise plans.PlanTranslationError(409, "plan_recovery_changed")
        match, conflict = _candidate(c, field, data)
        if (conflict or not match or
                row["expected_candidate_hash"] != match["candidate_hash"]):
            raise plans.PlanTranslationError(409, "plan_recovery_changed")
        entries.append((field, match["translated_text"]))

    try:
        for field, translated in entries:
            source_hash = plans._hash(field["source_text"])
            key = ("plan", "pub:" + publication_ref, field["field_path"], "en")
            # Never overwrite a concurrent proposal or approval.
            inserted = c.execute("""
                INSERT INTO v2_content_translations
                    (entity_kind,entity_id,field_path,language,source_hash,
                     translated_text,status,updated_at,updated_by,approved_at,approved_by)
                VALUES (?,?,?,?,?,?,'pending',0,?,NULL,NULL)
                ON CONFLICT (entity_kind,entity_id,field_path,language) DO NOTHING
                RETURNING entity_id
            """, (*key, source_hash, translated, reviewer)).fetchone()
            if inserted is None:
                raise plans.PlanTranslationError(409, "plan_recovery_changed")
            store._history(c, key, source_hash, translated, "submitted", reviewer, 0)
            store.approve(c, entity_kind="plan", entity_id=key[1],
                          field_path=key[2], source_text=field["source_text"],
                          reviewer_id=reviewer,
                          expected_candidate_hash=plans._hash(translated))
    except Exception:
        c.rollback()
        raise
    return {"approved": len(entries), "publication_ref": publication_ref,
            "status": "approved"}


def carry_forward_unchanged(c, draft_id, old_raw, new_raw):
    """Retain a SAME-draft approval only for identical option and context.

    If just a meal label changes, retain only the option title. Never infer or
    revive a clinical note, supplement, or other sensitive text in a new context.
    """
    if old_raw == new_raw:
        return 0
    if not old_raw or not new_raw:
        return 0
    old_data, new_data = json.loads(old_raw), json.loads(new_raw)
    for key in ("athlete_id", "player_id", "plan_type"):
        if old_data.get(key) != new_data.get(key):
            return 0
    old_ref = plans._ref(draft_id, old_raw)
    new_ref = plans._ref(draft_id, new_raw)
    # Probe without raising a SQL error: a failed SELECT aborts PostgreSQL's
    # active publication transaction, even if Python catches the exception.
    if hasattr(c, "conn"):
        exists = c.execute("""SELECT 1 FROM information_schema.tables
            WHERE table_schema=current_schema()
              AND table_name='v2_content_translations'""").fetchone()
    else:
        exists = c.execute("""SELECT 1 FROM sqlite_master
            WHERE type='table' AND name='v2_content_translations'""").fetchone()
    if exists is None:
        return 0
    old_fields, _, _ = plans._fields(old_data, plans._name_map(c))
    new_fields, _, _ = plans._fields(new_data, plans._name_map(c))
    old_map = {f["field_path"]: f for f in old_fields}
    approved = plans._existing(c, old_ref)
    new_approved = plans._existing(c, new_ref)
    count = 0
    for field in new_fields:
        path = field["field_path"]
        old_field = old_map.get(path)
        old_row = approved.get(path)
        if (not old_field or field["source_text"] != old_field["source_text"]
                or not old_row or plans._status(old_field, old_row) != "approved"
                or path in new_approved):
            continue
        position = _POSITION.match(path)
        if position is None:
            continue
        mi, oi = map(int, position.groups())
        try:
            old_meal, new_meal = old_data["meals"][mi], new_data["meals"][mi]
            old_option = old_meal["options"][oi]
            new_option = new_meal["options"][oi]
        except (KeyError, IndexError, TypeError):
            continue
        if old_option != new_option:
            continue
        # Any changed meal metadata may affect clinical meaning, even if the
        # display name stays equal. Only the option title can cross that boundary.
        old_context = {k:v for k,v in old_meal.items() if k != "options"}
        new_context = {k:v for k,v in new_meal.items() if k != "options"}
        if old_context != new_context and field["field_kind"] != "option_title":
            continue
        translated = old_row["translated_text"]
        if (not isinstance(translated, str) or not translated.strip()
                or plans._numbers(field["source_text"]) != plans._numbers(translated)
                or plans._units(field["source_text"]) != plans._units(translated)):
            continue
        key = ("plan", "pub:" + new_ref, path, "en")
        inserted = c.execute("""
            INSERT INTO v2_content_translations
                (entity_kind,entity_id,field_path,language,source_hash,
                 translated_text,status,updated_at,updated_by,approved_at,approved_by)
            VALUES (?,?,?,?,?,?,'pending',0,'publication-carry-forward',NULL,NULL)
            ON CONFLICT (entity_kind,entity_id,field_path,language) DO NOTHING
            RETURNING entity_id
        """, (*key, plans._hash(field["source_text"]), translated)).fetchone()
        if inserted is None:
            continue
        store._history(c, key, plans._hash(field["source_text"]), translated,
                       "submitted", "publication-carry-forward", 0)
        store.approve(c, entity_kind="plan", entity_id=key[1], field_path=path,
                      source_text=field["source_text"],
                      reviewer_id="publication-carry-forward",
                      expected_candidate_hash=plans._hash(translated))
        count += 1
    return count
