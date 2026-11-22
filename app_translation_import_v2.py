"""Admin-only CSV import of proposed English display text.

An import never changes canonical library rows or approves translations.
Each batch is validated in full before writes and inserts are conditional
to preserve concurrent updates and all existing translation decisions.
"""
import hashlib
import secrets
import time

import app_translation_admin_v2 as review
import app_translation_sources_v2 as sources

MAX_ROWS=100
MAX_IMPORT_TEXT=10000
ROW_KEYS=frozenset((
    "entity_kind","entity_id","field_path","source_text","translated_text"
))


class ImportError(Exception):
    def __init__(self,status,code):
        self.status=status
        self.code=code
        super().__init__(code)


def _hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _validate_payload(c, actor, payload):
    reviewer=review._admin(c,actor)
    if (not isinstance(payload,dict) or set(payload)!={"rows"} or
            not isinstance(payload["rows"],list) or
            not 1<=len(payload["rows"])<=MAX_ROWS):
        raise ImportError(400,"invalid_translation_import_payload")
    seen=set()
    valid=[]
    errors=[]
    for index,row in enumerate(payload["rows"],1):
        code=None
        key=None
        if not isinstance(row,dict) or set(row)!=ROW_KEYS:
            code="invalid_row"
        else:
            kind,ident,path=row["entity_kind"],row["entity_id"],row["field_path"]
            source,english=row["source_text"],row["translated_text"]
            if (not all(isinstance(v,str) for v in (kind,ident,path,source,english))
                    or len(source)>MAX_IMPORT_TEXT or
                    len(english)>MAX_IMPORT_TEXT or not english.strip()
                    or not isinstance(ident,str) or not 1<=len(ident)<=160):
                code="invalid_row"
            elif kind not in sources.KINDS:
                code="invalid_library"
            else:
                key=(kind,ident,path)
                if key in seen:
                    code="duplicate_row"
                else:
                    seen.add(key)
                    try:
                        canonical=sources.canonical_field(c,kind,ident,path)
                        if canonical!=source:
                            code="source_changed"
                        else:
                            original=sources.record(c,kind,ident)
                            field=next((f for f in sources.fields_for(kind,original)
                                        if f["field_path"]==path),None)
                            if field is None:
                                code="invalid_field"
                            elif field["legacy_en"].strip():
                                code="existing_english"
                            else:
                                stored=c.execute(
                                    "SELECT 1 FROM v2_content_translations WHERE "
                                    "entity_kind=? AND entity_id=? AND "
                                    "field_path=? AND language='en'",
                                    (kind,ident,path)).fetchone()
                                if stored:
                                    code="already_reviewed"
                                else:
                                    valid.append((kind,ident,path,canonical,english.strip()))
                    except (ValueError,LookupError):
                        code="missing_field"
        if code:
            errors.append({"row":index,"code":code})
    return reviewer,valid,errors


def preview(c,actor,payload):
    _,valid,errors=_validate_payload(c,actor,payload)
    return {"eligible":len(valid),"rejected":len(errors),"errors":errors,
            "saved":False,"approved":False}


def submit(c,actor,payload):
    reviewer,valid,errors=_validate_payload(c,actor,payload)
    if errors:
        raise ImportError(409,"translation_import_requires_review")
    timestamp=int(time.time())
    try:
        for kind,ident,path,original,english in valid:
            result=c.execute("""
                INSERT INTO v2_content_translations(
                  entity_kind,entity_id,field_path,language,source_hash,
                  translated_text,status,updated_at,updated_by,approved_at,approved_by)
                VALUES (?,?,?,'en',?,?,'pending',?,?,NULL,NULL)
                ON CONFLICT (entity_kind,entity_id,field_path,language)
                  DO NOTHING RETURNING entity_id
            """,(kind,ident,path,_hash(original),english,timestamp,reviewer)).fetchone()
            if not result:
                raise ImportError(409,"translation_import_changed_during_review")
            c.execute("""
                INSERT INTO v2_content_translation_history(
                  id,entity_kind,entity_id,field_path,language,source_hash,
                  translated_text,action,actor_id,created_at)
                VALUES (?,?,?,?,'en',?,?,'submitted',?,?)
            """,(secrets.token_hex(16),kind,ident,path,_hash(original),
                 english,reviewer,time.time_ns()))
    except Exception as e:
        c.rollback()
        if isinstance(e,ImportError):
            raise
        raise ImportError(503,"translation_import_unavailable") from None
    # The WSGI caller commits the complete batch before responding.
    return {"imported":len(valid),"status":"pending","approved":False}
