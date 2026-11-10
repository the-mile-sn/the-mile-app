"""Isolated V1 food library. No writes to prescriptions, athletes or player data."""
import json
import math
import secrets
import time

FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
KINDS = ("plain", "edible", "gross")

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_food_library (
        id TEXT PRIMARY KEY,
        source_key TEXT,
        base_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        variant TEXT NOT NULL,
        edible_fraction REAL NOT NULL DEFAULT 1,
        reference_g REAL,
        kcal REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g REAL NOT NULL,
        fat_g REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_v2_food_category ON v2_food_library(category,active)")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_food_source_variant ON v2_food_library(source_key,variant)")

def number(value, *, zero=True):
    try:
        n=float(value)
    except (ValueError,TypeError):
        raise ValueError("invalid_nutrient")
    if not math.isfinite(n) or n < 0 or (not zero and n == 0):
        raise ValueError("invalid_nutrient")
    return n

def validate(food):
    if not isinstance(food,dict):
        raise ValueError("invalid_food")
    name=str(food.get("display_name") or "").strip()
    base=str(food.get("base_name") or name).strip()
    category=str(food.get("category") or "").strip()
    if not name or not base or not category or len(name)>240 or len(base)>240 or len(category)>120:
        raise ValueError("invalid_food")
    if category.casefold()=="equivalentes":
        raise ValueError("excluded_category")
    kind=food.get("variant","plain")
    if kind not in KINDS:
        raise ValueError("invalid_variant")
    fraction=number(food.get("edible_fraction",1),zero=False)
    if fraction>1:
        raise ValueError("invalid_edible_fraction")
    if kind=="plain" and fraction!=1:
        raise ValueError("invalid_variant")
    nutrients={key:number(food.get(key)) for key in FIELDS}
    reference=food.get("reference_g")
    reference=number(reference,zero=False) if reference not in (None,"") else None
    return dict(base_name=base,display_name=name,category=category,
                notes=str(food.get("notes") or "")[:2000],variant=kind,
                edible_fraction=fraction,reference_g=reference,**nutrients)

def list_foods(c, query="", category=None, limit=100, offset=0):
    limit=max(1,min(2000,int(limit)))
    offset=max(0,int(offset))
    sql="SELECT * FROM v2_food_library WHERE active=1"
    params=[]
    if query:
        sql+=" AND (lower(display_name) LIKE ? OR lower(base_name) LIKE ? OR lower(notes) LIKE ?)"
        pattern="%"+str(query).strip().lower()+"%"
        params.extend([pattern,pattern,pattern])
    if category:
        sql+=" AND category=?"
        params.append(category)
    sql+=" ORDER BY display_name,id LIMIT ? OFFSET ?"
    params.extend([limit,offset])
    return [dict(row) for row in c.execute(sql,params).fetchall()]

def page_foods(c, query="", category="", page=1, page_size=25):
    """Server-side catalogue pages; full food list for prescriptions is preserved."""
    query = str(query or "").strip()[:180]
    category = str(category or "").strip()[:120]
    conditions, params = ["active=1"], []
    if query:
        # A food may have a specific display label but be known by its base name
        # or a descriptive note. Keep all matching within active foods only.
        conditions.append("(lower(display_name) LIKE ? OR lower(base_name) LIKE ? OR lower(notes) LIKE ?)")
        pattern="%" + query.lower() + "%"
        params.extend([pattern,pattern,pattern])
    if category:
        conditions.append("category=?")
        params.append(category)
    where = " WHERE " + " AND ".join(conditions)
    total = c.execute("SELECT COUNT(*) AS total FROM v2_food_library" + where, tuple(params)).fetchone()["total"]
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, pages))
    records = c.execute(
        "SELECT * FROM v2_food_library" + where + " ORDER BY display_name,id LIMIT ? OFFSET ?",
        tuple(params + [page_size, (page - 1) * page_size])
    ).fetchall()
    stats = c.execute(
        "SELECT COUNT(*) AS total,COUNT(DISTINCT category) AS categories,"
        "SUM(CASE WHEN variant<>'plain' THEN 1 ELSE 0 END) AS variants "
        "FROM v2_food_library WHERE active=1"
    ).fetchone()
    categories = [r["category"] for r in c.execute(
        "SELECT DISTINCT category FROM v2_food_library WHERE active=1 ORDER BY category"
    ).fetchall()]
    return {"foods": [dict(row) for row in records], "total": total,
            "page": page, "pages": pages, "page_size": page_size,
            "stats": {"total": stats["total"], "categories": stats["categories"],
                      "variants": stats["variants"] or 0},
            "categories": categories}


