"""Real HTTP smoke checks against the WSGI app with an isolated temporary DB.

No Render credentials, athlete data, or production database are accessed.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
from http.server import HTTPServer
from threading import Thread

class ConsumptionHttpSmoke(unittest.TestCase):
    def test_player_consumption_endpoints_reject_anonymous_http_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            env=os.environ.copy()
            env.update({"MILE_DATA_DIR":directory,"DATABASE_URL":"",
                        "MILE_SITE_ROLE":"both","MILE_CONSUMPTION_PILOT_ATHLETE_IDS":""})
            # The player-only startup enforces the production 58-plan readiness gate.\n            # Use the combined role here to test identical HTTP authentication\n            # without manufacturing or bypassing the published-plan roster.\n            # Run a separate interpreter: app reads its DB configuration on import.
            script=r'''
import json
from wsgiref.simple_server import make_server, WSGIRequestHandler
from threading import Thread
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from wsgi import application
from app import connect, digest
import time
with connect() as db:
 db.execute("INSERT INTO users(id,name,email,role,active) VALUES (?,?,?,?,1)",("synthetic","Smoke Player","smoke@example.invalid","player"))
 db.execute("INSERT INTO sessions(token,user_id,csrf,expires) VALUES (?,?,?,?)",(digest("smoke-token"),"synthetic","smoke-csrf",int(time.time())+3600))
# Create a synthetic linked athlete and publish only a mocked source.
with connect() as db:
 db.execute("CREATE TABLE IF NOT EXISTS v2_athletes(id TEXT PRIMARY KEY,archived_at TEXT)")
 db.execute("CREATE TABLE IF NOT EXISTS v2_player_links(user_id TEXT,athlete_id TEXT)")
 db.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES (?,?,?)",("pilot-athlete","Synthetic Athlete",int(time.time())))
 db.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES (?,?,?)",("synthetic","pilot-athlete",int(time.time())))
import app
from unittest.mock import patch
published={"draft_id":"published-test","color":"green","options":[{"option_ref":"option-test","foods":[{"id":"rice","grams":100}]}]}
library={"rice":{"id":"rice","active":1,"kcal":100,"protein_g":2,"carbs_g":20,"fat_g":1}}
app.consumption_source_v2.current_source=lambda *args,**kwargs: published
app.consumption_nutrition_v2.active_library=lambda *args,**kwargs: library
class Quiet(WSGIRequestHandler):
 def log_message(self,*args): pass
server=make_server("127.0.0.1",0,application,handler_class=Quiet)
thread=Thread(target=server.serve_forever,daemon=True)
thread.start()
try:
 base="http://127.0.0.1:"+str(server.server_port)
 cases=[
  ("/api/v2/player/consumption-records?start=2026-11-11&end=2026-11-11","GET"),
  ("/api/v2/player/consumption-options?date=2026-11-11&meal=lunch","GET"),
  ("/api/v2/player/consumption-foods?q=arroz","GET"),
  ("/api/v2/player/consumption-records","PUT")]
 for path,method in cases:
  req=Request(base+path,method=method)
  if method=="PUT":
   req.data=b"{}"
   req.add_header("Content-Type","application/json")
  try:
   with urlopen(req,timeout=8) as response: status=response.status
  except HTTPError as error: status=error.code
  assert status==401,(path,status)
  authenticated=Request(base+path,method=method)
  authenticated.add_header("Cookie","mile_session=smoke-token")
  if method=="PUT":
   authenticated.data=b"{}"
   authenticated.add_header("Content-Type","application/json")
   authenticated.add_header("X-CSRF-Token","smoke-csrf")
  try:
   with urlopen(authenticated,timeout=8) as response: linked_status=response.status
  except HTTPError as error: linked_status=error.code
  assert linked_status==403,(path,linked_status)
 # Allowlist the synthetic athlete, then test a real HTTP save/read cycle.
 os.environ["MILE_CONSUMPTION_PILOT_ATHLETE_IDS"]="pilot-athlete"
 payload={"date":"2026-11-11","meal":"lunch","option_ref":"option-test","status":"all"}
 req=Request(base+"/api/v2/player/consumption-records",data=json.dumps(payload).encode(),method="PUT",
  headers={"Cookie":"mile_session=smoke-token","Content-Type":"application/json","X-CSRF-Token":"smoke-csrf"})
 with urlopen(req,timeout=8) as response:
  assert response.status==200,response.status
 req=Request(base+"/api/v2/player/consumption-records?start=2026-11-11&end=2026-11-11",
  headers={"Cookie":"mile_session=smoke-token"})
 with urlopen(req,timeout=8) as response:
  saved=json.load(response)["records"]
 assert len(saved)==1,saved
 assert saved[0]["nutrition"]["kcal"]==100,saved
finally:
 server.shutdown()
'''
            result=subprocess.run([sys.executable,"-c",script],cwd=os.path.dirname(__file__),
                env=env,capture_output=True,text=True,timeout=90)
            self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
