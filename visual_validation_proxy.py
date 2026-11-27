"""Same-origin switch between exact admin and player snapshots, for test only."""
import http.client
import http.cookies
import os
import json
import time
import threading
import traceback
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

def smoke(port, identifier, role, path):
    conn=http.client.HTTPConnection("127.0.0.1",port,timeout=25)
    origin=os.environ["MILE_BASE_URL"]
    conn.request("POST","/api/login",json.dumps({"identifier":identifier,"password":os.environ["MILE_VALIDATION_PASSWORD"]}),
                 {"Content-Type":"application/json","Origin":origin})
    response=conn.getresponse()
    cookie=response.getheader("Set-Cookie","").split(";",1)[0]
    response.read()
    if response.status!=200 or not cookie:
        raise RuntimeError("Synthetic login failed: "+role+" "+str(response.status))
    conn.request("GET","/api/me",headers={"Cookie":cookie})
    response=conn.getresponse()
    data=json.loads(response.read())
    if response.status!=200 or data.get("user",{}).get("role")!=role:
        raise RuntimeError("Synthetic role check failed: "+role)
    conn.request("GET",path,headers={"Cookie":cookie})
    response=conn.getresponse()
    response.read()
    if response.status!=200:
        raise RuntimeError("Synthetic API check failed: "+role+" "+str(response.status))
    conn.close()
    print("VISUAL_HTTP_SMOKE_OK",role,flush=True)

def verify():
    for port,identifier,role,path in (
        (10001,"validation-admin@example.invalid","admin","/api/v2/admin/i18n/overview"),
        (10002,"validationplayer","player","/api/v2/notifications/inbox"),
        (10002,"validationchef","chef","/api/v2/notifications/activation?device="+"b"*32),
    ):
        for attempt in range(30):
            try:
                smoke(port,identifier,role,path)
                break
            except (ConnectionRefusedError,ConnectionResetError):
                time.sleep(1)
        else:
            raise RuntimeError("Validation service did not start")
    Path(os.environ["MILE_VALIDATION_READY_FILE"]).touch()
    Path(os.environ["MILE_VALIDATION_STAGE_FILE"]).write_text("ready\n")
    print("VISUAL_VALIDATION_READY",flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self): self.proxy()
    def do_HEAD(self): self.proxy()
    def do_POST(self): self.proxy()
    def do_PUT(self): self.proxy()
    def do_PATCH(self): self.proxy()
    def do_DELETE(self): self.proxy()
    def proxy(self):
        if not Path(os.environ["MILE_VALIDATION_READY_FILE"]).exists():
            self.send_response(503)
            self.send_header("Content-Type","text/plain; charset=utf-8")
            self.send_header("Cache-Control","no-store")
            self.end_headers()
            if self.command!="HEAD": self.wfile.write(b"Validation startup not ready.")
            return
        route=urlsplit(self.path).path
        if route in ("/__validation/admin","/__validation/app"):
            mode=route.rsplit("/",1)[-1]
            self.send_response(303)
            self.send_header("Set-Cookie","mile_validation_mode="+mode+"; Path=/; Secure; HttpOnly; SameSite=Lax")
            self.send_header("Set-Cookie","mile_session=; Path=/; Secure; HttpOnly; Max-Age=0; SameSite=Lax")
            self.send_header("Location","/")
            self.send_header("Cache-Control","no-store")
            self.end_headers()
            return
        cookies=http.cookies.SimpleCookie()
        try: cookies.load(self.headers.get("Cookie",""))
        except http.cookies.CookieError: pass
        mode=cookies.get("mile_validation_mode")
        port=10001 if mode and mode.value=="admin" else 10002
        try: size=int(self.headers.get("Content-Length","0"))
        except ValueError: size=-1
        if not 0<=size<=25*1024*1024:
            self.send_error(413); return
        body=self.rfile.read(size) if size else None
        headers={k:v for k,v in self.headers.items() if k.lower() not in ("host","connection","transfer-encoding","accept-encoding")}
        headers["Host"]=urlsplit(os.environ["MILE_BASE_URL"]).netloc
        headers["X-Forwarded-Proto"]="https"
        conn=http.client.HTTPConnection("127.0.0.1",port,timeout=35)
        try:
            conn.request(self.command,self.path,body=body,headers=headers)
            response=conn.getresponse()
            content=response.read()
            self.send_response(response.status)
            for k,v in response.getheaders():
                if k.lower() not in ("connection","transfer-encoding","server","date","content-length"):
                    self.send_header(k,v)
            self.send_header("Content-Length",str(len(content)))
            self.end_headers()
            if self.command!="HEAD": self.wfile.write(content)
        except (OSError,http.client.HTTPException):
            self.send_error(502)
        finally:
            conn.close()

server=ThreadingHTTPServer(("0.0.0.0",int(os.environ.get("PORT","10000"))),Handler)
print("VISUAL_HTTP_BOUND",flush=True)
def check():
    try:
        verify()
    except Exception:
        traceback.print_exc()
        server.shutdown()
threading.Thread(target=check,daemon=True).start()
server.serve_forever()
if not Path(os.environ["MILE_VALIDATION_READY_FILE"]).exists():
    raise SystemExit(1)
