"""Read-only resolution of current editor meal-plan drafts for microcycles."""
import json

COLOR_TYPES = {'orange': 'Plano laranja', 'yellow': 'Plano amarelo', 'blue': 'Plano azul', 'green': 'Plano verde', 'vp': 'Plano verde preparação'}


def available_drafts(c, athlete_id):
    """Return only approved Planos snapshots for administrative scheduling.

    At cutover, the already visible plans are preserved as transitional
    snapshots so no athlete loses a day of nutritional planning.
    Subsequent draft edits cannot change the calendar until Publish.
    """
    from food_plan_publications_v2 import published_for_athlete
    athlete = c.execute(
        "SELECT id FROM v2_athletes WHERE id=? AND archived_at IS NULL",
        (athlete_id,)).fetchone()
    if not athlete:
        return {}
    return published_for_athlete(c, athlete_id)


import math
import unicodedata

FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
MEAL_NAMES = {"breakfast":"pequeno almoco", "lunch":"almoco", "snack":"lanche", "dinner":"jantar", "supper":"ceia"}


def normalize(value):
    s = unicodedata.normalize("NFD", str(value or "").lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").replace("-", " ").split())


def slots(meal):
    name = normalize(meal.get("name"))
    if name == "intermedia" or ("pequeno almoco" in name and "lanche" in name):
        return ("breakfast", "snack")
    if name == "principal" or ("almoco" in name and "jantar" in name):
        return ("lunch", "dinner")
    names = [name] + [normalize(x) for x in (meal.get("applies_to") or [])]
    return tuple(k for k, label in MEAL_NAMES.items() if label in names)


def zero():
    return {k:0.0 for k in FIELDS}


def food_values(food, library):
    if food.get("kind") == "supplement":
        return zero(), False
    ref = library.get(food.get("id"))
    amount = food.get("grams")
    if ref is None or amount is None:
        return zero(), True
    try:
        grams = float(amount)
        fraction = float(ref["edible_fraction"]) if ref["variant"] == "gross" else 1.0
        if not math.isfinite(grams) or grams <= 0 or not 0 < fraction <= 1:
            return zero(), True
        return {k: float(ref[k]) * grams * fraction / 100 for k in FIELDS}, False
    except (ValueError, TypeError, KeyError):
        return zero(), True


def option_values(option, library):
    foods = option.get("foods") or []
    totals, provisional = zero(), False
    for index, primary in enumerate(foods):
        if primary.get("alternative_to") is not None:
            continue
        group = [primary] + [f for f in foods if f.get("alternative_to") == index]
        chosen = [f for f in group if f.get("grams") is not None]
        provisional |= len(chosen) != len(group)
        if not chosen:
            chosen = [primary]
        nutrition = [food_values(f, library) for f in chosen]
        provisional |= any(pending for _, pending in nutrition)
        for key in FIELDS:
            totals[key] += sum(v[key] for v, _ in nutrition) / len(nutrition)
    return totals, provisional



PERI_TYPES = {"training": "Plano Peri-treino", "match": "Plano Peri-jogo"}
PERI_LABELS = {
    "pre_training": "Pré-treino", "post_training": "Pós-treino",
    "pre_match": "Pré-jogo", "intra_match": "Intra-jogo", "post_match": "Pós-jogo",
}


def _peri_phase(meal_title, kind):
    name = normalize(meal_title)
    training = {"pre treino": "pre_training", "pos treino": "post_training"}
    match = {"pre jogo": "pre_match", "intra jogo": "intra_match",
             "intrajogo": "intra_match", "pos jogo": "post_match"}
    return (training if kind == "training" else match).get(name)


def _meal_preview(meal, library):
    options = meal.get("options") or []
    if not options:
        return {"status": "missing_options"}
    values = [option_values(option, library) for option in options]
    averages = {key: sum(value[key] for value, _ in values) / len(values)
                for key in FIELDS}
    pending = any(flag for _, flag in values)
    previews = []
    for option, (value, option_pending) in zip(options, values):
        foods = []
        for food in option.get("foods") or []:
            reference = library.get(food.get("id")) or {}
            foods.append({**food, "library_name": reference.get("display_name", "")})
        from meal_option_selection_v2 import option_ref
        previews.append({
            "option_ref": option_ref(option),
            "title": option.get("title") or "", "foods": foods,
            "notes": option.get("notes") or [], "order": option.get("order") or [],
            "nutrition": value, "provisional": option_pending,
        })
    return {"status": "provisional" if pending else "ok",
            "options": previews, "nutrition": averages, "provisional": pending}


def _event_sources(events, matches, match_overrides, dates):
    """Build events once; collapse the same match in both calendar sources."""
    result = {}
    for event in events or []:
        if event.get("kind") not in PERI_TYPES or event.get("event_date") not in dates:
            continue
        result[("calendar", event["id"])] = dict(event)
    for match in matches or []:
        date = match.get("match_date")
        if date not in dates:
            continue
        session = ("morning" if not match.get("match_time") or
                   str(match["match_time"]) < "15:00" else "afternoon")
        override = match_overrides or {}
        event = {"id": match["id"], "event_date": date, "kind": "match",
                 "session": session, "title": "Jogo",
                 "pre_override": override.get((match["id"], "pre"), "auto"),
                 "post_override": override.get((match["id"], "post"), "auto")}
        same = next((existing for existing in result.values()
                     if existing["kind"] == "match" and
                     existing["event_date"] == date and
                     existing["session"] == session), None)
        if same is not None:
            same["deduplicated_match_source"] = True
            # If either source explicitly excludes a protocol, exclusion wins.
            for field in ("pre_override", "post_override"):
                values = (same.get(field, "auto"), event.get(field, "auto"))
                same[field] = "off" if "off" in values else "on" if "on" in values else "auto"
        else:
            result[("match", match["id"])] = event
    return sorted(result.values(), key=lambda row: (
        row["event_date"], row.get("session") != "morning", row["kind"], row["id"]))


def _resolve_peri_for_day(drafts, library, events):
    rows, total, issues = [], zero(), []
    for event in events:
        kind = event["kind"]
        candidates = drafts.get(PERI_TYPES[kind], [])
        if not candidates:
            # An unprescribed peri moment must never be invented automatically.
            continue
        if len(candidates) != 1:
            issues.append({"event_id": event["id"], "status": "ambiguous_peri_plan"})
            continue
        entry = candidates[0]
        grouped = {}
        for meal in entry["draft"].get("meals") or []:
            phase = _peri_phase(meal.get("name"), kind)
            if phase is None:
                issues.append({"event_id": event["id"],
                               "status": "unmapped_peri_meal",
                               "meal_name": meal.get("name") or ""})
                continue
            grouped.setdefault(phase, []).append(meal)
        for phase, matching in grouped.items():
            if phase in ("pre_training", "pre_match", "intra_match"):
                control = event.get("pre_override", "auto")
            else:
                control = event.get("post_override", "auto")
            if control == "off":
                continue
            status = None
            if len(matching) != 1:
                status = "ambiguous_peri_meal"
                detail = {"status": status}
            else:
                detail = _meal_preview(matching[0], library)
                status = detail["status"]
            detail.update({
                "event_id": event["id"], "event_date": event["event_date"],
                "kind": kind, "session": event.get("session", ""),
                "phase": phase, "title": PERI_LABELS[phase],
                "source_meal_name": matching[0].get("name") if len(matching) == 1 else "",
                "draft_id": entry["id"], "updated_at": entry["updated_at"],
                "deduplicated_match_source": bool(event.get("deduplicated_match_source")),
            })
            rows.append(detail)
            if status in ("ok", "provisional"):
                for key in FIELDS:
                    total[key] += detail["nutrition"][key]
            if status != "ok":
                issues.append({"event_id": event["id"], "phase": phase,
                               "status": status})
    return rows, total, issues

def resolve(c, athlete_id, colors_by_day, events=None, matches=None, match_overrides=None):
    """Admin-only dynamic preview; no edits or publication changes."""
    from microcycles_v2 import MEALS
    drafts = available_drafts(c, athlete_id)
    rows = c.execute("SELECT id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g FROM v2_food_library WHERE active=1").fetchall()
    library = {r["id"]:dict(r) for r in rows}
    events_by_date = {}
    for event in _event_sources(events, matches, match_overrides, set(colors_by_day)):
        events_by_date.setdefault(event["event_date"], []).append(event)
    days = {}
    for day, colors in colors_by_day.items():
        meals = {}
        total = zero()
        issues = []
        for slot in MEALS:
            color_info = colors.get(slot) or {}
            color = color_info.get("color") if isinstance(color_info, dict) else color_info
            if not color or color == "none":
                meals[slot] = {"status":"no_color", "color":color}
                continue
            plan_type = COLOR_TYPES.get(color)
            choices = drafts.get(plan_type, [])
            status = None
            if not plan_type:
                status = "unsupported_color"
            elif not choices:
                status = "missing_plan"
            elif len(choices) != 1:
                status = "ambiguous_plan"
            if status:
                meals[slot] = {"status":status, "color":color}
                issues.append({"meal":slot, "color":color, "status":status})
                continue
            entry = choices[0]
            matching = [m for m in entry["draft"].get("meals", []) if slot in slots(m)]
            if len(matching) != 1:
                status = "missing_meal" if not matching else "ambiguous_meal"
                meals[slot] = {"status":status, "color":color}
                issues.append({"meal":slot, "color":color, "status":status})
                continue
            meal = matching[0]
            preview = _meal_preview(meal, library)
            preview.update({
                "color": color, "draft_id": entry["id"],
                "source_meal_name": meal.get("name"),
                "updated_at": entry["updated_at"],
            })
            meals[slot] = preview
            if preview["status"] in ("ok", "provisional"):
                for key in FIELDS:
                    total[key] += preview["nutrition"][key]
            if preview["status"] != "ok":
                issues.append({"meal": slot, "color": color, "status": preview["status"]})
        color_nutrition = dict(total)
        peri_rows, peri_totals, peri_issues = _resolve_peri_for_day(
            drafts, library, events_by_date.get(day, []))
        issues.extend(peri_issues)
        for key in FIELDS:
            total[key] += peri_totals[key]
        days[day] = {"meals":meals, "nutrition":total,
                     "color_nutrition":color_nutrition,
                     "peri_nutrition":peri_totals,
                     "peri_events":peri_rows,
                     "state":"partial" if issues else "complete",
                     "issues":issues,
                     "peri_included":bool(peri_rows)}
    return {"source":"live_editor_drafts","days":days,
            "available_plan_types":sorted(x for x in drafts if isinstance(x,str))}


def audit_all_drafts(c):
    """Read-only audit of the registered athlete plan library.

    Counts are safe to log: no names, IDs, prescription details or food data.
    Tests coverage, active library references and quantity completeness.
    """
    rows = c.execute("SELECT id FROM v2_athletes WHERE archived_at IS NULL").fetchall()
    all_drafts = c.execute("SELECT id,content FROM v2_food_plan_drafts").fetchall()
    references = {row["id"] for row in c.execute(
        "SELECT id FROM v2_food_library WHERE active=1").fetchall()}
    counts = {
        "registered_athletes": len(rows), "stored_drafts": len(all_drafts),
        "matched_drafts": 0, "unmatched_drafts": 0,
        "duplicate_color_plan_types": 0, "color_meals_missing_options": 0,
        "food_references_missing": 0, "quantities_missing": 0,
        "alternatives_missing_quantity": 0, "invalid_draft_json": 0,
        "peri_drafts": 0,
    }
    indexed_ids = set()
    for row in rows:
        drafts = available_drafts(c, row["id"])
        for kind, candidates in drafts.items():
            if kind in COLOR_TYPES.values() and len(candidates) > 1:
                counts["duplicate_color_plan_types"] += 1
            for candidate in candidates:
                if candidate["id"] in indexed_ids:
                    continue
                indexed_ids.add(candidate["id"])
                counts["matched_drafts"] += 1
                if kind in ("Plano Peri-treino", "Plano Peri-jogo"):
                    counts["peri_drafts"] += 1
                for meal in candidate["draft"].get("meals") or []:
                    if kind in COLOR_TYPES.values() and not meal.get("options"):
                        counts["color_meals_missing_options"] += 1
                    for option in meal.get("options") or []:
                        for food in option.get("foods") or []:
                            if food.get("kind") == "supplement":
                                continue
                            if food.get("id") not in references:
                                counts["food_references_missing"] += 1
                            if food.get("grams") is None:
                                counts["quantities_missing"] += 1
                                if food.get("alternative_to") is not None:
                                    counts["alternatives_missing_quantity"] += 1
    for row in all_drafts:
        if row["id"] in indexed_ids:
            continue
        try:
            json.loads(row["content"])
        except (TypeError, ValueError):
            counts["invalid_draft_json"] += 1
        counts["unmatched_drafts"] += 1
    return counts


def audit_real_option_parity(c):
    """Compare every stored option with the library's independent nutrient helper.

    Entirely read-only. Summaries contain no player names or prescription contents.
    """
    from food_library_v2 import nutrients_for_quantity
    library = {row["id"]: dict(row) for row in c.execute(
        "SELECT id,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g "
        "FROM v2_food_library WHERE active=1").fetchall()}
    counters = {
        "drafts": 0, "meals": 0, "options": 0,
        "options_with_pending_quantities": 0,
        "options_without_foods": 0, "missing_active_food_references": 0,
        "macro_mismatches": 0, "options_not_comparable": 0,
        "peri_options": 0,
        "unmapped_peri_meal_names": 0,
    }
    for row in c.execute("SELECT content FROM v2_food_plan_drafts").fetchall():
        try:
            plan = json.loads(row["content"])
        except (ValueError, TypeError):
            continue
        counters["drafts"] += 1
        kind = plan.get("plan_type") or ""
        for meal in plan.get("meals") or []:
            counters["meals"] += 1
            if kind in ("Plano Peri-treino", "Plano Peri-jogo") and not _peri_phase(
                    meal.get("name"), "training" if kind == "Plano Peri-treino" else "match"):
                counters["unmapped_peri_meal_names"] += 1
            for option in meal.get("options") or []:
                counters["options"] += 1
                if kind in ("Plano Peri-treino", "Plano Peri-jogo"):
                    counters["peri_options"] += 1
                foods = option.get("foods") or []
                if not foods:
                    counters["options_without_foods"] += 1
                new_values, provisional = option_values(option, library)
                if provisional:
                    counters["options_with_pending_quantities"] += 1
                actual = zero()
                comparable = True
                for index, primary in enumerate(foods):
                    if primary.get("alternative_to") is not None:
                        continue
                    group = [primary] + [food for food in foods
                                         if food.get("alternative_to") == index]
                    choices = [food for food in group if food.get("grams") is not None]
                    if not choices:
                        choices = [primary]
                    nutrients = []
                    for food in choices:
                        if food.get("kind") == "supplement" or food.get("grams") is None:
                            nutrients.append(zero())
                        else:
                            ref = library.get(food.get("id"))
                            if ref is None:
                                counters["missing_active_food_references"] += 1
                                comparable = False
                                break
                            try:
                                nutrients.append(nutrients_for_quantity(ref, food["grams"]))
                            except (ValueError, TypeError, KeyError):
                                comparable = False
                                break
                    if not comparable:
                        break
                    for key in FIELDS:
                        actual[key] += sum(item[key] for item in nutrients) / len(nutrients)
                if not comparable:
                    counters["options_not_comparable"] += 1
                elif any(abs(new_values[key] - actual[key]) > 0.00001 for key in FIELDS):
                    counters["macro_mismatches"] += 1
    return counters


def audit_event_links(c, first, last):
    """End-to-end, read-only peri check using actual event records and drafts.

    Uses the same resolution path as the admin calendar, but never writes.
    No player names, IDs or prescription content are included in the report.
    """
    import events_v2
    import microcycles_v2
    stats = {
        "registered_athletes": 0, "athletes_with_events": 0,
        "scheduled_event_rows": 0, "match_rows": 0,
        "days_with_events": 0, "peri_moments_resolved": 0,
        "peri_moments_provisional": 0, "peri_moments_skipped": 0,
        "days_with_peri": 0, "peri_resolution_issues": 0,
        "duplicate_match_sources_collapsed": 0,
    }
    for athlete in c.execute(
            "SELECT id FROM v2_athletes WHERE archived_at IS NULL").fetchall():
        athlete_id = athlete["id"]
        stats["registered_athletes"] += 1
        events = events_v2.list_events(c, athlete_id, first, last)
        events = [e for e in events if e.get("kind") in PERI_TYPES]
        matches = [m for m in microcycles_v2.list_matches(c, athlete_id)
                   if first <= m["match_date"] <= last]
        stats["scheduled_event_rows"] += len(events)
        stats["match_rows"] += len(matches)
        dates = {e["event_date"] for e in events}
        dates.update(m["match_date"] for m in matches)
        if not dates:
            continue
        stats["athletes_with_events"] += 1
        stats["days_with_events"] += len(dates)
        overrides = c.execute(
            "SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?",
            (athlete_id,)).fetchall()
        state = {(r["match_id"], r["phase"]):r["state"] for r in overrides}
        source_events = _event_sources(events, matches, state, dates)
        stats["duplicate_match_sources_collapsed"] += sum(
            bool(x.get("deduplicated_match_source")) for x in source_events)
        report = resolve(c, athlete_id, {day:{} for day in dates}, events,
                         matches, state)
        for day in report["days"].values():
            peri = day["peri_events"]
            stats["peri_moments_resolved"] += len(peri)
            stats["peri_moments_provisional"] += sum(
                r["status"] == "provisional" for r in peri)
            stats["peri_moments_skipped"] += sum(
                r.get("status") not in ("ok", "provisional") for r in peri)
            stats["peri_resolution_issues"] += len(day["issues"])
            stats["days_with_peri"] += bool(peri)
    return stats


def audit_effective_color_planning(c, first, last):
    """Read-only coverage of actual microcycle colours against current Planos drafts.

    No personal identifiers, option contents or dates are returned in the audit.
    Calendar and athlete app state is never changed.
    """
    import calendar_v2
    import microcycles_v2
    import day_colors_v2
    import prescription_effective_v2
    import events_v2
    from datetime import datetime
    from zoneinfo import ZoneInfo

    stats = {"athletes": 0, "athletes_without_model": 0,
             "days_checked": 0, "days_complete": 0, "days_partial": 0,
             "colored_meals": 0, "colored_meals_ok": 0,
             "no_color_moments": 0, "peri_events_checked": 0,
             "peri_moments": 0, "missing_plan": 0, "missing_meal": 0,
             "missing_options": 0, "ambiguous_plan": 0,
             "ambiguous_meal": 0, "provisional": 0, "other_issues": 0}
    today=datetime.now(ZoneInfo("Europe/Lisbon")).date().isoformat()
    for row in c.execute("SELECT id FROM v2_athletes WHERE archived_at IS NULL").fetchall():
        aid=row["id"]
        stats["athletes"]+=1
        model=microcycles_v2.get_model(c, aid)
        if not model:
            stats["athletes_without_model"]+=1
            continue
        matches=microcycles_v2.list_matches(c,aid)
        days=calendar_v2.classify_range(first,last,[m["match_date"] for m in matches])
        base={r["name"]:r["meals"] for r in model["classifications"]}
        manual={(r["meal_date"],r["meal"]):r["color"]
                for r in day_colors_v2.list_colors(c,aid,first,last)}
        scenarios={(r["classification"],r["scenario"],r["meal"]):r["color"]
                   for r in c.execute(
                       "SELECT classification,scenario,meal,color FROM v2_scenario_cells "
                       "WHERE athlete_id=?",(aid,)).fetchall()}
        responses=[]
        for rec in c.execute(
                "SELECT id,match_id,scenario,created_at FROM v2_post_match_responses WHERE athlete_id=?",
                (aid,)).fetchall():
            info=dict(rec)
            audit=[dict(x) for x in c.execute(
                "SELECT id,record_type,record_id,new_json,created_at "
                "FROM v2_monitoring_audit WHERE athlete_id=? AND record_type='post_match' "
                "AND record_id=? ORDER BY created_at,id",
                (aid,info["id"])).fetchall()]
            responses.append({"match_id":info["match_id"],
                              "revisions":prescription_effective_v2.revisions_from_audit(info,audit)})
        dates={}
        for day in days:
            colors=prescription_effective_v2.resolve_day(
                day["date"],day["classification"],
                base.get(day["classification"] or "Geral",{}),manual,scenarios,matches,responses,today)
            dates[day["date"]]=colors
        events=events_v2.list_events(c,aid,first,last)
        controls={(r["match_id"],r["phase"]):r["state"] for r in c.execute(
            "SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?",
            (aid,)).fetchall()}
        report=resolve(c,aid,dates,events,matches,controls)
        for day in report["days"].values():
            stats["days_checked"]+=1
            stats["days_complete" if day["state"]=="complete" else "days_partial"]+=1
            stats["peri_moments"]+=len(day["peri_events"])
            for value in day["meals"].values():
                status=value["status"]
                if status=="no_color":
                    stats["no_color_moments"]+=1
                else:
                    stats["colored_meals"]+=1
                    if status=="ok":
                        stats["colored_meals_ok"]+=1
            for issue in day["issues"]:
                key=issue["status"]
                if key in stats:
                    stats[key]+=1
                else:
                    stats["other_issues"]+=1
        stats["peri_events_checked"]+=len(events)
    return stats