def upsert(c, food, actor=None):
    data=validate(food)
    fid=str(food.get("id") or secrets.token_hex(16))
    now=int(time.time())
    existing=c.execute("SELECT id FROM v2_food_library WHERE id=?",(fid,)).fetchone()
    cols=list(data)
    if existing:
        c.execute("UPDATE v2_food_library SET "+",".join(k+"=?" for k in cols)+",updated_at=? WHERE id=?",
                  [data[k] for k in cols]+[now,fid])
    else:
        c.execute("INSERT INTO v2_food_library (id,source_key,"+",".join(cols)+",created_at,updated_at) VALUES ("+",".join("?" for _ in range(len(cols)+4))+")",
                  [fid,food.get("source_key")]+[data[k] for k in cols]+[now,now])
    return fid

def archive_food(c, food_id):
    """Only archive foods that are not referenced by any saved or published plan."""
    existing=c.execute("SELECT id,active FROM v2_food_library WHERE id=?",(food_id,)).fetchone()
    if not existing or not existing["active"]:
        return "not_found"

    def referenced(value):
        if isinstance(value,dict):
            for name,item in value.items():
                if name=="foods" and isinstance(item,list):
                    if any(isinstance(food,dict) and str(food.get("id",""))==food_id for food in item):
                        return True
                if referenced(item):
                    return True
        if isinstance(value,list):
            return any(referenced(item) for item in value)
        return False

    for table,column in (
        ("v2_food_plan_drafts","content"),
        ("v2_food_plan_editor_publications","snapshot_json"),
        ("v2_plan_publications","snapshot_json"),
    ):
        for row in c.execute("SELECT "+column+" FROM "+table).fetchall():
            try:
                if referenced(json.loads(row[column])):
                    return "in_use"
            except (ValueError,TypeError):
                return "in_use"
    c.execute("UPDATE v2_food_library SET active=0,updated_at=? WHERE id=? AND active=1",
              (int(time.time()),food_id))
    return "archived"


def nutrients_for_quantity(food, grams):
    grams=number(grams)
    fraction=number(food.get("edible_fraction",1),zero=False) if food.get("variant")=="gross" else 1
    return {key:number(food[key])*grams*fraction/100 for key in FIELDS}

def import_batch(c, records):
    """Atomic import of a prepared catalogue; reject entire batch on invalid data."""
    if not isinstance(records,list) or not (1 <= len(records) <= 2000):
        raise ValueError("invalid_batch")
    validated=[]
    keys=set()
    for food in records:
        data=validate(food)
        key=(str(food.get("source_key") or "").strip(),data["variant"])
        if not key[0] or key in keys:
            raise ValueError("duplicate_source_variant")
        keys.add(key)
        validated.append(dict(food,**data))
    for item in validated:
        existing=c.execute("SELECT id FROM v2_food_library WHERE source_key=? AND variant=?", (item["source_key"],item["variant"])).fetchone()
        if existing:
            item["id"]=existing["id"]
        upsert(c,item)
    return len(validated)

