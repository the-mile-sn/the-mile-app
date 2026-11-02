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
    limit=max(1,min(250,int(limit)))
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
