"""Check the configured VAPID pair without printing secrets or generating keys."""
import base64
import hashlib
import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def check():
    private=os.environ.get("MILE_VAPID_PRIVATE_KEY_B64","")
    public=os.environ.get("MILE_VAPID_PUBLIC_KEY","")
    if not private or not public:raise ValueError("VAPID configuration missing")
    key=serialization.load_pem_private_key(base64.b64decode(private,validate=True),password=None)
    if not isinstance(key,ec.EllipticCurvePrivateKey) or not isinstance(key.curve,ec.SECP256R1):
        raise ValueError("Unexpected VAPID key type")
    expected=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    actual=base64.b64decode(public+"="*(-len(public)%4),altchars=b"-_",validate=True)
    if actual!=expected:raise ValueError("VAPID public/private mismatch")
    return hashlib.sha256(expected).hexdigest()

if __name__=="__main__":
    try: print("VAPID public key fingerprint:",check())
    except Exception:
        raise SystemExit("STOP: missing or invalid VAPID configuration")