def unify_egg_variants(c):
    """Idempotently consolidate egg catalogue and editor draft references only."""
    import re
    rows=c.execute("SELECT * FROM v2_food_library WHERE active=1").fetchall()
    eggs=[dict(r) for r in rows if re.fullmatch(r"ovo\s*(?:\((?:com casca|descascado|sem casca)\))?",str(r["display_name"]).strip(),re.I)]
    if not eggs: return {"status":"no_egg","changed":0}
    preferred=next((r for r in eggs if re.search(r"descascado|sem casca",r["display_name"],re.I)),None)
    if preferred is None: preferred=next((r for r in eggs if r["variant"]!="gross"),None)
    if preferred is None: return {"status":"needs_edible_reference","changed":0}
    canonical=preferred["id"]
    ids={r["id"] for r in eggs}
    now=int(time.time())
    c.execute("UPDATE v2_food_library SET display_name='Ovo',base_name='Ovo',variant='edible',edible_fraction=1,updated_at=? WHERE id=?",(now,canonical))
    for r in eggs:
        if r["id"]!=canonical:
            c.execute("UPDATE v2_food_library SET active=0,updated_at=? WHERE id=?",(now,r["id"]))
    changed=0
    for row in c.execute("SELECT id,content FROM v2_food_plan_drafts").fetchall():
        try: plan=json.loads(row["content"])
        except (ValueError,TypeError): continue
        dirty=False
        for meal in plan.get("meals",[]):
            for option in meal.get("options",[]):
                for food in option.get("foods",[]):
                    if food.get("id") in ids and food["id"]!=canonical:
                        food["id"]=canonical
                        dirty=True
                # Imported free-text egg quantities can be linked only when an unambiguous gram amount exists.
                notes=option.get("notes",[])
                order=option.get("order",[])
                for index,note in enumerate(list(notes)):
                    m=re.fullmatch(r"\s*(?:(?:\d+(?:[.,]\d+)?)\s*(?:un|unid|unidades?)\s*/\s*)?(\d+(?:[.,]\d+)?)\s*g\s+ovo(?:\s*\((?:com casca|descascado|sem casca)\))?\s*",str(note),re.I)
                    if not m: continue
                    grams=float(m.group(1).replace(",","."))
                    if not 0<grams<=100000: continue
                    food_index=len(option["foods"])
                    option["foods"].append({"id":canonical,"grams":grams})
                    notes[index]=""
                    for item in order:
                        if item.get("type")=="note" and item.get("index")==index:
                            item["type"]="food"
                            item["index"]=food_index
                    dirty=True
                if dirty and "" in notes:
                    keep=[i for i,n in enumerate(notes) if n!=""]
                    remap={old:new for new,old in enumerate(keep)}
                    option["notes"]=[notes[i] for i in keep]
                    option["order"]=[dict(item,index=remap[item["index"]]) if item["type"]=="note" else item for item in order if item["type"]!="note" or item["index"] in remap]
        if dirty:
            c.execute("UPDATE v2_food_plan_drafts SET content=?,updated_at=? WHERE id=?",(json.dumps(plan),now,row["id"]))
            changed+=1
    return {"status":"ok","changed":changed,"canonical_id":canonical}

