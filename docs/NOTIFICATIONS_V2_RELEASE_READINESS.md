# Notifications v2 — controlled production readiness

No change to live services is authorized by this checklist. Validation uses synthetic accounts and a separate database; never use the production database for testing.

## Before a production release
- Confirm both production services use the same intended persistent PostgreSQL database and the expected domains. Do not relax the database network allowlist.
- Verify the same stable VAPID pair in both services with `python notification_vapid_check.py`; Admin must use MILE_NOTIFICATIONS_VAPID_PUBLIC_KEY and MILE_NOTIFICATIONS_VAPID_PRIVATE_KEY_B64, leaving legacy Admin keys absent. Record only public key fingerprints. Do not generate a key on each startup or rotate a working key.
- Review feature branch diffs and run synthetic regression and integration tests, including explicit subscription recovery and cross-account/session isolation.
- Obtain a verified backup. From the reviewed Admin build with all notification flags disabled, run `python migrate_notifications_v2.py` (read-only). Only after review and backup confirmation, run `python migrate_notifications_v2.py --apply --backup-confirmed`. Stop if an unexpected or partial schema is found.
- App production auto-deploys on main. Admin production deploys manually. Coordinate separately; do not enable flags until both builds and schema are confirmed.
- Keep SEND and PUSH_SEND off initially. Check preview, translations and inbox without dispatch. Configure a small explicitly authorized recipient allowlist; retain the manual confirmation and existing send limits. Enable capture and sending only after approval.
- Use the existing production services and PostgreSQL for the controlled pilot after synthetic regression passes and backup/migration. Activate the explicitly authorized player and chef, send, then redeploy without changing the keys and verify preferences, inbox/read state and delivery. Disposable staging alone does not prove persistence. No additional paid resources.
- Rollback: turn off new notification flags and restore the previous known-good builds if required; leave additive tables intact. Do not drop or rewrite existing clinical tables or legacy subscriptions.
