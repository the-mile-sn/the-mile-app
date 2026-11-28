# Notifications v2 — controlled production readiness

No change to live services is authorized by this checklist. Validation uses synthetic accounts and a separate database; never use the production database for testing.

## Before a production release
- Confirm both production services use the same intended persistent PostgreSQL database and the expected domains. Do not relax the database network allowlist.
- Verify the same stable VAPID pair in both services with `python notification_vapid_check.py`; record only public key fingerprints. Do not generate a key on each startup or rotate a working key.
- Review feature branch diffs and run synthetic regression and integration tests, including explicit subscription recovery and cross-account/session isolation.
- Obtain a verified backup. From the reviewed Admin build with all notification flags disabled, run `python migrate_notifications_v2.py` (read-only). Only after review and backup confirmation, run `python migrate_notifications_v2.py --apply --backup-confirmed`. Stop if an unexpected or partial schema is found.
- App production auto-deploys on main. Admin production deploys manually. Coordinate separately; do not enable flags until both builds and schema are confirmed.
- Keep SEND and PUSH_SEND off initially. Check preview, translations and inbox without dispatch. Configure a small explicitly authorized recipient allowlist; retain the manual confirmation and existing send limits. Enable capture and sending only after approval.
- On persistent isolated validation, activate player and chef, record a notification, deploy the same commit again without changing keys, verify preferences, inbox/read state and push delivery. A deployment on disposable storage does not prove persistence.
- Rollback: turn off new notification flags and restore the previous known-good builds if required; leave additive tables intact. Do not drop or rewrite existing clinical tables or legacy subscriptions.

## Persistent validation setup
The existing Render service is free and has no persistent disk. If explicitly approved, use a paid plan that supports a disk, attach a dedicated empty disk mounted at `/var/data`, and set `MILE_VALIDATION_PERSIST=1` only on `the-mile-notifications-pg-validation`. Do not use the production app disk or a production database. The first boot creates synthetic data and a new test key pair; subsequent boots reuse them. Record the public-key fingerprint and test the same installed PWA before and after an ordinary redeploy. A missing key on an existing validation database stops startup instead of rotating it. Do not delete the validation disk when rolling back.