def restore_approved_average_foods(c):
    """Idempotent, explicitly approved fixed per-100g values; never touch published plans."""
    import re
    import unicodedata
    approved = [
        ("Bebida Aveia 0% – Hacendado", 35, .7, 4.7, 1.4),
        ("Pão (integral, centeio, mistura, outros)", 256, 8, 48, 2),
        ("Wrap integral – Hacendado", 112, 8, 50, 7.8),
        ("Tortilhas de trigo Integral, Continente", 292, 9.7, 42, 7.5),
        ("Polpa de manga", 114, .6, 26, .4),
        ("Maçã (s/caroço)", 64, .2, 13.4, .5),
        ("Peça de fruta", 54.21, .68, 10.67, .33),
        ("Óleo de coco", 906, 0, 0, 100),
    ]
    def norm(s):
        s = unicodedata.normalize("NFKD", str(s or "").casefold())
        return re.sub(r"[^a-z0-9]+", " ", "".join(ch for ch in s if not unicodedata.combining(ch))).strip()
    aliases = {
        norm("Bebida Aveia 0% – Hacendado"): ["Bebida Aveia 0% - Hacendado", "Bebida Aveia 0% Hacendado"],
        norm("Wrap integral – Hacendado"): ["Wrap integral, Hacendado (Mercadona)", "Wrap integral Hacendado"],
        norm("Tortilhas de trigo Integral, Continente"): ["Tortilhas de trigo Integral, Continente"],
    }
    existing = [dict(row) for row in c.execute("SELECT * FROM v2_food_library").fetchall()]
    now = int(time.time())
    by_name = {}
    for row in existing:
        by_name.setdefault(norm(row["display_name"]), []).append(row)
    linked = {}
    inserted = updated = skipped = 0
    for i, (name, kcal, protein, carbs, fat) in enumerate(approved):
        names = [name] + aliases.get(norm(name), [])
        matches = {row["id"]: row for alias in names for row in by_name.get(norm(alias), [])}
        source_key = "approved-average-2026-11:" + str(i + 1)
        for row in existing:
            if row["source_key"] == source_key:
                matches[row["id"]] = row
        if len(matches) > 1:
            skipped += 1
            continue  # never guess which duplicate is canonical
        row = next(iter(matches.values()), None)
        food = dict(display_name=name, base_name=name, category=(row["category"] if row else "Outros"),
                    notes=(row["notes"] if row else ""), variant="plain", edible_fraction=1,
                    reference_g=(row["reference_g"] if row else None),
                    kcal=kcal, protein_g=protein, carbs_g=carbs, fat_g=fat)
        if row:
            fid = row["id"]
            # Keep the existing food ID, so linked draft entries immediately regain macros.
            c.execute("""UPDATE v2_food_library SET display_name=?,base_name=?,category=?,notes=?,
                variant='plain',edible_fraction=1,reference_g=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,
                active=1,updated_at=? WHERE id=?""",
                (name,name,food["category"],food["notes"],food["reference_g"],kcal,protein,carbs,fat,now,fid))
            updated += 1
        else:
            fid = upsert(c, dict(food, source_key=source_key))
            inserted += 1
        for alias in names:
            linked[norm(alias)] = fid
    # Convert only simple unambiguous gram-prefixed text notes; preserve all other notes.
    converted = 0
    for row in c.execute("SELECT id,content FROM v2_food_plan_drafts").fetchall():
        try:
            plan = json.loads(row["content"])
        except (ValueError, TypeError):
            continue
        dirty = False
        for meal in plan.get("meals", []):
            for option in meal.get("options", []):
                notes = option.get("notes", [])
                order = option.get("order", [])
                if not isinstance(notes,list) or not isinstance(order,list):
                    continue
                changes = {}
                for ni, note in enumerate(notes):
                    match = re.fullmatch(r"\s*(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\s*(?:[-–·:]\s*)?(.+?)\s*",str(note),re.I)
                    if not match:
                        continue
                    grams = float(match.group(1).replace(",","."))
                    fid = linked.get(norm(match.group(2)))
                    if fid and 0 < grams <= 100000:
                        changes[ni] = (fid, grams)
                if not changes:
                    continue
                used = {item.get("index") for item in order if item.get("type") == "note"}
                changes = {i:v for i,v in changes.items() if i in used}
                if not changes:
                    continue
                for item in order:
                    if item.get("type") == "note" and item.get("index") in changes:
                        fid, grams = changes[item["index"]]
                        item["type"] = "food"
                        item["index"] = len(option.setdefault("foods",[]))
                        option["foods"].append({"id":fid,"grams":grams})
                        converted += 1
                keep = [i for i in range(len(notes)) if i not in changes]
                mapping = {old:new for new,old in enumerate(keep)}
                option["notes"] = [notes[i] for i in keep]
                for item in order:
                    if item.get("type") == "note" and item.get("index") in mapping:
                        item["index"] = mapping[item["index"]]
                dirty = True
        if dirty:
            c.execute("UPDATE v2_food_plan_drafts SET content=?,updated_at=? WHERE id=?",
                      (json.dumps(plan,ensure_ascii=False),now,row["id"]))
    return {"inserted":inserted,"updated":updated,"ambiguous_skipped":skipped,"draft_notes_linked":converted}

