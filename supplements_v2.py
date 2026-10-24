"""Supplementation MVP: structured published routine plus date-specific overrides."""
import json
from datetime import date
def initialize(c):
 c.execute("""CREATE TABLE IF NOT EXISTS v2_supplements(
 athlete_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL DEFAULT '[]',
 overrides_json TEXT NOT NULL DEFAULT '{}')""")
def read(c,aid):
 row=c.execute("SELECT plan_json,overrides_json FROM v2_supplements WHERE athlete_id=?",(aid,)).fetchone()
 return {"plan":json.loads(row["plan_json"]),"overrides":json.loads(row["overrides_json"])} if row else {"plan":[],"overrides":{}}
def validate(items):
 if not isinstance(items,list) or len(items)>120:raise ValueError("invalid_items")
 result=[]
 for item in items:
  if not isinstance(item,dict):raise ValueError("invalid_item")
  name=item.get("name","");dose=item.get("dose","");moment=item.get("moment","");rule=item.get("rule","daily")
  if any(not isinstance(v,str) for v in (name,dose,moment,rule)):raise ValueError("invalid_item")
  if not name.strip() or not dose.strip() or len(name)>120 or len(dose)>120 or len(moment)>120:raise ValueError("invalid_item")
  if rule not in ("daily","match","training","md-1"):raise ValueError("invalid_rule")
  result.append({"name":name.strip(),"dose":dose.strip(),"moment":moment.strip(),"rule":rule,"note":str(item.get("note",""))[:400]})
 return result
def save(c,aid,payload):
 if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?",(aid,)).fetchone():raise ValueError("not_found")
 old=read(c,aid);plan=validate(payload.get("plan",old["plan"]))
 overrides=payload.get("overrides",old["overrides"])
 if not isinstance(overrides,dict) or len(overrides)>370:raise ValueError("invalid_overrides")
 clean={}
 for day,entry in overrides.items():
  try:date.fromisoformat(day)
  except (TypeError,ValueError):raise ValueError("invalid_date")
  if not isinstance(entry,dict):raise ValueError("invalid_override")
  clean[day]={"add":validate(entry.get("add",[])),"remove":[str(x)[:120] for x in entry.get("remove",[])][:120]}
 c.execute("""INSERT INTO v2_supplements(athlete_id,plan_json,overrides_json) VALUES(?,?,?)
 ON CONFLICT(athlete_id) DO UPDATE SET plan_json=excluded.plan_json,overrides_json=excluded.overrides_json""",(aid,json.dumps(plan,ensure_ascii=False),json.dumps(clean,ensure_ascii=False)))
 return {"plan":plan,"overrides":clean}
def days(c,aid,start,end,matches,events):
 data=read(c,aid);match_dates={m["match_date"] for m in matches};train_dates={e["event_date"] for e in events if e.get("kind")=="training"}
 from datetime import timedelta
 result={}
 d=date.fromisoformat(start);last=date.fromisoformat(end)
 if (last-d).days>62 or d>last:raise ValueError("invalid_range")
 while d<=last:
  day=d.isoformat();tomorrow=(d+timedelta(days=1)).isoformat()
  items=[x for x in data["plan"] if x["rule"]=="daily" or (x["rule"]=="match" and day in match_dates) or (x["rule"]=="training" and day in train_dates) or (x["rule"]=="md-1" and tomorrow in match_dates)]
  override=data["overrides"].get(day,{})
  removed=set(override.get("remove",[]))
  items=[x for x in items if x["name"] not in removed]+override.get("add",[])
  result[day]=items
  d+=timedelta(days=1)
 return result
