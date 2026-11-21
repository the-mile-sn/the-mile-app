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

**Before activation:** verify both Render services share the intended PostgreSQL instance using non-secret environment metadata, agree on retention/deletion and employee permissions, review GDPR/privacy and message rate limits, merge the exact same domain code into the Admin branch, and integrate separate authenticated endpoints with HTTP-level cross-account and admin-preview tests. Only then approve additive database migration and enable real UI/polling.

## Schema v1

- `v2_chat_conversations`: unique `chef_id`, status timestamps.
- `v2_chat_memberships`: explicitly authorized staff and Chef participant, revocable staff access.
- `v2_chat_messages`: message, author, creation time, author-scoped idempotency key; no attachments.
- `v2_chat_read_state`: monotonic per-person read cursor.
- `list_staff_conversations`: only explicitly assigned conversations; never implicit global inbox.

Application owners must commit a transaction after a send or read operation. This initial library has no scheduled tasks, push, WebSockets, notifications or external service fees.
