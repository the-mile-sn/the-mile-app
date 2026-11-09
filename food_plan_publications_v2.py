"""Publication boundary for Planos -> Backoffice Planeamento only.

Separate saved working drafts from the approved Planos version used by the
administrative calendar. Does not write to v2_plan_publications or player APIs.
"""
import hashlib
import json
import secrets
import time


def _canonical(data):
    """Compare clinically relevant draft data, ignoring editor metadata."""
    if isinstance(data, str):
        data = json.loads(data)
    return json.dumps({
        "athlete_id": data.get("athlete_id") or "",
        "player_id": data.get("player_id") or "",
        "plan_type": data.get("plan_type") or "",
        "meals": data.get("meals") or [],
    }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def initialize(c):
    c.executescript("""
        CREATE TABLE IF NOT EXISTS v2_food_plan_editor_publications (
            draft_id TEXT PRIMARY KEY,
            athlete_id TEXT NOT NULL,
            plan_type TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            published_at BIGINT NOT NULL,
            state TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS v2_food_editor_pub_owner_type
            ON v2_food_plan_editor_publications(athlete_id, plan_type);
        CREATE TABLE IF NOT EXISTS v2_food_editor_cutover (
            id TEXT PRIMARY KEY, created_at BIGINT NOT NULL
        );
    """)
    if c.execute("SELECT id FROM v2_food_editor_cutover WHERE id='initial'").fetchone():
        return {"seeded": 0, "already_initialized": True}

    # Freeze the 58 pre-existing working drafts in their last live, validated
    # state. This prevents a subsequent draft save from silently changing
    # Planeamento while individual publications are being confirmed.
    links = {str(r["user_id"]): str(r["athlete_id"])
             for r in c.execute("SELECT user_id,athlete_id FROM v2_player_links").fetchall()}
    active = {str(r["id"]) for r in c.execute(
        "SELECT id FROM v2_athletes WHERE archived_at IS NULL").fetchall()}
    try:
        legacy_ids = {hashlib.sha256(("editor-import-v1:"+str(r["id"])).encode()).hexdigest()[:32]
                      for r in c.execute("SELECT id FROM v2_plan_publications").fetchall()}
    except Exception:
        legacy_ids = set()
    grouped = {}
    for row in c.execute(
            "SELECT id,content FROM v2_food_plan_drafts ORDER BY created_at,id").fetchall():
        if row["id"] in legacy_ids:
            continue
        try:
            plan = json.loads(row["content"])
        except (TypeError, ValueError):
            continue
        aid = str(plan.get("athlete_id") or links.get(str(plan.get("player_id") or "")) or "")
        if aid not in active or not plan.get("plan_type"):
            continue
        # Do not create a competing active plan based on matching names.
        if plan.get("athlete_id") and plan.get("player_id") and links.get(
                str(plan["player_id"])) != aid:
            continue
        grouped.setdefault((aid, plan["plan_type"]), []).append((row, plan))

    seeded = 0
    ambiguous = 0
    for (aid, kind), candidates in grouped.items():
        if len(candidates) != 1:
            ambiguous += len(candidates)
            continue
        row, plan = candidates[0]
        c.execute(
            "INSERT INTO v2_food_plan_editor_publications"
            "(draft_id,athlete_id,plan_type,snapshot_json,published_at,state)"
            "VALUES (?,?,?,?,?,?)",
            (row["id"], aid, kind, row["content"], 0, "transitional"))
        seeded += 1
    c.execute("INSERT INTO v2_food_editor_cutover(id,created_at) VALUES (?,?)",
              ("initial", int(time.time())))
    return {"seeded": seeded, "ambiguous": ambiguous, "already_initialized": False}


def publication_for_draft(c, draft_id):
    return c.execute(
        "SELECT draft_id,athlete_id,plan_type,snapshot_json,published_at,state "
        "FROM v2_food_plan_editor_publications WHERE draft_id=?", (draft_id,)).fetchone()


def state_for_draft(c, draft_id, content=None):
    row = publication_for_draft(c, draft_id)
    if not row:
        return {"state": "draft", "published_at": None, "pending_changes": False}
    changed = False
    if content is not None:
        try:
            changed = _canonical(content) != _canonical(row["snapshot_json"])
        except (TypeError, ValueError):
            changed = True
    return {"state": row["state"],
            "published_at": row["published_at"] or None,
            "pending_changes": changed}


def published_for_athlete(c, athlete_id):
    """Only stored Planos snapshots are eligible for Planeamento."""
    rows = c.execute(
        "SELECT draft_id,plan_type,snapshot_json,published_at,state "
        "FROM v2_food_plan_editor_publications WHERE athlete_id=?",
        (athlete_id,)).fetchall()
    link = c.execute("SELECT user_id FROM v2_player_links WHERE athlete_id=?",
                     (athlete_id,)).fetchone()
    linked_user = str(link["user_id"]) if link else ""
    result = {}
    for row in rows:
        try:
            plan = json.loads(row["snapshot_json"])
        except (TypeError, ValueError):
            continue
        if plan.get("athlete_id") and str(plan["athlete_id"]) != str(athlete_id):
            continue
        if plan.get("player_id") and str(plan["player_id"]) != linked_user:
            continue
        result.setdefault(row["plan_type"], []).append({
            "id": row["draft_id"], "draft": plan,
            "updated_at": row["published_at"],
            "publication_state": row["state"],
        })
    return result


def publish(c, draft_id, expected_updated_at=None):
    """Explicit admin-only action: approve saved snapshot for Planeamento.

    The athlete app reads approved Planos snapshots directly from the shared database. Does not modify old PDF publications.
    """
    import food_plan_drafts_v2
    row = c.execute(
        "SELECT id,content,updated_at FROM v2_food_plan_drafts WHERE id=?",
        (draft_id,)).fetchone()
    if not row:
        raise ValueError("unknown_draft")
    if expected_updated_at is not None and int(expected_updated_at) != int(row["updated_at"]):
        raise ValueError("stale_draft")
    data = food_plan_drafts_v2.validate(json.loads(row["content"]))
    aid = str(data.get("athlete_id") or "")
    user_id = str(data.get("player_id") or "")
    if not aid and user_id:
        link = c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",
                         (user_id,)).fetchone()
        aid = str(link["athlete_id"]) if link else ""
    if not aid or not c.execute(
            "SELECT id FROM v2_athletes WHERE id=? AND archived_at IS NULL",
            (aid,)).fetchone():
        raise ValueError("unknown_athlete")
    if user_id:
        link = c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",
                         (user_id,)).fetchone()
        if not link or str(link["athlete_id"]) != aid:
            raise ValueError("player_athlete_mismatch")
    if not data["plan_type"] or not data["meals"]:
        raise ValueError("empty_plan")
    if any(not opt["foods"] and not opt["notes"]
           for meal in data["meals"] for opt in meal["options"]):
        raise ValueError("empty_option")
    foods = [food for meal in data["meals"] for opt in meal["options"]
             for food in opt["foods"] if food.get("kind") != "supplement"]
    if any(food.get("grams") is None for food in foods):
        raise ValueError("missing_quantity")
    valid_foods = {r["id"] for r in c.execute(
        "SELECT id FROM v2_food_library WHERE active=1").fetchall()}
    if any(food["id"] not in valid_foods for food in foods):
        raise ValueError("missing_food")
    other = c.execute(
        "SELECT draft_id FROM v2_food_plan_editor_publications "
        "WHERE athlete_id=? AND plan_type=? AND draft_id<>?",
        (aid, data["plan_type"], draft_id)).fetchone()
    if other:
        raise ValueError("another_plan_active")
    approved_at = int(time.time())
    c.execute(
        "INSERT INTO v2_food_plan_editor_publications"
        "(draft_id,athlete_id,plan_type,snapshot_json,published_at,state)"
        " VALUES (?,?,?,?,?,?)"
        " ON CONFLICT(draft_id) DO UPDATE SET"
        " athlete_id=excluded.athlete_id,"
        " plan_type=excluded.plan_type,"
        " snapshot_json=excluded.snapshot_json,"
        " published_at=excluded.published_at,"
        " state=excluded.state",
        (draft_id, aid, data["plan_type"], row["content"], approved_at, "published"))
    return {"state": "published", "published_at": approved_at,
            "pending_changes": False, "draft_id": draft_id}


