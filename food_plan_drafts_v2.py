"""Isolated draft meal-plan editor. No published plan writes."""
import json, secrets, time

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_food_plan_drafts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
        created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    )""")

PLAN_TYPES = ("Plano laranja", "Plano amarelo", "Plano azul", "Plano verde", "Plano verde preparação", "Plano Peri-jogo", "Plano Peri-treino")

def validate(value):
    if not isinstance(value,dict): raise ValueError("invalid_plan")
    name=str(value.get("name") or "").strip()
    meals=value.get("meals")
    if not name or len(name)>160 or not isinstance(meals,list) or len(meals)>40: raise ValueError("invalid_plan")
    plan_type=str(value.get("plan_type") or "").strip()
    if plan_type and plan_type not in PLAN_TYPES: raise ValueError("invalid_plan_type")
    clean=[]
    for meal in meals:
        if not isinstance(meal,dict) or not isinstance(meal.get("options"),list) or not 1<=len(meal["options"])<=30: raise ValueError("invalid_meal")
        title=str(meal.get("name") or "").strip()
        if not title or len(title)>120: raise ValueError("invalid_meal")
        options=[]
        for option in meal["options"]:
            if not isinstance(option,dict) or not isinstance(option.get("foods"),list) or len(option["foods"])>100: raise ValueError("invalid_option")
            foods=[]
            for food in option["foods"]:
                if not isinstance(food,dict): raise ValueError("invalid_food")
                fid=str(food.get("id") or "")
                try: grams=float(food.get("grams"))
                except (TypeError,ValueError): raise ValueError("invalid_quantity")
                if not fid or not 0<grams<=100000: raise ValueError("invalid_quantity")
                foods.append({"id":fid,"grams":grams})
            notes=option.get("notes",[])
            if not isinstance(notes,list) or len(notes)>100: raise ValueError("invalid_notes")
            notes=[str(n).strip() for n in notes]
            if any(len(n)>4000 for n in notes): raise ValueError("invalid_note")
            title=str(option.get("title") or "").strip()
            if len(title)>160: raise ValueError("invalid_option_title")
            options.append({"title":title,"foods":foods,"notes":notes})
        clean.append({"name":title,"options":options})
    return {"id":str(value.get("id") or ""), "name":name,"plan_type":plan_type,"meals":clean}

def list_drafts(c):
    return [dict(r) for r in c.execute("SELECT id,name,updated_at FROM v2_food_plan_drafts ORDER BY updated_at DESC").fetchall()]

def get(c, ident):
    r=c.execute("SELECT content FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone()
    return json.loads(r["content"]) if r else None

def save(c, value):
    value=validate(value)
    ident=str(value.get("id") or secrets.token_hex(16))
    # Never trust client-provided identifiers for food composition.
    known={r["id"] for r in c.execute("SELECT id FROM v2_food_library WHERE active=1").fetchall()}
    if any(f["id"] not in known for m in value["meals"] for o in m["options"] for f in o["foods"]): raise ValueError("unknown_food")
    now=int(time.time())
    if c.execute("SELECT id FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone():
        c.execute("UPDATE v2_food_plan_drafts SET name=?,content=?,updated_at=? WHERE id=?",(value["name"],json.dumps(value),now,ident))
    else:
        c.execute("INSERT INTO v2_food_plan_drafts(id,name,content,created_at,updated_at) VALUES (?,?,?,?,?)",(ident,value["name"],json.dumps(value),now,now))
    return ident


def delete(c, ident):
    result=c.execute("DELETE FROM v2_food_plan_drafts WHERE id=?",(ident,))
    return result.rowcount > 0
