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


def translation_readiness(c):
    """Restricted diagnostic: never return private source or English text.

    This runs inside the app's own database connection (no external network
    access or Render IP allowlist changes). The calling route must enforce an
    authenticated administrator and the diagnostic feature flag.
    """
    if not translation_store_available(c):
        return {"available":False,"approved_count":0,"kinds":{}}
    rows=c.execute("""SELECT entity_kind,COUNT(*) AS approved_count
        FROM v2_content_translations
        WHERE language='en' AND status='approved'
        GROUP BY entity_kind ORDER BY entity_kind""").fetchall()
    counts={row["entity_kind"]:int(row["approved_count"]) for row in rows}
    return {"available":True,"approved_count":sum(counts.values()),
            "kinds":counts}


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


def _current_english(row, original, *, trim_source=False):
    if not isinstance(original, str) or not original.strip():
        return original
    # Library approvals hash their exact canonical source. Plan approvals
    # deliberately trim source text in their private review inventory.
    canonical=original.strip() if trim_source else original
    if (row is None or row["source_hash"] != _sha(canonical)
            or not isinstance(row["translated_text"], str)
            or not row["translated_text"].strip()):
        return original
    return row["translated_text"]


def search_approved_food_names(c, search, columns):
    """Search by PT or approved EN name; return existing food attributes only.

    The caller must authorise the player before calling this function.
    Never search notes, player records or unapproved translations. Keep
    original food IDs, nutrition data and note fields unchanged.
    """
    permitted={"id","display_name","variant","kcal","protein_g",
               "carbs_g","fat_g","note","notes","observation",
               "observations","description","preparation_notes"}
    if not columns or not set(columns).issubset(permitted):
        raise ValueError("invalid_food_search_columns")
    qualified=", ".join("f."+field for field in columns)
    translated_columns=qualified+(
        ", t.source_hash AS _tm_translation_hash,"
        " t.translated_text AS _tm_translation_text")
    joined=""" FROM v2_food_library f
        LEFT JOIN v2_content_translations t
          ON t.entity_kind='food' AND t.entity_id=f.id
         AND t.field_path='display_name' AND t.language='en'
         AND t.status='approved'
        WHERE f.active=1 AND """
    term="%"+search.lower()+"%"
    # Portuguese matches retain the old 30-record limit and search behaviour.
    portuguese=c.execute(
        "SELECT "+translated_columns+joined+
        "lower(f.display_name) LIKE ? ORDER BY f.display_name LIMIT 30",
        (term,)).fetchall()
    # EN matches are bounded and cannot be returned unless their current
    # source hash matches the canonical library value.
    english=c.execute(
        "SELECT "+translated_columns+joined+
        "lower(t.translated_text) LIKE ? ORDER BY t.translated_text LIMIT 250",
        (term,)).fetchall()
    found={}
    for row in list(portuguese)+list(english):
        entry=dict(row)
        english_name=_current_english(
            {"source_hash":entry.get("_tm_translation_hash"),
             "translated_text":entry.get("_tm_translation_text")},
            entry["display_name"])
        # Ignore English-only matches from stale translations.
        if (search.casefold() not in entry["display_name"].casefold()
                and search.casefold() not in str(english_name).casefold()):
            continue
        entry["display_name"]=english_name
        found[str(entry["id"])]={
            field:entry[field] for field in columns
        }
    return sorted(found.values(),
                  key=lambda row:(row["display_name"].casefold(),
                                  str(row["id"])))[:30]


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
                    rows.get(prefix + "/title"), option.get("title"),
                    trim_source=True)
                for ni, note in enumerate(option.get("notes") or []):
                    option["notes"][ni] = _current_english(
                        rows.get(prefix + f"/notes/{ni}"), note,
                        trim_source=True)
                for fi, food in enumerate(option.get("foods") or []):
                    if not isinstance(food, dict):
                        continue
                    fpath = prefix + f"/foods/{fi}"
                    if food.get("kind") == "supplement":
                        food["label"] = _current_english(
                            rows.get(fpath + "/label"), food.get("label"),
                            trim_source=True)
                        continue
                    food["display_quantity"] = _current_english(
                        rows.get(fpath + "/display_quantity"),
                        food.get("display_quantity"),trim_source=True)
                    text = food.get("display_name")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    food_id = str(food.get("id") or "")
                    canonical = pt_names.get(food_id)
                    if canonical is not None and text.strip() == canonical.strip():
                        result=_current_english(food_rows.get(food_id),canonical)
                        # Without a valid approval keep precisely the published
                        # Portuguese display name (including its whitespace).
                        if result!=canonical:food["display_name"]=result
                    else:
                        food["display_name"] = _current_english(
                            rows.get(fpath + "/display_name"), text,
                            trim_source=True)
        copied["content"] = snapshot
        localised[plan_type] = copied
    return localised, en_library

