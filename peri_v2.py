"""Peri-training/peri-match prescriptions, with reviewed PDF imports and immutable releases."""
import json
import math
import re
import secrets
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import plan_import_v2

KINDS = ("training", "match")
PHASES = ("pre", "post")
KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")
MAP = {
    "pré-treino": ["pre"], "pre-treino": ["pre"], "pré treino": ["pre"], "pre treino": ["pre"],
    "pós-treino": ["post"], "pos-treino": ["post"], "pós treino": ["post"], "pos treino": ["post"],
    "pré-jogo": ["pre"], "pre-jogo": ["pre"], "pré jogo": ["pre"], "pre jogo": ["pre"],
    "intra-jogo": ["pre"], "intra jogo": ["pre"], "intrajogo": ["pre"],
    "pós-jogo": ["post"], "pos-jogo": ["post"], "pós jogo": ["post"], "pos jogo": ["post"],
}
LABELS = {"training": {"pre": "Pré-treino", "post": "Pós-treino"},
          "match": {"pre": "Intra-jogo", "post": "Pós-jogo"}}

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_peri_imports(
        id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        kind TEXT NOT NULL, filename TEXT NOT NULL, status TEXT NOT NULL,
        extracted_json TEXT NOT NULL, created_at BIGINT NOT NULL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_peri_publications(
        id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        kind TEXT NOT NULL, source_import_id TEXT NOT NULL REFERENCES v2_peri_imports(id),
        snapshot_json TEXT NOT NULL, published_at BIGINT NOT NULL,
        published_by TEXT NOT NULL, replaced_at BIGINT)""")
    c.execute("""CREATE INDEX IF NOT EXISTS v2_peri_active ON v2_peri_publications(athlete_id,kind,replaced_at)""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_match_peri_overrides(
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id), match_id TEXT NOT NULL,
        phase TEXT NOT NULL, state TEXT NOT NULL,
        PRIMARY KEY(athlete_id,match_id,phase))""")

def _check_kind(kind):
    if kind not in KINDS:
        raise ValueError("invalid_kind")

def _map_for(kind):
    if kind == "training":
        return {k:v for k,v in MAP.items() if "treino" in k}
    return {k:v for k,v in MAP.items() if "jogo" in k}

def list_imports(c, athlete_id):
    records=c.execute("""SELECT id,kind,filename,status,created_at FROM v2_peri_imports
                     WHERE athlete_id=? ORDER BY created_at DESC""",(athlete_id,)).fetchall()
    return [dict(r) for r in records]

def save_import(c, athlete_id, kind, filename, pdf):
    _check_kind(kind)
    if not isinstance(filename,str) or len(filename)>180 or not filename.lower().endswith(".pdf"):
        raise ValueError("invalid_file")
    if not isinstance(pdf,bytes) or not pdf.startswith(b"%PDF-") or len(pdf)>3*1024*1024:
        raise ValueError("invalid_pdf")
    if not c.execute("SELECT 1 FROM v2_athletes WHERE id=?",(athlete_id,)).fetchone():
        return None
    try:
        result=plan_import_v2.extract_plan(pdf, _map_for(kind))
    except Exception as exc:
        raise ValueError("invalid_pdf_structure") from exc
    phases={x for g in result["groups"] for x in g["meals"]}
    if not phases.issubset(set(PHASES)) or not phases:
        raise ValueError("missing_peri_headings")
    for group in result["groups"]:
        for option in group["options"]:
            option["reviewed"]=False
            option["title"]=option.get("title","")
    identity=secrets.token_hex(16)
    c.execute("""INSERT INTO v2_peri_imports(id,athlete_id,kind,filename,status,extracted_json,created_at)
                 VALUES(?,?,?,?,?,?,?)""",(identity,athlete_id,kind,filename,"draft",json.dumps(result,ensure_ascii=False),int(time.time())))
    return {"id":identity,"kind":kind,"filename":filename,"status":"draft","extracted":result}

def get_import(c,athlete_id,identifier):
    row=c.execute("SELECT * FROM v2_peri_imports WHERE id=? AND athlete_id=?",(identifier,athlete_id)).fetchone()
    if not row:return None
    doc=dict(row);doc["extracted"]=json.loads(doc.pop("extracted_json"))
    return doc

def _groups_from_published_snapshot(c,athlete_id,kind):
    """Recover editable options from the immutable active release, without writing to it."""
    row=c.execute("""SELECT snapshot_json FROM v2_peri_publications
                     WHERE athlete_id=? AND kind=? AND replaced_at IS NULL
                     ORDER BY published_at DESC LIMIT 1""",(athlete_id,kind)).fetchone()
    if not row:return []
    snapshot=json.loads(row["snapshot_json"])
    if not isinstance(snapshot,dict):raise ValueError("invalid_published_plan")
    groups=[]
    for phase in PHASES:
        options=snapshot.get(phase,[])
        if not isinstance(options,list) or len(options)>80:raise ValueError("invalid_published_plan")
        if not options:continue
        restored=[]
        for number,option in enumerate(options,1):
            if not isinstance(option,dict):raise ValueError("invalid_published_plan")
            items=option.get("items",[])
            if not isinstance(items,list) or len(items)>80:raise ValueError("invalid_published_plan")
            lines=[]
            timings=[]
            for item in items:
                if not isinstance(item,dict):raise ValueError("invalid_published_plan")
                if item.get("kind")=="food":
                    line=" ".join(str(item.get(k) or "").strip() for k in ("quantity","name")).strip()
                else:
                    line=str(item.get("text") or "").strip()
                if not line:continue
                lines.append(line)
                timings.append(str(item.get("timing") or ""))
            editable={"number":number,"title":str(option.get("title") or ""),
                      "totals":option.get("totals"),
                      "items":items,"lines":lines,"reviewed":False}
            if kind=="match" and phase=="pre":editable["timings"]=timings
            restored.append(editable)
        groups.append({"heading":LABELS[kind][phase],"meals":[phase],"options":restored})
    return groups


def restore_empty_draft(c,athlete_id,identifier):
    """Restore a blank draft on explicit request; preserve the active publication."""
    doc=get_import(c,athlete_id,identifier)
    if doc is None:return None
    if doc["status"]!="draft":raise ValueError("not_editable")
    if any(group.get("options") for group in doc["extracted"].get("groups",[])):
        raise ValueError("draft_has_options")
    restored=_groups_from_published_snapshot(c,athlete_id,doc["kind"])
    if not restored:raise ValueError("no_published_options")
    doc["extracted"]["groups"]=restored
    c.execute("""UPDATE v2_peri_imports SET extracted_json=?
                 WHERE id=? AND athlete_id=? AND status='draft'""",
              (json.dumps(doc["extracted"],ensure_ascii=False),identifier,athlete_id))
    return get_import(c,athlete_id,identifier)


def copy_as_draft(c,athlete_id,identifier):
    """Create an editable copy; the already published release stays immutable."""
    doc=get_import(c,athlete_id,identifier)
    if doc is None:return None
    if doc["status"]=="draft":return doc
    identity=secrets.token_hex(16)
    extracted=json.loads(json.dumps(doc["extracted"],ensure_ascii=False))
    if not any(group.get("options") for group in extracted.get("groups",[])):
        recovered=_groups_from_published_snapshot(c,athlete_id,doc["kind"])
        if recovered:extracted["groups"]=recovered
    c.execute("""INSERT INTO v2_peri_imports(id,athlete_id,kind,filename,status,extracted_json,created_at)
                 VALUES(?,?,?,?,?,?,?)""",(identity,athlete_id,doc["kind"],doc["filename"],"draft",json.dumps(extracted,ensure_ascii=False),int(time.time())))
    return get_import(c,athlete_id,identity)

def _validate_totals(totals):
    if not isinstance(totals,dict) or set(totals)!=set(KEYS):
        raise ValueError("invalid_totals")
    clean={}
    for key in KEYS:
        value=totals[key]
        if isinstance(value,bool) or not isinstance(value,(str,int,float)):
            raise ValueError("invalid_totals")
        try: n=float(str(value).replace(",","."))
        except ValueError:raise ValueError("invalid_totals")
        if not math.isfinite(n) or n<0 or n>10000:
            raise ValueError("invalid_totals")
        clean[key]=str(n)
    return clean

def update_option(c,athlete_id,identifier,group_index,option_index,payload):
    doc=get_import(c,athlete_id,identifier)
    if not doc:return None
    if doc["status"]!="draft":raise ValueError("not_editable")
    groups=doc["extracted"]["groups"]
    if (type(group_index)!=int or type(option_index)!=int
        or not 0<=group_index<len(groups)
        or not 0<=option_index<len(groups[group_index]["options"])):
        raise ValueError("invalid_option")
    if not isinstance(payload,dict):raise ValueError("invalid_option")
    totals=_validate_totals(payload.get("totals"))
    reviewed=payload.get("reviewed")
    if type(reviewed)!=bool:raise ValueError("invalid_review")
    title=payload.get("title","")
    if not isinstance(title,str) or len(title)>200:raise ValueError("invalid_title")
    lines=payload.get("lines")
    if not isinstance(lines,list) or len(lines)>80 or any(not isinstance(x,str) or len(x)>600 for x in lines):
        raise ValueError("invalid_lines")
    option=groups[group_index]["options"][option_index]
    option["totals"]=totals
    option["title"]=title.strip()
    timings=payload.get("timings")
    allowed={"","pre_warmup","pre_match","post_warmup","first_half","half_time","second_half","post_match","throughout"}
    if timings is not None:
        if not isinstance(timings,list) or len(timings)!=len(lines) or any(not isinstance(t,str) or t not in allowed for t in timings):
            raise ValueError("invalid_timings")
        if doc["kind"]!="match" or "pre" not in groups[group_index]["meals"]:
            raise ValueError("invalid_timings")
    option["lines"]=lines
    if timings is not None: option["timings"]=timings
    structured=[]
    for index,line in enumerate(lines):
        if not line.strip():continue
        item=plan_import_v2.structure_line(line)
        if timings is not None and timings[index]: item["timing"]=timings[index]
        structured.append(item)
    option["items"]=structured
    option["reviewed"]=reviewed
    c.execute("""UPDATE v2_peri_imports SET extracted_json=? WHERE id=? AND athlete_id=? AND status='draft'""",
              (json.dumps(doc["extracted"],ensure_ascii=False),identifier,athlete_id))
    return option


def add_option(c,athlete_id,identifier,group_index=None,phase=None):
    """Add an unreviewed option to a draft group, or restore a missing phase."""
    doc=get_import(c,athlete_id,identifier)
    if doc is None:return None
    if doc["status"]!="draft":raise ValueError("not_editable")
    groups=doc["extracted"]["groups"]
    if group_index is not None:
        if (type(group_index)!=int or not 0<=group_index<len(groups) or phase is not None):
            raise ValueError("invalid_option")
        group=groups[group_index]
    else:
        headings={"training":{"pre":"Pré-treino","post":"Pós-treino"},
                  "match":{"pre":"Intra-jogo","post":"Pós-jogo","pre_match":"Pré-jogo"}}
        if phase not in headings[doc["kind"]] or len(groups)>=80:
            raise ValueError("invalid_phase")
        internal_phase="pre" if phase=="pre_match" else phase
        group={"heading":headings[doc["kind"]][phase],"meals":[internal_phase],"options":[]}
        groups.append(group)
    options=group["options"]
    if len(options)>=80:raise ValueError("too_many_options")
    options.append({"number":len(options)+1,"title":"","totals":None,
                    "lines":[],"items":[],"reviewed":False})
    # Numbers are display labels, not stable database keys.
    for index,option in enumerate(options):option["number"]=index+1
    c.execute("UPDATE v2_peri_imports SET extracted_json=? WHERE id=? AND athlete_id=? AND status='draft'",
              (json.dumps(doc["extracted"],ensure_ascii=False),identifier,athlete_id))
    return get_import(c,athlete_id,identifier)


def delete_option(c,athlete_id,identifier,group_index,option_index):
    """Remove one complete draft option, leaving past publications untouched."""
    doc=get_import(c,athlete_id,identifier)
    if doc is None:return None
    if doc["status"]!="draft":raise ValueError("not_editable")
    groups=doc["extracted"]["groups"]
    if (type(group_index)!=int or type(option_index)!=int
        or not 0<=group_index<len(groups)
        or not 0<=option_index<len(groups[group_index]["options"])):
        raise ValueError("invalid_option")
    options=groups[group_index]["options"]
    options.pop(option_index)
    if not options:
        # An accidentally imported phase (e.g. Pre-jogo) must disappear.
        groups.pop(group_index)
    else:
        for index,option in enumerate(options):option["number"]=index+1
    c.execute("UPDATE v2_peri_imports SET extracted_json=? WHERE id=? AND athlete_id=? AND status='draft'",
              (json.dumps(doc["extracted"],ensure_ascii=False),identifier,athlete_id))
    return get_import(c,athlete_id,identifier)


def _snapshot(doc):
    groups=doc["extracted"]["groups"]
    if not groups:raise ValueError("missing_meals")
    entries={"pre":[],"post":[]}
    for group in groups:
        for phase in group["meals"]:
            if phase not in entries:raise ValueError("invalid_phase")
            for option in group["options"]:
                if option.get("reviewed") is not True:raise ValueError("review_incomplete")
                totals=_validate_totals(option.get("totals"))
                entries[phase].append({
                    "number":option.get("number"),"title":option.get("title",""),
                    "totals":totals,"items":option.get("items",[])
                })
    if not any(entries.values()):raise ValueError("empty_plan")
    return entries

def publish(c,athlete_id,identifier,actor):
    doc=get_import(c,athlete_id,identifier)
    if doc is None:return None
    if doc["status"]!="draft":raise ValueError("not_editable")
    snapshot=_snapshot(doc)
    now=int(time.time())
    publication_id=secrets.token_hex(16)
    c.execute("SAVEPOINT peri_release")
    try:
        c.execute("""UPDATE v2_peri_publications SET replaced_at=? WHERE athlete_id=? AND kind=? AND replaced_at IS NULL""",
                  (now,athlete_id,doc["kind"]))
        c.execute("""INSERT INTO v2_peri_publications
           (id,athlete_id,kind,source_import_id,snapshot_json,published_at,published_by,replaced_at)
           VALUES(?,?,?,?,?,?,?,NULL)""",
           (publication_id,athlete_id,doc["kind"],identifier,json.dumps(snapshot,ensure_ascii=False),now,actor))
        c.execute("UPDATE v2_peri_imports SET status='published' WHERE id=? AND athlete_id=?",(identifier,athlete_id))
        c.execute("RELEASE SAVEPOINT peri_release")
    except Exception:
        c.execute("ROLLBACK TO SAVEPOINT peri_release")
        c.execute("RELEASE SAVEPOINT peri_release")
        raise
    return {"id":publication_id,"kind":doc["kind"],"published_at":now}

def current(c,athlete_id):
    rows=c.execute("""SELECT kind,snapshot_json,published_at FROM v2_peri_publications
        WHERE athlete_id=? AND replaced_at IS NULL""",(athlete_id,)).fetchall()
    return {r["kind"]: {"options":json.loads(r["snapshot_json"]),"published_at":r["published_at"]} for r in rows}

def _options_for_day(c,athlete_id,kind,day,current_cache):
    today=datetime.now(ZoneInfo("Europe/Lisbon")).date().isoformat()
    if day>=today:
        entry=current_cache.get(kind)
        return entry["options"] if entry else {}
    end=datetime.fromisoformat(day).replace(hour=23,minute=59,second=59,tzinfo=ZoneInfo("Europe/Lisbon"))
    limit=int(end.timestamp())
    row=c.execute("""SELECT snapshot_json FROM v2_peri_publications
        WHERE athlete_id=? AND kind=? AND published_at<=? ORDER BY published_at DESC LIMIT 1""",
        (athlete_id,kind,limit)).fetchone()
    return json.loads(row["snapshot_json"]) if row else {}

def list_event_meals(c,athlete_id,start,end,events=None):
    if events is None:
        import events_v2
        events=events_v2.list_events(c,athlete_id,start,end)
    matches=c.execute("""SELECT m.id,m.match_date,m.match_time FROM v2_match_events m
      WHERE m.athlete_id=? AND m.match_date>=? AND m.match_date<=?""",(athlete_id,start,end)).fetchall()
    overrides=c.execute("SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?",
                       (athlete_id,)).fetchall()
    override_lookup={(row["match_id"],row["phase"]):row["state"] for row in overrides}
    combined=list(events)
    for row in matches:
        period="morning" if not row["match_time"] or row["match_time"]<"15:00" else "afternoon"
        combined.append({"id":row["id"],"event_date":row["match_date"],"kind":"match",
                         "session":period,"title":"Jogo","match_event":True,
                         "pre_override":override_lookup.get((row["id"],"pre"),"auto"),
                         "post_override":override_lookup.get((row["id"],"post"),"auto")})
    active=current(c,athlete_id)
    result=[]
    for event in combined:
        kind=event["kind"]
        if kind not in KINDS:continue
        by_phase=_options_for_day(c,athlete_id,kind,event["event_date"],active)
        for phase in PHASES:
            state=event.get(phase+"_override","auto")
            options=by_phase.get(phase,[])
            if state=="off" or not options:continue
            result.append({"event_id":event["id"],"event_date":event["event_date"],
                    "session":event["session"],"kind":kind,"phase":phase,
                    "title":LABELS[kind][phase],"options":options})
    return result

def update_match_override(c,athlete_id,match_id,phase,state):
    if phase not in PHASES or state not in ("auto","off","on"):
        raise ValueError("invalid_override")
    if not c.execute("SELECT 1 FROM v2_match_events WHERE athlete_id=? AND id=?",(athlete_id,match_id)).fetchone():
        return False
    c.execute("DELETE FROM v2_match_peri_overrides WHERE athlete_id=? AND match_id=? AND phase=?",
              (athlete_id,match_id,phase))
    if state!="auto":
        c.execute("INSERT INTO v2_match_peri_overrides(athlete_id,match_id,phase,state) VALUES(?,?,?,?)",
                  (athlete_id,match_id,phase,state))
    return True
