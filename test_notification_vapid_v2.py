"""VAPID preflight tests; keys are generated in memory, never used for delivery."""
import base64
import os
import unittest
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from notification_vapid_check import check
from notification_dispatch_v2 import transport

def pair(prefix):
    key=ec.generate_private_key(ec.SECP256R1())
    pem=key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
    public=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    return {prefix+"_PRIVATE_KEY_B64":base64.b64encode(pem).decode(),
            prefix+"_PUBLIC_KEY":base64.urlsafe_b64encode(public).decode().rstrip("=")}

class VapidIsolationTests(unittest.TestCase):
    def test_admin_does_not_fall_back_to_legacy_key(self):
        with patch.dict(os.environ,{"MILE_SITE_ROLE":"admin",**pair("MILE_VAPID")},clear=True):
            with self.assertRaises(ValueError):check()
            with self.assertRaises(ValueError):transport()

    def test_new_admin_pair_and_player_pair_match(self):
        legacy=pair("MILE_VAPID")
        new={k.replace("MILE_VAPID","MILE_NOTIFICATIONS_VAPID"):v for k,v in legacy.items()}
        with patch.dict(os.environ,{"MILE_SITE_ROLE":"admin",**new},clear=True):
            fingerprint=check()
            self.assertTrue(callable(transport()))
            self.assertNotIn("MILE_VAPID_PRIVATE_KEY_B64",os.environ)
        with patch.dict(os.environ,{"MILE_SITE_ROLE":"player",**legacy},clear=True):
            self.assertEqual(check(),fingerprint)

    def test_mismatched_pair_rejected(self):
        first=pair("MILE_NOTIFICATIONS_VAPID")
        first["MILE_NOTIFICATIONS_VAPID_PUBLIC_KEY"]=pair("MILE_NOTIFICATIONS_VAPID")["MILE_NOTIFICATIONS_VAPID_PUBLIC_KEY"]
        with patch.dict(os.environ,first,clear=True):
            with self.assertRaises(ValueError):transport()

if __name__=="__main__":
    unittest.main()