def repair_imported_plan_food_links(c):
    """Link unambiguous imported food lines in editor drafts; leave published snapshots intact."""
    import re
    import unicodedata
    def norm(value):
        value = unicodedata.normalize("NFKD", str(value or "").casefold())
        return re.sub(r"[^a-z0-9]+", " ", "".join(ch for ch in value if not unicodedata.combining(ch))).strip()
    rows = [dict(r) for r in c.execute("SELECT id,display_name,base_name,active FROM v2_food_library").fetchall()]
    lookup = {}
    for food in rows:
        if not food["active"]:
            continue
        for name in (food["display_name"], food["base_name"]):
            lookup.setdefault(norm(name), set()).add(food["id"])
    # Only the user's explicitly confirmed spelling correction is allowed.
    aliases = {
        norm("Bebida Aveia, Alpro, 0%"): norm("Bebida Aveia - Alpro, 0%"),
        norm("Pão (integral, centeio, mistura, outros)"): norm("Pão (integral, centeio, mistura, outros)"),
        norm("Ovo (com casca)"): norm("Ovo"),
        norm("Ovo (descascado)"): norm("Ovo"),
        norm("Ovo (sem casca)"): norm("Ovo"),
    }
    # Eggs may have an inactive old ID after consolidation; never map by guess.
    canonical_eggs = lookup.get(norm("Ovo"), set())
    for alias in ("Ovo (com casca)", "Ovo (descascado)", "Ovo (sem casca)"):
        if len(canonical_eggs) == 1:
            lookup[norm(alias)] = set(canonical_eggs)
    changed_plans = linked_lines = renamed_notes = unresolved = 0
    now = int(time.time())
    for row in c.execute("SELECT id,content FROM v2_food_plan_drafts").fetchall():
        try:
            plan = json.loads(row["content"])
        except (TypeError, ValueError):
            continue
        dirty = False
        for meal in plan.get("meals", []):
            for option in meal.get("options", []):
                notes = option.get("notes", [])
                order = option.get("order", [])
                if not isinstance(notes, list) or not isinstance(order, list):
                    continue
                replacements = {}
                for i, note in enumerate(notes):
                    original = str(note)
                    # Preserve free text and other nutrients; correct the Alpro spelling only.
                    corrected = re.sub(r"Bebida\s+Aveia\s*,\s*Alpro\s*,\s*0\s*%", "Bebida Aveia - Alpro, 0%", original, flags=re.I)
                    if corrected != original:
                        notes[i] = corrected
                        renamed_notes += 1
                        dirty = True
                    text = corrected.strip()
                    # Imported snapshots typically render as '120 g Ovo' or 'Ovo 120 g'.
                    match = re.fullmatch(r"(?:(?:\d+(?:[.,]\d+)?\s*(?:un|unid|unidades?)\s*/\s*)?)(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\s*(?:[-–·:]\s*)?(.+)",text,re.I)
                    if match:
                        amount, name = match.group(1), match.group(2)
                    else:
                        match = re.fullmatch(r"(.+?)\s*(?:[-–·:]\s*)?(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)",text,re.I)
                        if not match:
                            continue
                        name, amount = match.group(1), match.group(2)
                    grams = float(amount.replace(",","."))
                    if not 0 < grams <= 100000:
                        continue
                    key = norm(name)
                    target = aliases.get(key,key)
                    ids = lookup.get(target,set())
                    if len(ids) != 1:
                        if key in aliases or any(token in key for token in ("alpro","ovo","pao")):
                            unresolved += 1
                        continue
                    replacements[i] = (next(iter(ids)), grams)
                if not replacements:
                    continue
                used = {item.get("index") for item in order if isinstance(item,dict) and item.get("type")=="note"}
                replacements = {i:value for i,value in replacements.items() if i in used}
                if not replacements:
                    continue
                foods = option.setdefault("foods",[])
                for item in order:
                    if item.get("type") == "note" and item.get("index") in replacements:
                        fid, grams = replacements[item["index"]]
                        item["type"] = "food"
                        item["index"] = len(foods)
                        foods.append({"id":fid,"grams":grams})
                        linked_lines += 1
                keep = [i for i in range(len(notes)) if i not in replacements]
                mapping = {old:new for new,old in enumerate(keep)}
                option["notes"] = [notes[i] for i in keep]
                for item in order:
                    if item.get("type") == "note":
                        item["index"] = mapping[item["index"]]
                dirty = True
        if dirty:
            c.execute("UPDATE v2_food_plan_drafts SET content=?,updated_at=? WHERE id=?",
                      (json.dumps(plan,ensure_ascii=False),now,row["id"]))
            changed_plans += 1
    return {"changed_plans":changed_plans,"linked_lines":linked_lines,
            "alpro_spelling_corrected":renamed_notes,"unresolved":unresolved}