def may_delete(c, draft_id):
    return publication_for_draft(c, draft_id) is None


def approve_initial_roster_for_players(c):
    """One-time explicit approval of all current validated Planos.

    Called only for the user's authorized cutover. All writes succeed or
    none do; it never touches legacy PDF/player publications.
    """
    marker = "player_cutover_2026_11_06"
    if c.execute("SELECT id FROM v2_food_editor_cutover WHERE id=?", (marker,)).fetchone():
        return {"already_approved": True, "approved": 0}
    rows = c.execute(
        "SELECT id,content,updated_at FROM v2_food_plan_drafts").fetchall()
    active = c.execute(
        "SELECT COUNT(*) AS n FROM v2_food_plan_editor_publications").fetchone()["n"]
    if len(rows) != active or active <= 0:
        raise ValueError("publication_roster_not_one_to_one")
    c.execute("SAVEPOINT approve_initial_roster")
    try:
        approved = 0
        for row in rows:
            if not publication_for_draft(c, row["id"]):
                raise ValueError("draft_without_approved_snapshot")
            # Validate the latest saved prescription, including amounts and
            # active library records, then freeze it as the player's version.
            publish(c, row["id"], row["updated_at"])
            approved += 1
        if approved != active:
            raise ValueError("approval_count_mismatch")
        c.execute("INSERT INTO v2_food_editor_cutover(id,created_at) VALUES (?,?)",
                  (marker, int(time.time())))
        c.execute("RELEASE SAVEPOINT approve_initial_roster")
    except Exception:
        c.execute("ROLLBACK TO SAVEPOINT approve_initial_roster")
        c.execute("RELEASE SAVEPOINT approve_initial_roster")
        raise
    return {"already_approved": False, "approved": approved}
