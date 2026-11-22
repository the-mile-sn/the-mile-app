"""Read-only grouped PT/EN translation catalog for content shown in apps.

Every list item represents ONE food, dish, recipe, category or supplement.
Secondary visible fields are reviewed inside that record, never listed as
independent foods. Internal food notes are intentionally excluded.
"""
import hashlib
import app_translation_admin_v2 as review
import app_translation_sources_v2 as sources

MAX_SCAN=25000
MAX_RECORDS=10000
STATUSES=frozenset(("missing","legacy_review","pending","approved","outdated"))
GROUPS=(
 ("food","Alimentos"),
 ("dish","Pratos"),
 ("recipe","Receitas"),
 ("recipe_category","Categorias de receitas"),
 ("supplement","Suplementação"),
)

def _hash(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def _status(field,existing):
    if existing is None:
        return "legacy_review" if field["legacy_en"].strip() else "missing"
    if existing["source_hash"]!=_hash(field["source_text"]):
        return "outdated"
    return existing["status"] if existing["status"] in ("pending","approved") else "missing"

def _table_exists(c,table):
    if table not in ("v2_food_plan_editor_publications",):
        raise ValueError("invalid_table_name")
    if hasattr(c,"conn"):
        return c.execute("""SELECT 1 FROM information_schema.tables
           WHERE table_schema=current_schema() AND table_name=?""",(table,)).fetchone() is not None
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                     (table,)).fetchone() is not None

def _entries(c):
    existing={}
    for r in c.execute("""SELECT entity_kind,entity_id,field_path,language,
                                  source_hash,translated_text,status
                           FROM v2_content_translations WHERE language='en'""").fetchall():
        existing[(r["entity_kind"],r["entity_id"],r["field_path"])]=r
    entries=[]
    field_count=0
    for kind,label in GROUPS:
        rows=c.execute(sources.SQL[kind]).fetchall()
        if len(rows)>MAX_RECORDS:
            raise ValueError("translation_catalog_record_limit")
        for row in rows:
            all_fields=[]
            for f in sources.fields_for(kind,row):
                old=existing.get((kind,row["id"],f["field_path"]))
                state=_status(f,old)
                all_fields.append({
                    "field_path":f["field_path"],"field_label":f["field_label"],
                    "source_text":f["source_text"],"state":state,
                    "legacy_candidate":f["legacy_en"].strip() if state=="legacy_review" else "",
                    "translation_text":old["translated_text"] if old is not None else "",
                })
            if not all_fields:continue
            field_count+=len(all_fields)
            if field_count>MAX_SCAN:raise ValueError("translation_catalog_scan_limit")
            title=all_fields[0]["source_text"]
            category=row["category"] if kind in ("food","dish") else label
            entries.append({
                "entity_kind":kind,"entity_id":row["id"],"field_path":all_fields[0]["field_path"],
                "source_text":title,"category":category or label,
                "fields":all_fields,
                "state":all_fields[0]["state"],
                "legacy_candidate":all_fields[0]["legacy_candidate"],
                "translation_text":all_fields[0]["translation_text"]
            })
    return entries

def overview(c,actor):
    review._admin(c,actor)
    entries=_entries(c)
    libraries=[]
    status_total={name:0 for name in sorted(STATUSES)}
    for kind,label in GROUPS:
        records=[e for e in entries if e["entity_kind"]==kind]
        statuses={name:0 for name in sorted(STATUSES)}
        fields=[f for r in records for f in r["fields"]]
        for field in fields:
            statuses[field["state"]]+=1
            status_total[field["state"]]+=1
        libraries.append({
            "kind":kind,"label":label,"integrated":True,
            "record_count":len(records),"field_count":len(fields),
            "statuses":statuses,
        })
    # Published plan fields use version-bound refs, separate from generic library IDs.
    import app_translation_plans_v2 as plan_reviews
    publications = (plan_reviews.list_publications(c,actor)["items"]
                    if _table_exists(c,"v2_food_plan_editor_publications") else [])
    plan_states = {name:0 for name in sorted(STATUSES)}
    for item in publications:
        for key, count in item["statuses"].items():
            plan_states[key] += count
            status_total[key] += count
    libraries.append({
        "kind":"plan","label":"Planos alimentares publicados",
        "integrated":True,"record_count":len(publications),
        "field_count":sum(p["field_count"] for p in publications),
        "statuses":plan_states
    })
    return {
        "language":"en","libraries":libraries,"statuses":status_total,
        "supported_fields":sum(r["field_count"] for r in libraries if r["integrated"]),
        "scope":"only_visible_content_fields","legacy_candidates_require_review":True
    }

def list_fields(c,actor,*,entity_kind="food",status="all",query="",page=1,page_size=25):
    review._admin(c,actor)
    if entity_kind not in sources.KINDS:raise ValueError("invalid_catalog_library")
    if status!="all" and status not in STATUSES:
        raise ValueError("invalid_catalog_status")
    if not isinstance(query,str) or len(query)>120:raise ValueError("invalid_catalog_query")
    if type(page)!=int or not 1<=page<=10000:raise ValueError("invalid_catalog_page")
    if type(page_size)!=int or not 1<=page_size<=50:
        raise ValueError("invalid_catalog_page_size")
    needle=query.strip().casefold()
    items=[]
    for item in _entries(c):
        if item["entity_kind"]!=entity_kind:continue
        eligible=[f for f in item["fields"] if status=="all" or f["state"]==status]
        if not eligible:continue
        if needle and not (
          needle in item["category"].casefold() or
          any(needle in (f["source_text"]+" "+f["legacy_candidate"]+
                         " "+f["translation_text"]).casefold() for f in item["fields"])):
            continue
        items.append(item)
    items.sort(key=lambda r:(r["source_text"].casefold(),r["entity_id"]))
    total=len(items)
    start=(page-1)*page_size
    return {"language":"en","library":entity_kind,
            "page":page,"page_size":page_size,"total":total,
            "items":items[start:start+page_size]}