def reconcile_original_snapshot_quantities(c):
    """Repair only legacy-imported drafts using their exact published source snapshots."""
    import hashlib
    import re
    import unicodedata
    import food_plan_migration_v2 as migration
    def norm(value):
        value = unicodedata.normalize("NFKD", str(value or "").casefold()).replace("®","")
        return re.sub(r"[^a-z0-9]+"," ","".join(ch for ch in value if not unicodedata.combining(ch))).strip()
    active = [dict(r) for r in c.execute("SELECT id,display_name,base_name FROM v2_food_library WHERE active=1").fetchall()]
    by_name = {}
    for food in active:
        for label in (food["display_name"],food["base_name"]):
            by_name.setdefault(norm(label),set()).add(food["id"])
    aliases = {
        norm("Bebida Aveia, Alpro® 0%"): norm("Bebida Aveia - Alpro, 0%"),
        norm("Bebida Aveia, Alpro, 0%"): norm("Bebida Aveia - Alpro, 0%"),
        norm("Ovo (com casca)"): norm("Ovo"),
        norm("Ovo (descascado)"): norm("Ovo"),
        norm("Ovo (sem casca)"): norm("Ovo"),
    }
    targets = {norm("Pão (integral, centeio, mistura, outros)"),
               norm("Bebida Aveia, Alpro® 0%"),norm("Bebida Aveia - Alpro, 0%"),
               norm("Ovo"),norm("Ovo (com casca)"),norm("Ovo (descascado)"),norm("Ovo (sem casca)")}
    def target_id(label):
        key = aliases.get(norm(label),norm(label))
        ids = by_name.get(key,set())
        return next(iter(ids)) if len(ids)==1 else None
    changed_plans=linked=missing_quantity=missing_food=0
    now=int(time.time())
    for pub in c.execute("SELECT id,snapshot_json FROM v2_plan_publications").fetchall():
        draft_id = hashlib.sha256(("editor-import-v1:"+pub["id"]).encode()).hexdigest()[:32]
        record = c.execute("SELECT content FROM v2_food_plan_drafts WHERE id=?",(draft_id,)).fetchone()
        if not record: continue
        try:
            plan=json.loads(record["content"])
            snapshot=json.loads(pub["snapshot_json"])
        except (ValueError,TypeError): continue
        # Rebuild the import's meal-to-group correspondence, preserving original order.
        source_meals=[]
        for group in snapshot.get("groups",[]):
            for meal_key in group.get("meals",[]):
                if migration.MEALS.get(meal_key):
                    source_meals.append((migration.MEALS[meal_key],group))
        if len(source_meals)!=len(plan.get("meals",[])): continue
        dirty=False
        for meal,(source_name,group) in zip(plan["meals"],source_meals):
            if meal.get("name")!=source_name: continue
            if len(meal.get("options",[]))!=len(group.get("options",[])): continue
            for option,source_option in zip(meal["options"],group["options"]):
                # Each source item maps to one ordered entry in the imported draft.
                original_items=[item for item in source_option.get("items",[]) if item.get("kind")!="title"]
                order=option.get("order",[])
                if len(order)!=len(original_items): continue
                changes=[]
                for position,(item,entry) in enumerate(zip(original_items,order)):
                    if entry.get("type")!="note": continue
                    name=str(item.get("name") or "").strip()
                    if norm(name) not in targets: continue
                    ni=entry.get("index")
                    if not isinstance(ni,int) or ni<0 or ni>=len(option.get("notes",[])): continue
                    original_note=str(option["notes"][ni])
                    source_note=str(item.get("text") or "").strip() or " ".join(x for x in (str(item.get("quantity") or "").strip(),name) if x)
                    # Only repair notes that still match the original import, allowing Alpro spelling correction.
                    if norm(original_note)!=norm(source_note) and norm(original_note)!=norm(source_note.replace("Bebida Aveia, Alpro® 0%","Bebida Aveia - Alpro, 0%")):
                        continue
                    grams=migration.grams(item.get("quantity"))
                    if grams is None:
                        grams=migration.grams(item.get("text"))
                    if grams is None:
                        missing_quantity+=1
                        continue
                    fid=target_id(name)
                    if not fid:
                        missing_food+=1
                        continue
                    changes.append((position,ni,fid,grams))
                if not changes: continue
                foods=option.setdefault("foods",[])
                notes=option["notes"]
                removed=set()
                for pos,ni,fid,grams in changes:
                    order[pos]={"type":"food","index":len(foods)}
                    foods.append({"id":fid,"grams":grams})
                    removed.add(ni)
                    linked+=1
                kept=[i for i in range(len(notes)) if i not in removed]
                remap={old:new for new,old in enumerate(kept)}
                option["notes"]=[notes[i] for i in kept]
                for entry in order:
                    if entry.get("type")=="note":
                        entry["index"]=remap[entry["index"]]
                dirty=True
        if dirty:
            c.execute("UPDATE v2_food_plan_drafts SET content=?,updated_at=? WHERE id=?",
                      (json.dumps(plan,ensure_ascii=False),now,draft_id))
            changed_plans+=1
    return {"changed_plans":changed_plans,"linked":linked,
            "source_quantity_missing":missing_quantity,"food_not_unique":missing_food}

