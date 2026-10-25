"""Supplementation MVP: structured published routine plus date-specific overrides."""
import json
from datetime import date
def initialize(c):
 library_init(c)
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
  if rule not in ("daily","match","training","md-1","md+1"):raise ValueError("invalid_rule")
  normalized={"name":name.strip(),"dose":dose.strip(),"moment":moment.strip(),"rule":rule,"note":str(item.get("note",""))[:400], "timing_text":str(item.get("timing_text",""))[:240], "library_id":str(item.get("library_id",""))[:64]}
  prescriptions=item.get("prescriptions")
  if prescriptions is not None:
   if not isinstance(prescriptions,list) or not 1<=len(prescriptions)<=12:raise ValueError("invalid_prescriptions")
   entries=[]
   for p in prescriptions:
    if not isinstance(p,dict):raise ValueError("invalid_prescriptions")
    pr=p.get("rule");pd=p.get("dose");pm=p.get("moment","");pt=p.get("timing_text","");pn=p.get("note","")
    if pr not in ("daily","training","match","md-1","md+1") or any(not isinstance(v,str) for v in (pd,pm,pt,pn)) or not pd.strip() or len(pd)>120 or len(pm)>120 or len(pt)>240 or len(pn)>400:raise ValueError("invalid_prescriptions")
    entries.append({"rule":pr,"dose":pd.strip(),"moment":pm.strip(),"timing_text":pt.strip(),"note":pn.strip()})
   normalized["prescriptions"]=entries
  result.append(normalized)
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
  day=d.isoformat();tomorrow=(d+timedelta(days=1)).isoformat();yesterday=(d-timedelta(days=1)).isoformat()
  def applies(rule):
   return rule=="daily" or (rule=="match" and day in match_dates) or (rule=="training" and day in train_dates) or (rule=="md-1" and tomorrow in match_dates) or (rule=="md+1" and yesterday in match_dates)
  items=[]
  for item in data["plan"]:
   for entry in item.get("prescriptions") or [item]:
    if applies(entry["rule"]):
     items.append({**item,**entry, "prescriptions":None})
  override=data["overrides"].get(day,{})
  removed=set(override.get("remove",[]))
  items=[x for x in items if x["name"] not in removed]+override.get("add",[])
  result[day]=[dict(x,display_moment=x.get("timing_text") or ("Almoço ou jantar" if x["moment"]=="lunch_or_dinner" else "")) for x in items]
  d+=timedelta(days=1)
 return result

def library_init(c):
 c.execute("""CREATE TABLE IF NOT EXISTS v2_supplement_library(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, dose TEXT NOT NULL, moment TEXT NOT NULL,
 rule TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', timing_text TEXT NOT NULL DEFAULT '',
 image_data TEXT NOT NULL DEFAULT '')""")
 try:c.execute("ALTER TABLE v2_supplement_library ADD COLUMN prescriptions_json TEXT NOT NULL DEFAULT '[]'")
 except Exception as e:
  if "duplicate column" not in str(e).lower():raise
def library_list(c):
 return [dict(dict(row),prescriptions=json.loads(row["prescriptions_json"])) for row in c.execute("SELECT id,name,dose,moment,rule,note,timing_text,prescriptions_json,CASE WHEN image_data='' THEN 0 ELSE 1 END AS has_image FROM v2_supplement_library ORDER BY name").fetchall()]
