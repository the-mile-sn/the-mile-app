import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
key=ec.generate_private_key(ec.SECP256R1())
private=base64.b64encode(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())).decode()
public=base64.urlsafe_b64encode(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)).decode().rstrip("=")
print("export MILE_VAPID_PRIVATE_KEY_B64="+private+" MILE_VAPID_PUBLIC_KEY="+public)
