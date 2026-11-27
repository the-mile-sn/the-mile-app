"""Manual, bounded v2 push dispatch. No scheduler, retries or legacy writes."""
import hashlib
import json
import os
import base64
import time
from notification_activation_v2 import _endpoint

def confirmation_digest(rows):
    return hashlib.sha256(json.dumps(rows,sort_keys=True,ensure_ascii=False,
        separators=(",",":")).encode()).hexdigest()

def lock_manual(c):
    # PostgreSQL transaction lock serialises manual v2 submissions only.
    if hasattr(c,"conn"):
        c.execute("SELECT pg_advisory_xact_lock(?)",(184028731,))
    else:
        c.execute("UPDATE v2_manual_notifications SET id=id WHERE 1=0")

def allowed_recipients():
    return {x.strip() for x in os.environ.get("MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS","").split(",") if x.strip()}

def enabled():
    return (os.environ.get("MILE_NOTIFICATIONS_SEND")=="1"
            and bool(allowed_recipients()))

def transport():
    from pywebpush import webpush, WebPushException
    from cryptography.hazmat.primitives import serialization
    key=serialization.load_pem_private_key(base64.b64decode(
        os.environ["MILE_VAPID_PRIVATE_KEY_B64"]),password=None)
    der=key.private_bytes(serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,
                          serialization.NoEncryption())
    private=base64.urlsafe_b64encode(der).rstrip(b"=").decode("ascii")
    def send(sub,payload):
        try:
            _endpoint(sub["endpoint"])
            response=webpush(subscription_info={"endpoint":sub["endpoint"],
                "keys":{"p256dh":sub["p256dh"],"auth":sub["auth"]}},
                data=json.dumps(payload),vapid_private_key=private,
                vapid_claims={"sub":"mailto:themile.sn@gmail.com"},timeout=3,ttl=300)
            status=getattr(response,"status_code",0)
            return "accepted" if 200<=status<300 else "failed"
        except WebPushException as exc:
            status=getattr(getattr(exc,"response",None),"status_code",None)
            return "failed" if status and 400<=status<500 else "unknown"
        except Exception:
            return "unknown"
    return send

def dispatch(c,ids,send,*,deadline_seconds=8):
    """Only newly committed IDs. Claim each notification once; never retry.
    A crash or timeout leaves unknown/not_attempted, never a false success.
    """
    result={}
    deadline=time.monotonic()+deadline_seconds
    for nid in ids:
        if time.monotonic()>=deadline:
            result[nid]="not_attempted"
            continue
        row=c.execute("""SELECT n.recipient_id,n.language FROM v2_manual_notifications n
            JOIN users u ON u.id=n.recipient_id
            WHERE n.id=? AND n.push_status='not_attempted' AND u.active=1""",(nid,)).fetchone()
        if not row:
            continue
        uid=row["recipient_id"]
        if uid not in allowed_recipients():
            continue
        claimed=c.execute("""UPDATE v2_manual_notifications SET push_status='unknown'
            WHERE id=? AND push_status='not_attempted'""",(nid,)).rowcount
        c.commit()
        if not claimed:
            continue
        subs=c.execute("""SELECT device_id,endpoint,p256dh,auth FROM v2_notification_devices
            WHERE user_id=? ORDER BY device_id""",(uid,)).fetchall()
        outcomes=[]
        for sub in subs:
            if time.monotonic()>=deadline:
                outcomes.append("unknown");break
            # Recheck device ownership immediately before contacting the gateway.
            current=c.execute("""SELECT 1 FROM v2_notification_devices
                WHERE device_id=? AND user_id=? AND endpoint=?""",
                (sub["device_id"],uid,sub["endpoint"])).fetchone()
            if current:
                try: outcomes.append(send(sub,{"version":2,"id":nid,"language":row["language"]}))
                except Exception: outcomes.append("unknown")
        status=("accepted" if "accepted" in outcomes else "unknown" if "unknown" in outcomes
                else "failed" if outcomes else "not_subscribed")
        c.execute("UPDATE v2_manual_notifications SET push_status=? WHERE id=?",(status,nid))
        c.commit()
        result[nid]=status
    return result
