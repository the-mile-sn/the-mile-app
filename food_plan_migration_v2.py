"""One-time, idempotent import of active published snapshots into isolated editor drafts.
Never modifies published plans or food library. Source lines without safe matches remain notes.
"""
import hashlib
import json
import re
import time
import unicodedata

COLORS = {"orange":"Plano laranja","yellow":"Plano amarelo","blue":"Plano azul","green":"Plano verde","vp":"Plano verde preparação"}
MEALS = {"breakfast":"Pequeno almoço","lunch":"Almoço","snack":"Lanche","supper":"Ceia","pre_training":"Pré treino","post_training":"Pós treino","pre_match":"Pré jogo","post_match":"Pós jogo","intra_match":"Intra Jogo"}

def norm(value):
    return " ".join(unicodedata.normalize("NFKC",str(value or "")).casefold().split())

def grams(value):
    text=str(value or "").strip()
    match=re.search(r"(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\b",text,re.I)
    if not match: return None
    number=float(match.group(1).replace(",","."))
    return number if 0<number<=100000 else None

def import_drafts(c):
    import food_plan_drafts_v2
    foods=c.execute("SELECT id,display_name,base_name,variant FROM v2_food_library WHERE active=1").fetchall()
    by_display={};by_base={}
    for f in foods:
        by_display.setdefault(norm(f["display_name"]),[]).append(f)
        by_base.setdefault(norm(f["base_name"]),[]).append(f)
    links={r["athlete_id"]:r for r in c.execute("""
        SELECT l.athlete_id,u.id AS player_id,u.name AS player_name
        FROM v2_player_links l JOIN users u ON u.id=l.user_id AND u.role='player'
    """).fetchall()}
    rows=c.execute("""SELECT p.id,p.athlete_id,p.color,p.snapshot_json
        FROM v2_plan_publications p WHERE p.replaced_at IS NULL
        ORDER BY p.athlete_id,p.color""").fetchall()
    stats={"sources":len(rows),"created":0,"existing":0,"unlinked":0,"unsupported":0,"foods":0,"notes":0}
    for row in rows:
        link=links.get(row["athlete_id"])
        if not link:
            stats["unlinked"]+=1
            continue
        plan_type=COLORS.get(row["color"])
        if not plan_type:
            stats["unsupported"]+=1
            continue
        ident=hashlib.sha256(("editor-import-v1:"+row["id"]).encode()).hexdigest()[:32]
        if c.execute("SELECT 1 FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone():
            stats["existing"]+=1
            continue
        snapshot=json.loads(row["snapshot_json"])
        meals=[]
        for group in snapshot.get("groups",[]):
            options=[]
            for original in group.get("options",[]):
                foods_out=[];notes=[];order=[]
                for item in original.get("items",[]):
                    kind=item.get("kind")
                    if kind=="title": continue
                    name=str(item.get("name") or "").strip()
                    quantity=str(item.get("quantity") or "").strip()
                    matches=by_display.get(norm(name),[]) or by_base.get(norm(name),[])
                    if len(matches)>1 and norm(name) in ("ovo","abacate","banana"):
                        edible=[f for f in matches if f["variant"]!="gross" and any(t in norm(f["display_name"]) for t in ("descascad","edivel","comestivel","sem casca","polpa"))]
                        if len(edible)==1: matches=edible
                    amount=grams(quantity)
                    if kind=="food" and len(matches)==1 and amount:
                        foods_out.append({"id":matches[0]["id"],"grams":amount})
                        order.append({"type":"food","index":len(foods_out)-1})
                        stats["foods"]+=1
                    else:
                        raw=str(item.get("text") or "").strip()
                        note=raw or " ".join(x for x in (quantity,name) if x)
                        if note:
                            notes.append(note[:4000])
                            order.append({"type":"note","index":len(notes)-1})
                            stats["notes"]+=1
                options.append({"title":str(original.get("title") or "")[:160],"foods":foods_out,"notes":notes,"order":order})
            if not options: continue
            for meal_key in group.get("meals",[]):
                meal_name=MEALS.get(meal_key)
                if meal_name: meals.append({"name":meal_name,"options":options})
        if not meals: 
            stats["unsupported"]+=1
            continue
        value={"id":ident,"name":str(link["player_name"])+" - "+plan_type,
            "player_id":str(link["player_id"]),"player_name":str(link["player_name"]),
            "plan_type":plan_type,"meals":meals}
        try:
            food_plan_drafts_v2.save(c,value)
            stats["created"]+=1
        except ValueError:
            stats["unsupported"]+=1
    return stats
