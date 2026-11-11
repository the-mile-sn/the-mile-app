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
                        "MILE_SITE_ROLE":"player","MILE_CONSUMPTION_PILOT_ATHLETE_IDS":""})
            # Run a separate interpreter: app reads its DB configuration on import.
            script=r'''
import json
from wsgiref.simple_server import make_server, WSGIRequestHandler
from threading import Thread
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from wsgi import application
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
finally:
 server.shutdown()
'''
            result=subprocess.run([sys.executable,"-c",script],cwd=os.path.dirname(__file__),
                env=env,capture_output=True,text=True,timeout=90)
            self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)

if __name__=="__main__":
    unittest.main()
