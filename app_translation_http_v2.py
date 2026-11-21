"""Feature-gated HTTP route contract for app PT/EN translation pilots.

This module never initializes/migrates schema. app.py owns verified sessions,
CSRF/origin checks and SITE_ROLE segregation before invoking these routes.
No existing /api/v2/chef/preferences behavior is replaced.
"""
import app_language_preferences_v2 as preferences
import app_translation_admin_v2 as admin_api
import app_translation_catalog_v2 as catalog


ADMIN_ROOT = "/api/v2/admin/i18n"
PLAYER_LANGUAGE = "/api/v2/player/language"
CHEF_LANGUAGE = "/api/v2/chef/language"
ALLOWED = frozenset((
    ADMIN_ROOT, ADMIN_ROOT + "/propose", ADMIN_ROOT + "/approve",
    ADMIN_ROOT + "/history", ADMIN_ROOT + "/overview",
    ADMIN_ROOT + "/catalog", PLAYER_LANGUAGE, CHEF_LANGUAGE,
))


class APIError(Exception):
    def __init__(self, status, code):
        self.status = status
        self.code = code
        super().__init__(code)


def _role(user):
    if user is None:
        raise APIError(401, "unauthorized")
    if not isinstance(user, dict) or user.get("role") not in ("admin", "player", "chef"):
        raise APIError(403, "forbidden")
    return user["role"]


def _query(params, names):
    if not isinstance(params, dict) or set(params) - set(names):
        raise APIError(400, "invalid_translation_query")
    if any(not isinstance(value, list) or len(value) != 1 or
           not isinstance(value[0], str) for value in params.values()):
        raise APIError(400, "invalid_translation_query")
    return {k: v[0] for k, v in params.items()}


def _available(c, *tables):
    """No silent setup: if migrations are absent, refuse all writes/reads."""
    try:
        for table in tables:
            # Names come from an internal allowlist only.
            if table not in ("v2_content_translations", "v2_content_translation_history",
                             "v2_player_language_preferences"):
                raise APIError(500, "invalid_i18n_schema_name")
            c.execute("SELECT 1 FROM " + table + " LIMIT 0")
    except APIError:
        raise
    except Exception:
        raise APIError(503, "translations_schema_unavailable") from None


def _error(exc):
    if isinstance(exc, PermissionError):
        return APIError(401 if str(exc) == "unauthorized" else 403, str(exc))
    if isinstance(exc, LookupError):
        return APIError(404, str(exc))
    if isinstance(exc, ValueError):
        msg = str(exc)
        if msg in ("translation_source_changed", "translation_changed_during_review"):
            return APIError(409, msg)
        return APIError(400, msg)
    raise exc


def dispatch(c, *, site_role, user, path, method, query=None, body=None):
    """Return (status, response) for new, opted-in paths only.

    The caller has already authenticated the session and enforced origin/CSRF
    on non-GET methods. This function additionally enforces role and site scope
    and cannot be used to access records of other players or chefs.
    """
    if path not in ALLOWED:
        raise APIError(404, "not_found")
    role = _role(user)
    if path.startswith(ADMIN_ROOT):
        if site_role == "player" or role != "admin":
            raise APIError(403, "forbidden")
        _available(c, "v2_content_translations", "v2_content_translation_history")
        actor = user
        try:
            if path == ADMIN_ROOT + "/overview" and method == "GET":
                if query:
                    raise APIError(400, "invalid_translation_query")
                return 200, catalog.overview(c, actor)
            if path == ADMIN_ROOT + "/catalog" and method == "GET":
                q = _query(query or {}, ("entity_kind", "status", "query",
                                         "page", "page_size"))
                for key in ("page", "page_size"):
                    if key in q:
                        try:
                            q[key] = int(q[key])
                        except ValueError:
                            raise APIError(400, "invalid_catalog_pagination") from None
                return 200, catalog.list_fields(c, actor, **q)
            if path == ADMIN_ROOT and method == "GET":
                q = _query(query or {}, ("entity_kind", "entity_id",
                                         "field_path", "language"))
                if set(q) != {"entity_kind", "entity_id", "field_path"} and set(q) != {
                        "entity_kind", "entity_id", "field_path", "language"}:
                    raise APIError(400, "invalid_translation_query")
                return 200, admin_api.inspect(c, actor, **q)
            if path == ADMIN_ROOT + "/history" and method == "GET":
                q = _query(query or {}, ("entity_kind", "entity_id",
                                         "field_path", "language", "limit"))
                if not {"entity_kind", "entity_id", "field_path"}.issubset(q):
                    raise APIError(400, "invalid_translation_query")
                if "limit" in q:
                    try:
                        q["limit"] = int(q["limit"])
                    except (TypeError, ValueError):
                        raise APIError(400, "invalid_translation_limit") from None
                return 200, {"history": admin_api.audit(c, actor, **q)}
            if path == ADMIN_ROOT + "/propose" and method == "POST":
                return 201, admin_api.propose(c, actor, body)
            if path == ADMIN_ROOT + "/approve" and method == "POST":
                return 200, admin_api.approve(c, actor, body)
        except (PermissionError, LookupError, ValueError) as exc:
            raise _error(exc) from None
        raise APIError(404, "not_found")

    if site_role == "admin":
        raise APIError(404, "not_found")
    if path == PLAYER_LANGUAGE:
        if role != "player":
            raise APIError(403, "forbidden")
        _available(c, "v2_player_language_preferences")
        try:
            if method == "GET":
                return 200, preferences.read(c, user)
            if method == "PUT":
                if not isinstance(body, dict) or set(body) != {"language"}:
                    raise APIError(400, "invalid_language_payload")
                return 200, preferences.save(c, user, body["language"])
        except (PermissionError, LookupError, ValueError) as exc:
            raise _error(exc) from None
        raise APIError(404, "not_found")
    if path == CHEF_LANGUAGE:
        if role != "chef":
            raise APIError(403, "forbidden")
        if method != "GET":
            # Chef's original /api/v2/chef/preferences remains the sole writer.
            raise APIError(404, "not_found")
        try:
            return 200, preferences.read(c, user)
        except (PermissionError, LookupError, ValueError) as exc:
            raise _error(exc) from None
    raise APIError(404, "not_found")
