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
        sql+=" AND lower(display_name) LIKE ?"
        params.append("%"+str(query).strip().lower()+"%")
    if category:
        sql+=" AND category=?"
        params.append(category)
    sql+=" ORDER BY display_name,id LIMIT ? OFFSET ?"
    params.extend([limit,offset])
    return [dict(row) for row in c.execute(sql,params).fetchall()]

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
