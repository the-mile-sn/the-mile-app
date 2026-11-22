"""Explicit food/dish name translation batch review with optimistic locking.

GET is read-only; the POST only accepts source/candidate hashes and IDs.
Dishes support reviewed legacy English names as well as pending proposals.
All original library rows, macros, and player/chef routes remain unchanged.
"""
import hashlib
import re
import time

import app_translation_admin_v2 as review
import app_translation_sources_v2 as sources
import app_translation_catalog_v2 as catalog
import content_translations_v2 as translations

MAX_PREVIEW=1200
MAX_BATCH=100
HASH=re.compile(r"^[0-9a-f]{64}$")
SCOPES={"food":"display_name","dish":"name_pt"}


class BatchError(Exception):
    def __init__(self,status,code):
        super().__init__(code)
        self.status=status
        self.code=code


def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def preview(c, actor, entity_kind="food"):
    """Show only PT/EN names currently eligible for explicit batch review."""
    review._admin(c,actor)
    if entity_kind not in SCOPES:
        raise BatchError(400,"invalid_translation_batch_library")
    field_path=SCOPES[entity_kind]
    pairs=[]
    for item in catalog._entries(c):
        if item["entity_kind"]!=entity_kind:
            continue
        for field in item["fields"]:
            state=field["state"]
            if (field["field_path"]!=field_path or
                    state!="pending" and
                    not (entity_kind=="dish" and state=="legacy_review")):
                continue
            portuguese=field["source_text"]
            english=(field["translation_text"] if state=="pending"
                     else field["legacy_candidate"])
            if not portuguese.strip() or not english.strip():
                continue
            pairs.append({
                "entity_id":item["entity_id"],
                "field_path":field_path,
                "source_text":portuguese,
                "translated_text":english,
                "review_state":state,
                "expected_source_hash":_sha(portuguese),
                "expected_candidate_hash":_sha(english),
            })
            if len(pairs)>MAX_PREVIEW:
                raise BatchError(413,"translation_batch_too_large")
    pairs.sort(key=lambda item:(item["source_text"].casefold(),item["entity_id"]))
    return {"entity_kind":entity_kind,"status":"awaiting_review","total":len(pairs),
            "items":pairs,"approved":False}


def _submit_legacy_if_missing(c, actor_id, ident, source, english):
    """Create a legacy-name proposal without overwriting a concurrent review.

    The same transaction later approves it. Both audit events roll back
    if any selected row conflicts.
    """
    key=("dish",ident,"name_pt","en")
    source_hash=_sha(source)
    timestamp=int(time.time())
    inserted=c.execute("""
        INSERT INTO v2_content_translations
            (entity_kind,entity_id,field_path,language,source_hash,
             translated_text,status,updated_at,updated_by,approved_at,approved_by)
        VALUES (?,?,?,?,?,?,'pending',?,?,NULL,NULL)
        ON CONFLICT (entity_kind,entity_id,field_path,language) DO NOTHING
        RETURNING entity_id
    """,(*key,source_hash,english,timestamp,actor_id)).fetchone()
    if inserted is None:
        raise BatchError(409,"translation_changed_during_review")
    translations._history(c,key,source_hash,english,"submitted",actor_id,timestamp)


def approve(c, actor, body):
    """Approve up to 100 explicitly chosen food/dish names as one transaction.

    A legacy dish can be proposed and approved *only* after the administrator
    reviewed the pair in GET preview and confirmed the selection.
    The server re-reads its canonical values; browser-supplied text is rejected.
    """
    actor_id=review._admin(c,actor)
    if (not isinstance(body,dict) or set(body)!={"entity_kind","rows"}
            or body["entity_kind"] not in SCOPES
            or not isinstance(body["rows"],list)
            or not 1<=len(body["rows"])<=MAX_BATCH):
        raise BatchError(400,"invalid_translation_batch")
    entity_kind=body["entity_kind"]
    path=SCOPES[entity_kind]
    seen=set()
    for row in body["rows"]:
        if not isinstance(row,dict) or set(row)!={
                "entity_id","field_path","expected_source_hash",
                "expected_candidate_hash"}:
            raise BatchError(400,"invalid_translation_batch_row")
        ident,field_path,source_hash,candidate_hash=(
            row["entity_id"],row["field_path"],
            row["expected_source_hash"],row["expected_candidate_hash"])
        if (not isinstance(ident,str) or not 1<=len(ident)<=160
                or field_path!=path
                or not isinstance(source_hash,str) or not HASH.fullmatch(source_hash)
                or not isinstance(candidate_hash,str) or not HASH.fullmatch(candidate_hash)
                or ident in seen):
            raise BatchError(400,"invalid_translation_batch_row")
        seen.add(ident)

    try:
        actions=[]
        # Validate the WHOLE group against canonical values before writing.
        for row in body["rows"]:
            ident=row["entity_id"]
            source=sources.canonical_field(c,entity_kind,ident,path)
            if _sha(source)!=row["expected_source_hash"]:
                raise BatchError(409,"translation_source_changed")
            detail=review.inspect(
                c,actor,entity_kind=entity_kind,entity_id=ident,
                field_path=path)
            candidate=detail["candidate"]
            if candidate and candidate["status"]=="pending":
                if candidate["candidate_hash"]!=row["expected_candidate_hash"]:
                    raise BatchError(409,"translation_changed_during_review")
                actions.append((ident,source,None,row))
            elif entity_kind=="dish" and candidate is None:
                original=sources.record(c,"dish",ident)
                legacy=original["name_en"]
                if (not isinstance(legacy,str) or not legacy.strip()
                        or _sha(legacy.strip())!=row["expected_candidate_hash"]):
                    raise BatchError(409,"translation_changed_during_review")
                actions.append((ident,source,legacy.strip(),row))
            else:
                raise BatchError(409,"translation_changed_during_review")

        for ident,source,legacy,row in actions:
            if legacy is not None:
                _submit_legacy_if_missing(c,actor_id,ident,source,legacy)
            review.approve(c,actor,{
                "entity_kind":entity_kind,"entity_id":ident,
                "field_path":path,"language":"en",
                "expected_source_hash":row["expected_source_hash"],
                "expected_candidate_hash":row["expected_candidate_hash"],
            })
    except (BatchError,ValueError,LookupError,PermissionError):
        c.rollback()
        raise
    except Exception:
        c.rollback()
        raise BatchError(503,"translation_batch_unavailable") from None
    return {"approved":len(body["rows"]),"entity_kind":entity_kind,
            "status":"approved"}
