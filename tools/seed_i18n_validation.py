"""Disposable PT-PT / EN-GB visual validation fixture: never connect to production.

Invoked only by the dedicated Render free web service. Creates synthetic
athletes, menus, recipes, approved translations and local authentication.
A temporary SQLite store is deliberately discarded when the service restarts.
"""
import hashlib
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

EXPECTED_DATA = Path("/tmp/the-mile-i18n-pten-20261123")
def guard():
    if (os.environ.get("MILE_I18N_SYNTHETIC_DATA") != "1"
            or os.environ.get("DATABASE_URL")
            or Path(os.environ.get("MILE_DATA_DIR", "")).resolve() != EXPECTED_DATA
            or os.environ.get("MILE_SITE_ROLE") != "player"):
        raise SystemExit("Refusing to seed outside isolated synthetic SQLite validation service")
    password = os.environ.get("MILE_I18N_VALIDATION_PASSWORD", "")
    if len(password) < 20:
        raise SystemExit("A strong private MILE_I18N_VALIDATION_PASSWORD is required")
    return password


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def translation(c, kind, ident, field, original, english, *, trim=False):
    if not isinstance(original, str) or not original.strip():
        return
    source = original.strip() if trim else original
    c.execute("""INSERT INTO v2_content_translations
        (entity_kind,entity_id,field_path,language,source_hash,translated_text,
         status,updated_at,updated_by,approved_at,approved_by)
        VALUES (?,?,?,?,?,?,'approved',?,'synthetic-fixture',?,'synthetic-fixture')
        ON CONFLICT(entity_kind,entity_id,field_path,language) DO UPDATE SET
          source_hash=excluded.source_hash,
          translated_text=excluded.translated_text,
          status='approved',
          updated_at=excluded.updated_at,
          approved_at=excluded.approved_at""",
        (kind,ident,field,"en",sha(source),english,int(time.time()),int(time.time())))


