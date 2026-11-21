# The Mile — Chef messaging backend: foundation only

**Status:** code + disposable-database tests only. **Not activated in production.**

## Confirmed architectural decision

- One conversation per authenticated Chef with a The Mile staff team.
- The Chef's player association is verified via the existing `v2_chef_links`; no user-supplied athlete ID is trusted.
- Each authorized staff member participates explicitly in a conversation, with independent read state.
- Future nutritionist/client assignments will be modeled in a separate permission domain; **do not** grant access merely because a user is a professional or an administrator.
- The old notifications and push systems are legacy. New messaging **does not use or modify them**, and a new in-app alert model will be designed separately.
- This domain never approves or edits menus; proposals continue to use their existing approval flow.

## Files and deployment gate

`chat_messaging_v2.py` contains additive schema definitions and pure data operations; it is deliberately **not imported or initialized** by the production `app.py` / `wsgi.py` files.

`test_chat_messaging_v2.py` verifies SQLite, scopes, read state, idempotency and validation. `test_chat_postgres_v2.py` targets a disposable CI PostgreSQL instance. No production data or Render credentials are accessed by the tests.

**Before activation:** verify both Render services share the intended PostgreSQL instance using non-secret environment metadata, validate retention/deletion with legal/privacy review and employee permissions, review GDPR/privacy and message rate limits, and integrate separate authenticated endpoints with HTTP-level cross-account and admin-preview tests. Only then approve additive database migration and enable real UI/polling.

## Retention policy — provisional decision, 21 November 2026

**Provisional business rule approved:** keep operational messaging history while the Chef's professional relationship remains active and necessary; on confirmed end of relationship, archive the thread and mark it for **review 12 UTC calendar months after closure**. The 12-month period is a proposed business policy, **not a universal period imposed or automatically approved by the GDPR** (storage limitation under Article 5(1)(e)). It needs documented purpose, privacy/legal validation, appropriate notice and individual rights handling before real activation.

- Archive does not delete: staff membership and prior message history remain subject to permissions and review.
- `closed_at` is the closure timestamp; `retention_review_at` is 12 calendar months later, including leap-year handling; neither is calculated from the last message or login.
- The initial module **does not automatically delete, anonymise, retain under legal hold or schedule jobs**. A future reviewed process must assess legal obligations, rights requests, exceptions, backups and any clinical-record obligations before deleting data. Do not infer that all chats can always remain for 12 months.
- Relevant clinical information continues to be documented in its appropriate existing clinical system with separate access, lawful basis and retention rules.
- Chef/staff participation, read access and access revocation remain independent of retention length; operational access ends when no longer authorized.
- **App disclosure to add before chat activation:** in Messages provide an accessible «Informações e privacidade» entry, linked to the privacy notice, explaining in PT and EN that messages are retained while the professional relationship is active and that closed conversations are ordinarily reviewed for deletion 12 months after closure, subject to legal duties and rights requests. Do not add a misleading consent checkbox or show this policy as a guarantee of deletion at exactly 12 months.
- Add archive/review/audit trail UI to the backoffice only in the later activation phase. The retention_review_at date is a review trigger, not an automatic purge.
- This module is still **unregistered in production**, so no tables or new retention timers are active.

The module’s `archive_conversation()` checks explicit authorized active staff membership, is idempotent and refuses further sends to the closed thread; it does not delete message rows. Tests cover archive access, 12-month UTC anniversary, leap years and message preservation on both SQLite and disposable PostgreSQL.

## Schema v1

- `v2_chat_conversations`: unique `chef_id`, creation/activity timestamps, closure time and `retention_review_at` (no automatic deletion).
- `v2_chat_memberships`: explicitly authorized staff and Chef participant, revocable staff access.
- `v2_chat_messages`: message, author, creation time, author-scoped idempotency key; no attachments.
- `v2_chat_read_state`: monotonic per-person read cursor.
- `list_staff_conversations`: only explicitly assigned conversations; never implicit global inbox.

Application owners must commit a transaction after a send or read operation. This initial library has no scheduled tasks, push, WebSockets, notifications or external service fees.