def search_approved_dishes(c, search):
    """Search PT/approved EN Chef dish names without changing canonical IDs.

    Chef access is verified by the calling API. Unapproved and outdated names
    never match English searches; the display-only result keeps the existing
    field names so the approved Chef menu form remains unchanged.
    """
    query="%"+search.lower()+"%"
    columns="d.id,d.name_pt,d.category,t.source_hash AS _translation_hash,"+(
        "t.translated_text AS _translation_text")
    joined=""" FROM v2_dish_library d
       LEFT JOIN v2_content_translations t
         ON t.entity_kind='dish' AND t.entity_id=d.id
        AND t.field_path='name_pt' AND t.language='en'
        AND t.status='approved'
       WHERE d.active=1 AND """
    pt=c.execute("SELECT "+columns+joined+
        "lower(d.name_pt) LIKE ? ORDER BY d.name_pt LIMIT 100",
        (query,)).fetchall()
    en=c.execute("SELECT "+columns+joined+
        "lower(t.translated_text) LIKE ? ORDER BY t.translated_text LIMIT 250",
        (query,)).fetchall()
    found={}
    for row in list(pt)+list(en):
        value=dict(row)
        label=_current_english(
            {"source_hash":value.get("_translation_hash"),
             "translated_text":value.get("_translation_text")},
            value["name_pt"])
        if (search.casefold() not in value["name_pt"].casefold()
                and search.casefold() not in str(label).casefold()):
            continue
        found[str(value["id"])]={"id":value["id"],"name_pt":label,
                                 "category":value["category"]}
    return sorted(found.values(),
                  key=lambda value:(value["name_pt"].casefold(),
                                    str(value["id"])))[:100]


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

def _translation_map(c, kind):
    return {(row["entity_id"],row["field_path"]):row
            for row in _approved_rows(c,kind)}


def localise_recipe_summaries(c, items, *, language="pt"):
    """Display-only names and category names in already-authorised recipe lists."""
    if not enabled(language) or not items or not translation_store_available(c):
        return items
    recipes=_translation_map(c,"recipe")
    categories=_translation_map(c,"recipe_category")
    results=[]
    for item in items:
        record=dict(item)
        recipe_id=str(item.get("id") or "")
        category_id=str(item.get("category_id") or "")
        record["name"]=_current_english(
            recipes.get((recipe_id,"name")),item.get("name"))
        if "category" in item:
            record["category"]=_current_english(
                categories.get((category_id,"name")),item.get("category"))
        results.append(record)
    return results


def localise_recipe_detail(c, item, *, language="pt"):
    """Version-bound EN for name, category, notes, sections and preparation.

    Portions, quantities, identifiers, photo permissions, published visibility,
    and ordering stay exactly as in the authenticated source response.
    """
    if not enabled(language) or not item or not translation_store_available(c):
        return item
    result=copy.deepcopy(item)
    translated=_translation_map(c,"recipe")
    categories=_translation_map(c,"recipe_category")
    recipe_id=str(item.get("id") or "")
    category_id=str(item.get("category_id") or "")
    def field(path, text):
        return _current_english(translated.get((recipe_id,path)),text)
    result["name"]=field("name",item.get("name"))
    result["notes"]=field("notes",item.get("notes"))
    if "category" in item:
        result["category"]=_current_english(
            categories.get((category_id,"name")),item.get("category"))
    for section in result.get("sections") or []:
        if not isinstance(section,dict):continue
        sid=section.get("id")
        if not isinstance(sid,str) or not sid:continue
        section["title"]=field("sections/"+sid+"/title",section.get("title"))
        for ingredient in section.get("ingredients") or []:
            if not isinstance(ingredient,dict):continue
            iid=ingredient.get("id")
            if not isinstance(iid,str) or not iid:continue
            prefix="sections/"+sid+"/ingredients/"+iid
            ingredient["name"]=field(prefix+"/name",ingredient.get("name"))
            ingredient["unit"]=field(prefix+"/unit",ingredient.get("unit"))
    for idx,step in enumerate(result.get("steps") or []):
        result["steps"][idx]=field("steps/"+str(idx),step)
    return result


def localise_dish_summaries(c, dishes, *, language="pt"):
    """Translate only the existing name_pt property, retaining IDs and access."""
    if not enabled(language) or not dishes or not translation_store_available(c):
        return dishes
    translated=_translation_map(c,"dish")
    result=[]
    for dish in dishes:
        display=dict(dish)
        # Keep name_pt canonical for legacy ID-less menu resolution.
        # Presentation can use display_name without changing any lookup key.
        display["display_name"]=_current_english(
            translated.get((str(dish.get("id") or ""),"name_pt")),
            dish.get("name_pt"))
        result.append(display)
    return result