def seed():
    password = guard()
    import app
    import microcycles_v2

    app.initialize()
    with app.connect() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS v2_food_library (
            id TEXT PRIMARY KEY, display_name TEXT NOT NULL,variant TEXT NOT NULL,
            edible_fraction REAL NOT NULL,kcal REAL NOT NULL,protein_g REAL NOT NULL,
            carbs_g REAL NOT NULL,fat_g REAL NOT NULL,active INTEGER NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS v2_food_plan_editor_publications (
            draft_id TEXT PRIMARY KEY,athlete_id TEXT NOT NULL,plan_type TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,published_at BIGINT NOT NULL,state TEXT NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS v2_content_translations (
            entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,field_path TEXT NOT NULL,
            language TEXT NOT NULL,source_hash TEXT NOT NULL,translated_text TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending','approved')),
            updated_at BIGINT NOT NULL,updated_by TEXT NOT NULL,
            approved_at BIGINT,approved_by TEXT,
            PRIMARY KEY(entity_kind,entity_id,field_path,language))""")

        fake_foods = [
            ("demo-bread","Pão integral","Wholemeal bread",250,9,46,3.5),
            ("demo-yoghurt","Iogurte natural","Plain yoghurt",60,4,5,2.7),
            ("demo-salmon","Salmão grelhado","Grilled salmon",208,20,0,13),
            ("demo-potato","Batata cozida","Boiled potato",87,2,20,0.1),
        ]
        for food_id,pt,en,kcal,protein,carbs,fat in fake_foods:
            c.execute("""INSERT INTO v2_food_library
               (id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g,active)
               VALUES(?,?,?,1,?,?,?,?,1)
               ON CONFLICT(id) DO NOTHING""",
               (food_id,pt,"",kcal,protein,carbs,fat))
            translation(c,"food",food_id,"display_name",pt,en)

        dish_id = "demo-salmon-plate"
        dish_pt = "Salmão grelhado com batata e feijão verde cozido"
        dish_en = "Grilled salmon with boiled potatoes and green beans"
        c.execute("""INSERT OR IGNORE INTO v2_dish_library
            (id,category,name_pt,name_en,image_filename,active)
            VALUES(?,?,?,?,?,1)""",
            (dish_id,"Peixe",dish_pt,"",""))
        translation(c,"dish",dish_id,"name_pt",dish_pt,dish_en)

        category_id,recipe_id = "demo-main-dishes","demo-salmon-recipe"
        c.execute("""INSERT OR IGNORE INTO v2_recipe_categories
            (id,name,created_at) VALUES(?,?,?)""",
            (category_id,"Pratos principais",int(time.time())))
        translation(c,"recipe_category",category_id,"name","Pratos principais","Main dishes")
        recipe_name="Salmão no forno"
        recipe_note="Receita fictícia para validar a apresentação bilingue."
        section={"id":"demo-ingredients","title":"Ingredientes",
                 "ingredients":[{"id":"demo-fish","name":"Salmão","quantity":"200","unit":"g"},
                                {"id":"demo-side","name":"Batata","quantity":"150","unit":"g"}]}
        steps=["Dispor os ingredientes num tabuleiro.","Cozinhar no forno até estar pronto."]
        c.execute("""INSERT OR IGNORE INTO v2_recipe_library
            (id,category_id,name,recipe_type,status,servings,sections_json,
             steps_json,notes,photo_key,source_document,created_at,updated_at)
            VALUES(?,? ,?,'standard','published',2,?,?,?,NULL,'synthetic-fixture',?,?)""",
            (recipe_id,category_id,recipe_name,
             json.dumps([section],ensure_ascii=False),
             json.dumps(steps,ensure_ascii=False),recipe_note,
             int(time.time()),int(time.time())))
        for field,pt,en in [
            ("name",recipe_name,"Oven-baked salmon"),
            ("notes",recipe_note,"Fictional recipe for checking bilingual presentation."),
            ("sections/demo-ingredients/title","Ingredientes","Ingredients"),
            ("sections/demo-ingredients/ingredients/demo-fish/name","Salmão","Salmon"),
            ("sections/demo-ingredients/ingredients/demo-side/name","Batata","Potato"),
            ("steps/0",steps[0],"Place the ingredients in an ovenproof dish."),
            ("steps/1",steps[1],"Bake until cooked through."),
        ]: translation(c,"recipe",recipe_id,field,pt,en)
        c.execute("""INSERT OR IGNORE INTO v2_dish_recipe_links
            (dish_id,recipe_id,position) VALUES(?,?,0)""",(dish_id,recipe_id))

        now=int(time.time())
        today=datetime.now(ZoneInfo("Europe/Lisbon")).date().isoformat()
        admin=c.execute("SELECT id FROM users WHERE role='admin' LIMIT 1").fetchone()["id"]
        for lang in ("pt","en"):
            uid="demo-i18n-player-"+lang
            athlete="demo-i18n-athlete-"+lang
            username="mileptdemo" if lang=="pt" else "mileendemo"
            c.execute("""INSERT OR IGNORE INTO users
                (id,name,email,username,role,password,active)
                VALUES(?,?,?,?,?,?,1)""",
                (uid,"Jogador de Teste "+lang.upper(),
                 username+"@accounts.internal.invalid",username,"player",
                 app.password_hash(password)))
            c.execute("""INSERT OR IGNORE INTO v2_athletes
                (id,name,created_at,weight_kg,followup_plan)
                VALUES(?,?,?,?,?)""",(athlete,"Jogador Fictício "+lang.upper(),
                                    now,75,"Pro"))
            c.execute("""INSERT OR IGNORE INTO v2_player_links
                (user_id,athlete_id,linked_at) VALUES(?,?,?)""",(uid,athlete,now))
            c.execute("""INSERT OR IGNORE INTO v2_microcycle_rows
                (athlete_id,classification,configured) VALUES(?,'Geral',1)""",(athlete,))
            c.execute("""INSERT OR REPLACE INTO v2_microcycle_cells
                (athlete_id,classification,meal,color) VALUES(?,'Geral','breakfast','green')""",
                (athlete,))
            for meal in ("lunch","dinner"):
                c.execute("""INSERT OR REPLACE INTO v2_microcycle_cells
                    (athlete_id,classification,meal,color) VALUES(?,'Geral',?,'green')""",
                    (athlete,meal))
            c.execute("""INSERT OR IGNORE INTO v2_athlete_recipe_category_access
                (athlete_id,category_id) VALUES(?,?)""",(athlete,category_id))
            c.execute("""INSERT OR REPLACE INTO v2_player_language_preferences
                (user_id,language) VALUES(?,?)""",(uid,lang))
            c.execute("""INSERT OR IGNORE INTO v2_weekly_menus
                (athlete_id,menu_date,meal,kind,value,dish_id)
                VALUES(?,?,'lunch','dish',?,?)""",(athlete,today,dish_pt,dish_id))

            breakfast={"title":"Pão integral e iogurte",
              "foods":[{"id":"demo-bread","grams":80,"display_name":"Pão integral",
                        "display_quantity":"2 fatias"},
                       {"id":"demo-yoghurt","grams":120,"display_name":"Iogurte natural",
                        "display_quantity":"1 taça"}],
              "notes":["Beber água ao longo do dia."]}
            lunch={"title":"Salmão com batata",
              "foods":[{"id":"demo-salmon","grams":150,"display_name":"Salmão grelhado",
                        "display_quantity":"150 g"},
                       {"id":"demo-potato","grams":200,"display_name":"Batata cozida",
                        "display_quantity":"200 g"}],
              "notes":[]}
            snapshot={"plan_type":"Plano verde","athlete_id":athlete,"player_id":uid,
                "meals":[{"name":"Pequeno-almoço","options":[breakfast]},
                         {"name":"Almoço / jantar","options":[lunch]}]}
            raw=json.dumps(snapshot,ensure_ascii=False,sort_keys=True,separators=(",",":"))
            draft="demo-i18n-plan-"+lang
            c.execute("""INSERT OR REPLACE INTO v2_food_plan_editor_publications
                (draft_id,athlete_id,plan_type,snapshot_json,published_at,state)
                VALUES(?,?,?,?,?,'published')""",
                (draft,athlete,"Plano verde",raw,now))
            ident="pub:"+sha(draft+"\0"+raw)
            for path,pt,en in [
                ("meals/0/options/0/title","Pão integral e iogurte","Wholemeal bread and yoghurt"),
                ("meals/0/options/0/notes/0","Beber água ao longo do dia.",
                 "Drink water throughout the day."),
                ("meals/0/options/0/foods/0/display_quantity","2 fatias","2 slices"),
                ("meals/0/options/0/foods/1/display_quantity","1 taça","1 bowl"),
                ("meals/1/options/0/title","Salmão com batata","Salmon with potatoes"),
            ]: translation(c,"plan",ident,path,pt,en,trim=True)

        chef_id="demo-i18n-chef"
        c.execute("""INSERT OR IGNORE INTO users
            (id,name,email,username,role,password,active)
            VALUES(?,?,?,?,? ,?,1)""",
            (chef_id,"Chef de Teste","milechefdemo@accounts.internal.invalid",
             "milechefdemo","chef",app.password_hash(password)))
        c.execute("""INSERT OR IGNORE INTO v2_chef_links
            (user_id,athlete_id,language,linked_at,created_by)
            VALUES(?,'demo-i18n-athlete-en','en',?,?)""",(chef_id,now,admin))
        c.commit()

    print("Synthetic i18n fixtures ready: 2 dummy players, 1 dummy chef; no production data")


def verify():
    guard()
    import app
    import app_content_i18n_v2 as i18n
    import food_plan_player_v2 as plans
    with app.connect() as c:
        status=i18n.translation_readiness(c)
        assert status["available"] and status["approved_count"] >= 20, status
        for lang in ("pt","en"):
            athlete="demo-i18n-athlete-"+lang
            pt=plans.player_plans(c,athlete,language="pt")
            en=plans.player_plans(c,athlete,language="en")
            first_pt=pt["options_by_color"]["green"]["breakfast"][0]
            first_en=en["options_by_color"]["green"]["breakfast"][0]
            assert first_pt["title"] == "Pão integral e iogurte", first_pt
            assert first_en["title"] == "Wholemeal bread and yoghurt", first_en
            assert first_pt["option_ref"] == first_en["option_ref"]
            assert first_pt["totals"] == first_en["totals"]
            assert first_en["items"][0]["name"] == "Wholemeal bread", first_en
        print("Synthetic smoke passed: PT/EN, approved sources, stable identities/nutrition")


if __name__=="__main__":
    if "--verify" in sys.argv:
        verify()
    else:
        seed()
