"""Optional, read-only PT/EN presentation projections for app content.

Not imported by app.py or by either app. Callers must authorize source
records first. Canonical fields and nutritional data are never changed.
"""
import content_translations_v2 as translations


def _locale(language):
    if language not in ("pt", "en"):
        raise ValueError("invalid_presentation_language")
    return language


def _source(source, *required):
    try:
        record = dict(source)
    except (TypeError, ValueError):
        raise ValueError("invalid_presentation_record") from None
    if "presentation" in record:
        raise ValueError("untrusted_presentation_field")
    if any(not isinstance(record.get(field), str) or not record[field]
           for field in required):
        raise ValueError("invalid_presentation_record")
    return record


def _translate(c, kind, ident, field, source, language):
    return translations.resolve(c, entity_kind=kind, entity_id=ident,
                                field_path=field, source_text=source, language=language)


def present_food(c, food, *, language="pt"):
    """Add presentation for an authorized food, preserving all original fields."""
    language = _locale(language)
    row = _source(food, "id", "display_name")
    name = _translate(c, "food", row["id"], "display_name", row["display_name"], language)
    view = {"requested_language": language, "name": name}
    if isinstance(row.get("notes"), str) and row["notes"]:
        view["notes"] = _translate(c, "food", row["id"], "notes", row["notes"], language)
    row["presentation"] = view
    return row


def present_dish(c, dish, *, language="pt"):
    """Only reviewed translations count; legacy name_en is NOT auto-approved."""
    language = _locale(language)
    row = _source(dish, "id", "name_pt")
    row["presentation"] = {
        "requested_language": language,
        "name": _translate(c, "dish", row["id"], "name_pt", row["name_pt"], language)}
    return row


def present_menu(c, menu, *, dish=None, language="pt"):
    """Translate linked dish display by exact dish_id; never guess legacy names.

    The existing menu value, dish_id, date, meal and kind are unchanged.
    """
    language = _locale(language)
    row = _source(menu, "menu_date", "meal", "kind", "value")
    fallback = {"text": row["value"], "status": "source_only", "language": "pt"}
    if row["kind"] != "dish":
        row["presentation"] = {"requested_language": language, "name": fallback}
        return row
    if not row.get("dish_id"):
        row["presentation"] = {"requested_language": language,
                               "name": {**fallback, "status": "legacy_unlinked"}}
        return row
    if dish is None:
        row["presentation"] = {"requested_language": language,
                               "name": {**fallback, "status": "dish_not_provided"}}
        return row
    linked = _source(dish, "id", "name_pt")
    if linked["id"] != row["dish_id"]:
        raise ValueError("menu_dish_id_mismatch")
    localized = present_dish(c, linked, language=language)
    row["presentation"] = {
        "requested_language": language,
        "name": localized["presentation"]["name"]}
    return row