def localise_supplement_days(c, by_day, *, language="pt"):
    """Translate only current library-exact presentation strings.

    Personalised doses, event rules, date-specific overrides and the athlete's
    original supplement schedule are not changed or reinterpreted.
    """
    if not enabled(language) or not by_day or not translation_store_available(c):
        return by_day
    ids=sorted({str(item.get("library_id")) for items in by_day.values()
                for item in items if item.get("library_id")})
    if not ids:
        return by_day
    placeholders=",".join("?" for _ in ids)
    library={str(row["id"]):dict(row) for row in c.execute(
        "SELECT id,name,dose,timing_text,note FROM v2_supplement_library "
        "WHERE id IN ("+placeholders+")",tuple(ids)).fetchall()}
    approved=_translation_map(c,"supplement")
    output={}
    for day,items in by_day.items():
        result=[]
        for item in items:
            display=dict(item)
            source=library.get(str(item.get("library_id") or ""))
            if source:
                for field in ("name","dose","timing_text","note"):
                    canonical=source.get(field)
                    current=item.get(field)
                    if isinstance(current,str) and current.strip() and (
                            current.strip()==str(canonical or "").strip()):
                        display[field]=_current_english(approved.get(
                            (str(source["id"]),field)),current)
                if (item.get("timing_text") and
                    item.get("display_moment")==item.get("timing_text")):
                    display["display_moment"]=display.get("timing_text")
            # Fixed display-only fallback; moment codes remain in PT as stored.
            if item.get("display_moment")=="Almoço ou jantar":
                display["display_moment"]="Lunch or dinner"
            result.append(display)
        output[day]=result
    return output

def localise_supplement_plan(c, items, *, language="pt"):
    """Translate published plan presentation only; no athlete schedule writes."""
    if not enabled(language) or not items:
        return items
    return localise_supplement_days(c, {"plan":items},language=language)["plan"]

def localise_consumption_source(c, athlete_id, source, *, language="pt"):
    """Localise the existing published consumption response, never its keys.

    A validated source comes from consumption_source_v2.current_source
    *after* player ownership and publication eligibility have been checked.
    The option_ref, source_draft_id, alternative_to, grams and timing
    remain identical to the original; persisted consumption is untouched.
    """
    if not enabled(language) or not source or not translation_store_available(c):
        return source
    import food_plan_player_v2 as published
    approved=published._approved(c,athlete_id)
    matches=[(kind,plan) for kind,plan in approved.items()
             if plan.get("draft_id")==source.get("draft_id")]
    if len(matches)!=1:
        return source
    kind,plan=matches[0]
    pt_library=published._library(c)
    localised,en_library=localise_published_plans(
        c,{kind:plan},pt_library,language=language)
    translated=localised[kind]["content"]
    lookup={}
    ambiguous=set()
    for meal in translated.get("meals") or []:
        if not isinstance(meal,dict):continue
        for option in meal.get("options") or []:
            if not isinstance(option,dict):continue
            key=option.get("__tm_canonical_option_ref")
            if key in lookup:ambiguous.add(key)
            else:lookup[key]=option
    result=dict(source)
    options=[]
    for option in source.get("options") or []:
        replacement=dict(option)
        ref=option.get("option_ref")
        updated=lookup.get(ref) if ref not in ambiguous else None
        if updated:
            # Only human-readable values change. The option reference is
            # from the canonical published source, never from translated text.
            if option.get("title"):
                replacement["title"]=updated.get("title") or option["title"]
            foods=[]
            for index,food in enumerate(option.get("foods") or []):
                display=dict(food)
                approved_food=(updated.get("foods") or [])
                target=approved_food[index] if index<len(approved_food) else None
                if isinstance(target,dict):
                    if food.get("kind")=="supplement":
                        if food.get("label"):
                            display["label"]=target.get("label") or food["label"]
                    else:
                        fid=str(food.get("id") or "")
                        canonical=(pt_library.get(fid) or {}).get("display_name")
                        if (canonical is not None and
                                str(food.get("display_name") or "").strip()==
                                str(canonical).strip()):
                            display["display_name"]=(en_library.get(fid) or {}
                                ).get("display_name") or food["display_name"]
                        if food.get("display_quantity"):
                            display["display_quantity"]=target.get(
                                "display_quantity") or food["display_quantity"]
                foods.append(display)
            replacement["foods"]=foods
        options.append(replacement)
    result["options"]=options
    return result