def audit_unlinked_plan_foods(c):
    """Read-only coverage audit; no changes to player plans or editor drafts."""
    import collections
    import re
    import unicodedata
    def norm(value):
        s=unicodedata.normalize("NFKD",str(value or "").casefold()).replace("®","")
        return re.sub(r"[^a-z0-9]+"," ","".join(ch for ch in s if not unicodedata.combining(ch))).strip()
    foods=[dict(r) for r in c.execute("SELECT id,display_name,base_name,active FROM v2_food_library").fetchall()]
    ids={r["id"] for r in foods if r["active"]}
    names=collections.defaultdict(set)
    for r in foods:
        if r["active"]:
            names[norm(r["display_name"])].add(r["id"])
            names[norm(r["base_name"])].add(r["id"])
    stats=collections.Counter()
    examples=collections.Counter()
    for row in c.execute("SELECT content FROM v2_food_plan_drafts").fetchall():
        try: plan=json.loads(row["content"])
        except (ValueError,TypeError): continue
        stats["plans"]+=1
        for meal in plan.get("meals",[]):
            for option in meal.get("options",[]):
                for food in option.get("foods",[]):
                    stats["linked_food_rows"]+=1
                    if food.get("id") not in ids: stats["inactive_or_missing_ids"]+=1
                for note in option.get("notes",[]):
                    stats["note_rows"]+=1
                    text=str(note).strip()
                    if not text: continue
                    if re.search(r"\b(?:acompanhar com|observa[cç][oõ]es|nota|op[cç][aã]o)\b",text,re.I): continue
                    stats["possible_unlinked_foods"]+=1
                    examples[text[:160]]+=1
    return {"counts":dict(stats),"most_common_unlinked":examples.most_common(45)}