def library_save(c,payload):
 import secrets
 name=str(payload.get("name","")).strip()
 data=validate([{"name":name,"dose":payload.get("dose",""),"moment":payload.get("moment",""),"rule":payload.get("rule","daily"),"note":payload.get("note",""),"timing_text":payload.get("timing_text","")}])[0]
 prescriptions=validate([{**data,"prescriptions":payload["prescriptions"]}])[0].get("prescriptions",[]) if "prescriptions" in payload else []
 ident=str(payload.get("id") or secrets.token_hex(12))
 if not all(ch in "0123456789abcdef" for ch in ident) or len(ident)>64:raise ValueError("invalid_id")
 image=payload.get("image_data",None)
 if image is not None:
  import base64
  if not isinstance(image,str) or len(image)>400000:raise ValueError("invalid_image")
  try:
   binary=base64.b64decode(image,validate=True)
   if binary and not (binary.startswith(b"\x89PNG\r\n\x1a\n") or binary.startswith(b"\xff\xd8\xff") or binary.startswith(b"RIFF") and binary[8:12]==b"WEBP"):raise ValueError("invalid_image")
  except Exception:raise ValueError("invalid_image")
  existing=library_image(c,ident)
  if not image and existing:image=existing
 else:image=library_image(c,ident)
 c.execute("""INSERT INTO v2_supplement_library(id,name,dose,moment,rule,note,timing_text,image_data,prescriptions_json)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
 name=excluded.name,dose=excluded.dose,moment=excluded.moment,rule=excluded.rule,
 note=excluded.note,timing_text=excluded.timing_text,image_data=excluded.image_data,prescriptions_json=excluded.prescriptions_json""",
 (ident,data["name"],data["dose"],data["moment"],data["rule"],data["note"],data["timing_text"],image or "",json.dumps(prescriptions,ensure_ascii=False)))
 return ident
def library_image(c,ident):
 row=c.execute("SELECT image_data FROM v2_supplement_library WHERE id=?",(ident,)).fetchone()
 return row["image_data"] if row else ""
def library_get(c,ident):
 row=c.execute("SELECT id,name,dose,moment,rule,note,timing_text,prescriptions_json FROM v2_supplement_library WHERE id=?",(ident,)).fetchone()
 return dict(dict(row),prescriptions=json.loads(row["prescriptions_json"])) if row else None

def library_bulk_zip(c, encoded, commit=False):
 import base64, io, zipfile
 try:
  binary=base64.b64decode(encoded,validate=True)
  if len(binary)>5*1024*1024:raise ValueError("invalid_package")
  with zipfile.ZipFile(io.BytesIO(binary)) as z:
   if len(z.namelist())>130 or sum(x.file_size for x in z.infolist())>10*1024*1024:raise ValueError("invalid_package")
   manifest=json.loads(z.read("manifest.json"))
   if manifest.get("version")!=1:raise ValueError("invalid_package")
   items=manifest["items"]
   if not isinstance(items,list) or len(items)>100:raise ValueError("invalid_package")
   existing={r["name"].strip().casefold():r["id"] for r in library_list(c)}
   preview=[];saved=0
   for item in items:
    name=str(item["name"]).strip()
    if not name or len(name)>120:raise ValueError("invalid_package")
    found=existing.get(name.casefold())
    preview.append({"name":name,"exists":bool(found),"requires_review":bool(item.get("requires_review"))})
    if not commit or found:continue
    dose=str(item.get("dose_original","")).splitlines()[0].strip()[:120]
    image_name=item.get("image")
    image=z.read(image_name) if image_name else b""
    if len(image)>250000:raise ValueError("invalid_package")
    source_timing=str(item.get("timing_original","")).strip()
    instructions=str(item.get("instructions_original","")).strip()
    frequency=item.get("frequency_candidate")
    # Event-based and conditional protocols are stored as library references,
    # never activated as automatic daily supplementation before clinical review.
    timing_text=source_timing[:240]
    note=(("Frequência original: "+str(item.get("dose_original",""))+"\\n") if frequency!="daily" else "")+instructions
    library_save(c,{"name":name,"dose":dose or "Conforme protocolo","moment":"","rule":"daily","timing_text":timing_text,"note":note[:400],"image_data":base64.b64encode(image).decode("ascii")})
    saved+=1
   return {"total":len(items),"existing":sum(x["exists"] for x in preview),"to_add":sum(not x["exists"] for x in preview),"saved":saved,"review":sum(x["requires_review"] for x in preview),"items":preview}
 except (KeyError,TypeError,zipfile.BadZipFile,UnicodeDecodeError,base64.binascii.Error):
  raise ValueError("invalid_package")
