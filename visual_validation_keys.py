"""Generate isolated validation VAPID keys, preserving them only on an opted-in disk."""
import base64
import hashlib
import os
from pathlib import Path
import tempfile
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def load_key():
    location=os.environ.get("MILE_VALIDATION_KEY_FILE")
    if not location:
        return ec.generate_private_key(ec.SECP256R1())
    path=Path(location)
    if path != Path("/var/data/the-mile-notification-validation/keys/vapid.pem"):
        raise RuntimeError("Unexpected validation key location")
    if path.exists():
        key=serialization.load_pem_private_key(path.read_bytes(),password=None)
    else:
        key=ec.generate_private_key(ec.SECP256R1())
        raw=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
        fd,tmp=tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(fd,"wb") as out:
                out.write(raw);out.flush();os.fsync(out.fileno())
            try:os.link(tmp,path)
            except FileExistsError:pass
        finally:
            os.unlink(tmp)
        key=serialization.load_pem_private_key(path.read_bytes(),password=None)
    if not isinstance(key,ec.EllipticCurvePrivateKey) or not isinstance(key.curve,ec.SECP256R1):
        raise RuntimeError("Invalid persisted validation key")
    return key

if __name__=="__main__":
    key=load_key()
    private=base64.b64encode(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())).decode()
    point=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    public=base64.urlsafe_b64encode(point).decode().rstrip("=")
    import sys
    print("VALIDATION_VAPID_FINGERPRINT "+hashlib.sha256(point).hexdigest(),file=sys.stderr)
    print("export MILE_VAPID_PRIVATE_KEY_B64="+private+" MILE_VAPID_PUBLIC_KEY="+public)
