"""Feature-gated, admin-only PT/EN content translation endpoints.

No player/chef language APIs, migrations or startup side effects. The WSGI
caller authenticates, checks origin/CSRF and SITE_ROLE before dispatch.
"""
import app_translation_admin_v2 as review
import app_translation_catalog_v2 as catalog
import app_translation_import_v2 as imports
import app_translation_batch_review_v2 as batch
import app_translation_plans_v2 as plans
import app_translation_recovery_v2 as recovery

ROOT = "/api/v2/admin/i18n"
PATHS = frozenset((
    ROOT, ROOT + "/propose", ROOT + "/approve", ROOT + "/history",
    ROOT + "/overview", ROOT + "/catalog",
    ROOT + "/import/preview", ROOT + "/import/submit",
    ROOT + "/batch/preview", ROOT + "/batch/approve",
    ROOT + "/plans", ROOT + "/plans/fields", ROOT + "/plans/history",
    ROOT + "/plans/propose", ROOT + "/plans/approve",
    ROOT + "/plans/common", ROOT + "/plans/common/approve",
    ROOT + "/plans/common/import",
    ROOT + "/plans/recovery", ROOT + "/plans/recovery/approve",
))


class APIError(Exception):
    def __init__(self, status, code):
        self.status = status
        self.code = code
        super().__init__(code)


def _query(params, names):
    if not isinstance(params, dict) or set(params).difference(names):
        raise APIError(400, "invalid_translation_query")
    if any(not isinstance(v, list) or len(v) != 1 or not isinstance(v[0], str)
           for v in params.values()):
        raise APIError(400, "invalid_translation_query")
    return {k: v[0] for k, v in params.items()}


def _available(c):
    try:
        c.execute("SELECT 1 FROM v2_content_translations LIMIT 0")
        c.execute("SELECT 1 FROM v2_content_translation_history LIMIT 0")
    except Exception:
        raise APIError(503, "translations_schema_unavailable") from None


def _map_error(e):
    if isinstance(e, PermissionError):
        return APIError(401 if str(e) == "unauthorized" else 403, str(e))
    if isinstance(e, LookupError):
        return APIError(404, str(e))
    if isinstance(e, ValueError):
        if str(e) in ("translation_source_changed", "translation_changed_during_review"):
            return APIError(409, str(e))
        return APIError(400, str(e))
    raise e


def dispatch(c, *, site_role, user, path, method, query=None, body=None):
    if path not in PATHS:
        raise APIError(404, "not_found")
    if site_role not in ("admin","both") or not isinstance(user, dict) or user.get("role") != "admin":
        raise APIError(403, "forbidden")
    _available(c)
    try:
        # Validate against the actual active admin row, not just a cookie value.
        review._admin(c, user)
        if method == "GET":
            if path == ROOT + "/plans/recovery":
                q = _query(query or {}, ("publication_ref",))
                if set(q) != {"publication_ref"}:
                    raise APIError(400, "invalid_translation_query")
                return 200, recovery.preview(c, user, q["publication_ref"])
            if path == ROOT + "/plans/common":
                if query:
                    raise APIError(400, "invalid_translation_query")
                return 200, plans.common_preview(c, user)
            if path == ROOT + "/plans":
                if query:
                    raise APIError(400, "invalid_translation_query")
                return 200, plans.list_publications(c, user)
            if path == ROOT + "/plans/fields":
                q = _query(query or {}, ("publication_ref",))
                if set(q) != {"publication_ref"}:
                    raise APIError(400, "invalid_translation_query")
                return 200, plans.inspect(c, user, q["publication_ref"])
            if path == ROOT + "/plans/history":
                q = _query(query or {}, ("publication_ref", "field_path"))
                if set(q) != {"publication_ref", "field_path"}:
                    raise APIError(400, "invalid_translation_query")
                return 200, plans.history(c,user,q["publication_ref"],q["field_path"])
            if path == ROOT + "/batch/preview":
                q=_query(query or {}, ("entity_kind",))
                return 200,batch.preview(c,user,q.get("entity_kind","food"))
            if path == ROOT + "/overview":
                if query:
                    raise APIError(400, "invalid_translation_query")
                return 200, catalog.overview(c, user)
            if path == ROOT + "/catalog":
                q = _query(query or {}, ("entity_kind", "status", "query",
                                         "page", "page_size"))
                for key in ("page", "page_size"):
                    if key in q:
                        try:
                            q[key] = int(q[key])
                        except ValueError:
                            raise APIError(400, "invalid_catalog_pagination") from None
                return 200, catalog.list_fields(c, user, **q)
            if path == ROOT:
                q = _query(query or {}, ("entity_kind", "entity_id", "field_path", "language"))
                if not {"entity_kind","entity_id","field_path"}.issubset(q):
                    raise APIError(400, "invalid_translation_query")
                return 200, review.inspect(c, user, **q)
            if path == ROOT + "/history":
                q = _query(query or {}, ("entity_kind", "entity_id",
                                         "field_path", "language", "limit"))
                if not {"entity_kind","entity_id","field_path"}.issubset(q):
                    raise APIError(400, "invalid_translation_query")
                if "limit" in q:
                    try:
                        q["limit"] = int(q["limit"])
                    except ValueError:
                        raise APIError(400, "invalid_translation_limit") from None
                return 200, {"history": review.audit(c, user, **q)}
        if method == "POST":
            if path == ROOT + "/plans/recovery/approve":
                return 200, recovery.approve_reviewed(c, user, body)
            if path == ROOT + "/plans/common/import":
                return 201, plans.import_common(c, user, body)
            if path == ROOT + "/plans/common/approve":
                return 200, plans.approve_common(c, user, body)
            if path == ROOT + "/plans/propose":
                return 201, plans.propose(c, user, body)
            if path == ROOT + "/plans/approve":
                return 200, plans.approve(c, user, body)
            if path == ROOT + "/batch/approve":
                return 200,batch.approve(c,user,body)
            if path == ROOT + "/import/preview":
                return 200, imports.preview(c, user, body)
            if path == ROOT + "/import/submit":
                return 201, imports.submit(c, user, body)
            if path == ROOT + "/propose":
                return 201, review.propose(c, user, body)
            if path == ROOT + "/approve":
                return 200, review.approve(c, user, body)
    except plans.PlanTranslationError as e:
        raise APIError(e.status, e.code) from None
    except batch.BatchError as e:
        raise APIError(e.status,e.code) from None
    except imports.ImportError as e:
        raise APIError(e.status, e.code) from None
    except (PermissionError, LookupError, ValueError) as e:
        raise _map_error(e) from None
    raise APIError(404, "not_found")
