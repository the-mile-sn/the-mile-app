"""Explicit food translation batch review with optimistic locking and audit.

Read-only preview returns only canonical food display names and pending English.
Approval accepts opaque identity and hashes, never source or translated text.
Only an active admin may preview or approve. Nothing runs automatically.
"""
import hashlib
import re

import app_translation_admin_v2 as review
import app_translation_sources_v2 as sources
import app_translation_catalog_v2 as catalog

MAX_PREVIEW=1200
MAX_BATCH=100
HASH=re.compile(r"^[0-9a-f]{64}$")


class BatchError(Exception):
    def __init__(self,status,code):
        super().__init__(code)
        self.status=status
        self.code=code


def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def preview(c, actor):
    """Show the exact PT/EN pair to be approved. Food names ONLY."""
    review._admin(c,actor)
    pairs=[]
    for item in catalog._entries(c):
        if item["entity_kind"]!="food":
            continue
        for field in item["fields"]:
            if field["field_path"]!="display_name" or field["state"]!="pending":
                continue
            portuguese=field["source_text"]
            english=field["translation_text"]
            if not portuguese.strip() or not english.strip():
                continue
            pairs.append({
                "entity_id":item["entity_id"],
                "field_path":"display_name",
                "source_text":portuguese,
                "translated_text":english,
                "expected_source_hash":_sha(portuguese),
                "expected_candidate_hash":_sha(english),
            })
            if len(pairs)>MAX_PREVIEW:
                raise BatchError(413,"translation_batch_too_large")
    pairs.sort(key=lambda item:(item["source_text"].casefold(),item["entity_id"]))
    return {"entity_kind":"food","status":"pending","total":len(pairs),
            "items":pairs,"approved":False}


def approve(c, actor, body):
    """Atomically approve at most 100 *explicitly chosen* pending foods.

    WSGI caller commits on success. Any conflict rolls back the entire batch.
    Prior successfully committed batches remain auditably approved.
    """
    review._admin(c,actor)
    if (not isinstance(body,dict) or set(body)!={"entity_kind","rows"}
            or body["entity_kind"]!="food"
            or not isinstance(body["rows"],list)
            or not 1<=len(body["rows"])<=MAX_BATCH):
        raise BatchError(400,"invalid_translation_batch")
    seen=set()
    for row in body["rows"]:
        if not isinstance(row,dict) or set(row)!={
                "entity_id","field_path","expected_source_hash",
                "expected_candidate_hash"}:
            raise BatchError(400,"invalid_translation_batch_row")
        ident,path,source_hash,candidate_hash=(
            row["entity_id"],row["field_path"],
            row["expected_source_hash"],row["expected_candidate_hash"])
        if (not isinstance(ident,str) or not 1<=len(ident)<=160
                or path!="display_name"
                or not isinstance(source_hash,str) or not HASH.fullmatch(source_hash)
                or not isinstance(candidate_hash,str) or not HASH.fullmatch(candidate_hash)
                or ident in seen):
            raise BatchError(400,"invalid_translation_batch_row")
        seen.add(ident)
    try:
        for row in body["rows"]:
            ident=row["entity_id"]
            source=sources.canonical_field(c,"food",ident,"display_name")
            if _sha(source)!=row["expected_source_hash"]:
                raise BatchError(409,"translation_source_changed")
            detail=review.inspect(
                c,actor,entity_kind="food",entity_id=ident,
                field_path="display_name")
            candidate=detail["candidate"]
            if (not candidate or candidate["status"]!="pending"
                    or candidate["candidate_hash"]!=row["expected_candidate_hash"]):
                raise BatchError(409,"translation_changed_during_review")
            review.approve(c,actor,{
                "entity_kind":"food","entity_id":ident,
                "field_path":"display_name","language":"en",
                "expected_source_hash":row["expected_source_hash"],
                "expected_candidate_hash":row["expected_candidate_hash"],
            })
    except (BatchError,ValueError,LookupError,PermissionError):
        c.rollback()
        raise
    except Exception:
        c.rollback()
        raise BatchError(503,"translation_batch_unavailable") from None
    return {"approved":len(body["rows"]),"entity_kind":"food",
            "status":"approved"}
