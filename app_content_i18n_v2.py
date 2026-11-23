"""Read-only, opt-in EN presentation for approved published Planos.

The backoffice owns translation proposals, review and publication. This reader
never creates a table, exports a snapshot or touches nutritional instructions.
It is OFF until the app and admin translation store have been verified as
the same authorised source of data.

Only source-hash-matched, approved text in the current published version is
eligible for presentation. Everything else falls back to canonical Portuguese.
"""
import copy
import hashlib
import os


def enabled(language):
    return (os.environ.get("MILE_APP_TRANSLATIONS_ENABLED") == "1"
            and language == "en")


def translation_store_available(c):
    """Read-only schema probe, supports both the app's SQLite and Postgres."""
    if hasattr(c, "conn"):
        return c.execute("""SELECT 1 FROM information_schema.tables
            WHERE table_schema=current_schema()
            AND table_name='v2_content_translations'""").fetchone() is not None
    return c.execute("""SELECT 1 FROM sqlite_master
        WHERE type='table' AND name='v2_content_translations'""").fetchone() is not None


def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _approved_rows(c, kind, entity_id=None):
    sql = """SELECT entity_id,field_path,source_hash,translated_text
         FROM v2_content_translations
         WHERE entity_kind=? AND language='en' AND status='approved'"""
    params = (kind,)
    if entity_id is not None:
        sql += " AND entity_id=?"
        params += (entity_id,)
    return c.execute(sql, params).fetchall()


def _current_english(row, original):
    if not isinstance(original, str) or not original.strip():
        return original
    if (row is None or row["source_hash"] != _sha(original.strip())
            or not isinstance(row["translated_text"], str)
            or not row["translated_text"].strip()):
        return original
    return row["translated_text"]


def localise_published_plans(c, plans, library, *, language="pt"):
    """Return display-only copies, scoped to plans already selected by athlete.

    The caller must first authorise the player/chef and get only that athlete's
    published plans. Never feed the returned copies back into persistence.
    """
    if not enabled(language) or not plans or not translation_store_available(c):
        return plans, library

    food_rows = {row["entity_id"]: row for row in _approved_rows(c, "food")
                 if row["field_path"] == "display_name"}
    pt_names = {str(food_id): (food.get("display_name") or "")
                for food_id, food in library.items()}
    en_library = {food_id: dict(food) for food_id, food in library.items()}
    for food_id, food in en_library.items():
        food["display_name"] = _current_english(
            food_rows.get(str(food_id)), pt_names[str(food_id)])

    localised = {}
    for plan_type, plan in plans.items():
        raw = plan.get("snapshot_json")
        if not isinstance(raw, str):
            localised[plan_type] = plan
            continue
        ident = "pub:" + _sha(str(plan["draft_id"]) + "\0" + raw)
        rows = {row["field_path"]: row for row in _approved_rows(c, "plan", ident)}
        copied = dict(plan)
        snapshot = copy.deepcopy(plan["content"])
        # The option identity is a SHA256 of the *raw Portuguese option*.
        # Persisted choices and consumption refer to this identifier, so it
        # must never change when only the display language changes.
        from meal_option_selection_v2 import option_ref
        for mi, meal in enumerate(snapshot.get("meals") or []):
            if not isinstance(meal,dict):continue
            original_meal=plan["content"]["meals"][mi]
            for oi, option in enumerate(meal.get("options") or []):
                if isinstance(option,dict):
                    option["__tm_canonical_option_ref"]=option_ref(
                        original_meal["options"][oi])
        for mi, meal in enumerate(snapshot.get("meals") or []):
            if not isinstance(meal, dict):
                continue
            for oi, option in enumerate(meal.get("options") or []):
                if not isinstance(option, dict):
                    continue
                prefix = f"meals/{mi}/options/{oi}"
                option["title"] = _current_english(
                    rows.get(prefix + "/title"), option.get("title"))
                for ni, note in enumerate(option.get("notes") or []):
                    option["notes"][ni] = _current_english(
                        rows.get(prefix + f"/notes/{ni}"), note)
                for fi, food in enumerate(option.get("foods") or []):
                    if not isinstance(food, dict):
                        continue
                    fpath = prefix + f"/foods/{fi}"
                    if food.get("kind") == "supplement":
                        food["label"] = _current_english(
                            rows.get(fpath + "/label"), food.get("label"))
                        continue
                    food["display_quantity"] = _current_english(
                        rows.get(fpath + "/display_quantity"),
                        food.get("display_quantity"))
                    text = food.get("display_name")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    food_id = str(food.get("id") or "")
                    canonical = pt_names.get(food_id)
                    if canonical is not None and text.strip() == canonical.strip():
                        food["display_name"] = _current_english(
                            food_rows.get(food_id), text)
                    else:
                        food["display_name"] = _current_english(
                            rows.get(fpath + "/display_name"), text)
        copied["content"] = snapshot
        localised[plan_type] = copied
    return localised, en_library

def localise_dish_menus(c, menus, *, language="pt"):
    """Translate only authorised dish menu display names, never free text.

    Menu IDs, dates, kinds, the stored canonical dish value and history remain
    unchanged. Player and Chef endpoints first scope the menu rows by athlete.
    """
    if not enabled(language) or not menus or not translation_store_available(c):
        return menus
    ids=sorted({str(row.get("dish_id")) for row in menus
                if row.get("kind")=="dish" and row.get("dish_id")})
    if not ids:
        return menus
    placeholders=",".join("?" for _ in ids)
    canonical={str(row["id"]):row["name_pt"] for row in c.execute(
        "SELECT id,name_pt FROM v2_dish_library WHERE active=1 AND id IN ("+
        placeholders+")",tuple(ids)).fetchall()}
    approved={row["entity_id"]:row for row in _approved_rows(c,"dish")
              if row["field_path"]=="name_pt"}
    result=[]
    for menu in menus:
        display=dict(menu)
        dish_id=str(menu.get("dish_id") or "")
        if menu.get("kind")=="dish" and dish_id in canonical:
            display["value"]=_current_english(approved.get(dish_id),canonical[dish_id])
        result.append(display)
    return result
