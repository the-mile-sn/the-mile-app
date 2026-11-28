"""Only used by the disposable visual validation image, never production WSGI."""
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

role=os.environ.get("MILE_SITE_ROLE")
root=Path(__file__).resolve().parent
if role=="player":
    sys.path.insert(0,str(root/"validation_player"))
if (not os.environ.get("MILE_VALIDATION_SOCKET","").startswith("/tmp/mile-notify-pg-")
        or "host="+os.environ["MILE_VALIDATION_SOCKET"] not in os.environ.get("DATABASE_URL","")):
    raise RuntimeError("Validation requires local disposable database")

import app
application=app.application
app.ADMINS=()

def seed():
    import notification_store_v2
    import notification_activation_v2
    import content_translations_v2
    password=os.environ["MILE_VALIDATION_PASSWORD"]
    if len(password)<16:
        raise RuntimeError("Synthetic password too short")
    now=int(time.time())
    with app.connect() as c:
        # Resume only an exact synthetic roster on the dedicated persistent disk.
        users=[(r["id"],r["role"],r["email"]) for r in c.execute("SELECT id,role,email FROM users").fetchall()]
        athletes={r["id"] for r in c.execute("SELECT id FROM v2_athletes").fetchall()}
        if users or athletes:
            expected={("validation-admin","admin","validation-admin@example.invalid"),
                      ("validation-player","player","validation-player@example.invalid"),
                      ("validation-chef","chef","validation-chef@example.invalid")}
            if (os.environ.get("MILE_VALIDATION_PERSIST")!="1" or set(users)!=expected
                    or athletes!={"validation-athlete"}):
                raise RuntimeError("Unexpected validation roster; refusing to proceed")
            for initializer in (notification_store_v2.initialize,notification_activation_v2.initialize,content_translations_v2.initialize):
                initializer(c)
            c.commit()
            print("SYNTHETIC_VISUAL_FIXTURES_REUSED",flush=True)
            return
        for initializer in (notification_store_v2.initialize,notification_activation_v2.initialize,content_translations_v2.initialize):
            initializer(c)
        for uid,name,email,username,kind,enabled in (
            ("validation-admin","Administrador de teste","validation-admin@example.invalid",None,"admin",0),
            ("validation-player","Jogador de teste","validation-player@example.invalid","validationplayer","player",1),
            ("validation-chef","Chef de teste","validation-chef@example.invalid","validationchef","chef",1),
        ):
            c.execute("""INSERT INTO users(id,name,email,username,role,password,active,menus_enabled,anthropometry_enabled,birth_date,sex)
                VALUES(?,?,?,?,?,?,1,?,?,?,?)""",(uid,name,email,username,kind,app.password_hash(password),enabled,enabled,date.today().replace(year=2000).isoformat(),"M"))
        c.execute("INSERT INTO v2_athletes(id,name,created_at,sex) VALUES(?,?,?,?)",("validation-athlete","Jogador de teste",now,"M"))
        c.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES(?,?,?)",("validation-player","validation-athlete",now))
        c.execute("INSERT INTO v2_chef_links(user_id,athlete_id,language,linked_at,created_by) VALUES(?,?,?,?,?)",("validation-chef","validation-athlete","en",now,"validation-admin"))
        day=date.today()
        c.execute("INSERT INTO v2_match_events(id,athlete_id,match_date,created_at) VALUES(?,?,?,?)",("validation-match","validation-athlete",(day-timedelta(days=1)).isoformat(),now))
        c.execute("INSERT INTO v2_weekly_menus(athlete_id,menu_date,meal,kind,value,dish_id) VALUES(?,?,?,?,?,?)",("validation-athlete",day.isoformat(),"lunch","category","Carne branca",None))
        c.commit()
    print("SYNTHETIC_VISUAL_FIXTURES_READY",flush=True)

if __name__=="__main__":
    command=sys.argv[1]
    if command=="initialize":
        app.initialize()
    elif command=="initialize-player":
        # The actual production startup demands 58 clinical publications.
        # A synthetic-only environment must not import those records. Bypass
        # only that startup check in this wrapper; runtime role is unchanged.
        app.SITE_ROLE="both"
        try:
            app.initialize()
        finally:
            app.SITE_ROLE="player"
    elif command=="seed":
        seed()
    else:
        raise RuntimeError("Unknown validation command")
