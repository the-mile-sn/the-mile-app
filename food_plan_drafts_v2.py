"""Isolated draft meal-plan editor. No published plan writes."""
import json, secrets, time

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_food_plan_drafts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
        created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    )""")

PLAN_TYPES = ("Plano laranja", "Plano amarelo", "Plano azul", "Plano verde", "Plano verde preparação", "Plano Peri-jogo", "Plano Peri-treino", "Plano geral")

def validate(value):
    if not isinstance(value,dict): raise ValueError("invalid_plan")
    name=str(value.get("name") or "").strip()
    meals=value.get("meals")
    if not name or len(name)>160 or not isinstance(meals,list) or len(meals)>40: raise ValueError("invalid_plan")
    plan_type=str(value.get("plan_type") or "").strip()
    if plan_type and plan_type not in PLAN_TYPES: raise ValueError("invalid_plan_type")
    player_id=str(value.get("player_id") or "").strip()
    player_name=str(value.get("player_name") or "").strip()
    if len(player_id)>100 or len(player_name)>160: raise ValueError("invalid_player")
    origin=str(value.get("origin") or "").strip()
    if origin not in ("", "json_import"): raise ValueError("invalid_origin")
    clean=[]
    for meal in meals:
        if not isinstance(meal,dict) or not isinstance(meal.get("options"),list) or not 1<=len(meal["options"])<=30: raise ValueError("invalid_meal")
        meal_title=str(meal.get("name") or "").strip()
        if not meal_title or len(meal_title)>120: raise ValueError("invalid_meal")
        options=[]
        for option in meal["options"]:
            if not isinstance(option,dict) or not isinstance(option.get("foods"),list) or len(option["foods"])>100: raise ValueError("invalid_option")
            foods=[]
            for food in option["foods"]:
                if not isinstance(food,dict): raise ValueError("invalid_food")
                kind=str(food.get("kind") or "food").strip()
                if kind not in ("food","supplement"): raise ValueError("invalid_food_kind")
                fid=str(food.get("id") or "").strip()
                grams_raw=food.get("grams")
                if grams_raw is None or grams_raw == "":
                    grams=None
                else:
                    try: grams=float(grams_raw)
                    except (TypeError,ValueError): raise ValueError("invalid_quantity")
                    import math
                    if not math.isfinite(grams) or not 0<grams<=100000: raise ValueError("invalid_quantity")
                if kind=="food" and not fid: raise ValueError("invalid_food")
                if kind=="supplement" and fid: raise ValueError("invalid_supplement")
                label=str(food.get("label") or "").strip()
                if len(label)>240 or (kind=="supplement" and not label): raise ValueError("invalid_food_label")
                alternative_to=food.get("alternative_to")
                if alternative_to is not None:
                    if type(alternative_to) is not int or not 0<=alternative_to<len(foods): raise ValueError("invalid_alternative")
                    if foods[alternative_to].get("kind","food")!="food" or kind!="food": raise ValueError("invalid_alternative")
                item={"id":fid,"grams":grams}
                if kind=="supplement": item.update({"kind":"supplement","label":label})
                if alternative_to is not None: item["alternative_to"]=alternative_to
                foods.append(item)
            notes=option.get("notes",[])
            if not isinstance(notes,list) or len(notes)>100: raise ValueError("invalid_notes")
            notes=[str(n).strip() for n in notes]
            if any(len(n)>4000 for n in notes): raise ValueError("invalid_note")
            title=str(option.get("title") or "").strip()
            if len(title)>160: raise ValueError("invalid_option_title")
            order=option.get("order")
            if order is None:
                order=[{"type":"note","index":i} for i in range(len(notes))]+[{"type":"food","index":i} for i in range(len(foods))]
            if not isinstance(order,list) or len(order)!=len(notes)+len(foods): raise ValueError("invalid_order")
            expected={("note",i) for i in range(len(notes))}|{("food",i) for i in range(len(foods))}
            try: actual=[(item["type"],item["index"]) for item in order]
            except (TypeError,KeyError): raise ValueError("invalid_order")
            if any(type(i) is not int for _,i in actual) or len(set(actual))!=len(actual) or set(actual)!=expected: raise ValueError("invalid_order")
            options.append({"title":title,"foods":foods,"notes":notes,"order":order})
        clean.append({"name":meal_title,"options":options})
    return {"id":str(value.get("id") or ""), "name":name,"plan_type":plan_type,"player_id":player_id,"player_name":player_name,"origin":origin,"meals":clean}

def list_drafts(c):
    rows=c.execute("SELECT id,name,content,created_at,updated_at FROM v2_food_plan_drafts ORDER BY updated_at DESC").fetchall()
    result=[]
    for row in rows:
        try: value=json.loads(row["content"])
        except (TypeError,ValueError): value={}
        player_id=str(value.get("player_id") or "").strip()
        plan_type=str(value.get("plan_type") or "").strip()
        result.append({"id":row["id"],"name":row["name"],"updated_at":row["updated_at"],"created_at":row["created_at"],"origin":str(value.get("origin") or ""),
                       "player_id":player_id,"player_name":str(value.get("player_name") or ""),
                       "plan_type":plan_type})
    return result

def get(c, ident):
    r=c.execute("SELECT content FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone()
    if not r: return None
    value=json.loads(r["content"])
    value["id"]=ident
    return value

def save(c, value):
    value=validate(value)
    ident=str(value.get("id") or secrets.token_hex(16))
    # Never trust client-provided identifiers for food composition.
    known={r["id"] for r in c.execute("SELECT id FROM v2_food_library WHERE active=1").fetchall()}
    if any(f["id"] not in known for m in value["meals"] for o in m["options"] for f in o["foods"] if f.get("kind","food")=="food"): raise ValueError("unknown_food")
    if value["player_id"]:
        player=c.execute("SELECT name FROM users WHERE id=? AND role='player'",(value["player_id"],)).fetchone()
        if not player: raise ValueError("unknown_player")
        value["player_name"]=player["name"]
    else: value["player_name"]=""
    if not value["player_id"] or not value["plan_type"]: raise ValueError("missing_player_or_type")
    value["name"]=value["player_name"]+" - "+value["plan_type"]
    now=int(time.time())
    if c.execute("SELECT id FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone():
        c.execute("UPDATE v2_food_plan_drafts SET name=?,content=?,updated_at=? WHERE id=?",(value["name"],json.dumps(value),now,ident))
    else:
        c.execute("INSERT INTO v2_food_plan_drafts(id,name,content,created_at,updated_at) VALUES (?,?,?,?,?)",(ident,value["name"],json.dumps(value),now,now))
    return ident


def delete(c, ident):
    result=c.execute("DELETE FROM v2_food_plan_drafts WHERE id=?",(ident,))
    return result.rowcount > 0
