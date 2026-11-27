"""Read-only preflight for a staged English Player pilot.

Run privately on the Player Render instance:
    python tools/player_i18n_rollout_preflight.py

This reports counts, NEVER player names, clinical text, translations, passwords,
or environment variable values. It does not enable English or change data.
A green plan coverage check is not a substitute for device acceptance testing.
"""
import hashlib
import json
import os
import sys
from collections import defaultdict


def _digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _approved(row, source, *, trim=False):
    if not isinstance(source, str) or not source.strip() or row is None:
        return False
    expected = source.strip() if trim else source
    return (row["source_hash"] == _digest(expected)
            and isinstance(row["translated_text"], str)
            and bool(row["translated_text"].strip()))


def coverage(c, plans, library):
    """Count currently approved EN fields for scoped, published prescriptions."""
    import app_content_i18n_v2 as i18n
    stats = defaultdict(lambda: {"fields": 0, "approved": 0, "missing": 0})
    food_rows = {r["entity_id"]: r for r in i18n._approved_rows(c, "food")
                 if r["field_path"] == "display_name"}

    def count(kind, row, source, *, trim=True):
        if not isinstance(source, str) or not source.strip():
            return
        stats[kind]["fields"] += 1
        if _approved(row, source, trim=trim):
            stats[kind]["approved"] += 1
        else:
            stats[kind]["missing"] += 1

    for plan in plans.values():
        raw = plan.get("snapshot_json")
        if not isinstance(raw, str):
            stats["publication"]["fields"] += 1
            stats["publication"]["missing"] += 1
            continue
        ref = "pub:" + _digest(str(plan["draft_id"]) + "\0" + raw)
        rows = {r["field_path"]: r for r in i18n._approved_rows(c, "plan", ref)}
        contents = plan.get("content") or {}
        for mi, meal in enumerate(contents.get("meals") or []):
            if not isinstance(meal, dict):
                continue
            for oi, opt in enumerate(meal.get("options") or []):
                if not isinstance(opt, dict):
                    continue
                prefix = "meals/%d/options/%d" % (mi, oi)
                count("option_titles", rows.get(prefix + "/title"), opt.get("title"))
                for ni, note in enumerate(opt.get("notes") or []):
                    count("option_notes", rows.get(prefix + "/notes/%d" % ni), note)
                for fi, food in enumerate(opt.get("foods") or []):
                    if not isinstance(food, dict):
                        continue
                    fpath = prefix + "/foods/%d" % fi
                    if food.get("kind") == "supplement":
                        count("supplement_labels", rows.get(fpath + "/label"),
                              food.get("label"))
                        continue
                    count("quantities", rows.get(fpath + "/display_quantity"),
                          food.get("display_quantity"))
                    source = food.get("display_name")
                    if not isinstance(source, str) or not source.strip():
                        continue
                    food_id = str(food.get("id") or "")
                    canonical = (library.get(food_id) or {}).get("display_name")
                    if isinstance(canonical, str) and source.strip() == canonical.strip():
                        count("food_names", food_rows.get(food_id), canonical, trim=False)
                    else:
                        count("custom_food_names", rows.get(fpath + "/display_name"),
                              source)
    return {key: stats[key] for key in sorted(stats)}


def flags(env):
    """Never infer all-player release when a staging allowlist is absent."""
    configured = (env.get("MILE_PLAYER_LANGUAGE_SELECTION_ENABLED") == "1"
                  and env.get("MILE_APP_TRANSLATIONS_ENABLED") == "1")
    listed = env.get("MILE_PLAYER_I18N_PILOT_USERNAMES")
    allowed = {s.strip().casefold() for s in (listed or "").split(",") if s.strip()}
    return {
        "translation_flags_enabled": configured,
        "explicit_pilot_allowlist": listed is not None and bool(allowed),
        "allowlist_size": len(allowed),
    }, allowed


def inspect(c, env):
    """Read-only, summary-only staging check; no implicit rollouts."""
    import app_content_i18n_v2 as i18n
    import food_plan_player_v2 as player_plans

    gate, usernames = flags(env)
    report = {"checks": gate, "published_plans": 0, "linked_pilots": 0,
              "unavailable_pilots": 0, "translation_store": False,
              "content": {}, "status": "manual_review_required"}
    if not gate["translation_flags_enabled"] or not gate["explicit_pilot_allowlist"]:
        report["status"] = "gate_not_ready"
        return report
    if not i18n.translation_store_available(c):
        report["status"] = "translation_store_unavailable"
        return report
    report["translation_store"] = True
    library = player_plans._library(c)
    all_plans = {}
    for username in sorted(usernames):
        row = c.execute("""SELECT id FROM users WHERE lower(username)=?
            AND role='player' AND active=1""", (username,)).fetchone()
        if row is None:
            report["unavailable_pilots"] += 1
            continue
        link = c.execute("""SELECT l.athlete_id
            FROM v2_player_links l JOIN v2_athletes a ON a.id=l.athlete_id
            WHERE l.user_id=? AND a.archived_at IS NULL""", (row["id"],)).fetchone()
        if link is None:
            report["unavailable_pilots"] += 1
            continue
        report["linked_pilots"] += 1
        published = player_plans._approved(c, link["athlete_id"])
        report["published_plans"] += len(published)
        for name, plan in published.items():
            all_plans[str(row["id"]) + ":" + name] = plan
    report["content"] = coverage(c, all_plans, library)
    missing = sum(v["missing"] for v in report["content"].values())
    report["status"] = (
        "plan_content_ready_for_manual_device_review"
        if report["linked_pilots"] == len(usernames)
        and report["published_plans"] > 0 and missing == 0
        else "plan_content_review_required"
    )
    return report


def main():
    # Running this file directly makes Python start imports from tools/,
    # not the repository root. Resolve the root from this file rather than
    # requiring operators to edit PYTHONPATH on production Shell sessions.
    from pathlib import Path
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from app import connect
    with connect() as c:
        # Explicitly prohibit write queries, including through imported helpers.
        if hasattr(c, "conn"):
            c.execute("SET TRANSACTION READ ONLY")
        else:
            c.execute("PRAGMA query_only=ON")
        report = inspect(c, os.environ)
        print(json.dumps(report, sort_keys=True, ensure_ascii=False))
    # This script is never authorised to activate a locale or an account.
    return 0 if report["status"] == "plan_content_ready_for_manual_device_review" else 1


if __name__ == "__main__":
    sys.exit(main())
