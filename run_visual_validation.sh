#!/bin/sh
set -eu
export PYTHONUNBUFFERED=1
export PATH="/opt/validation/bin:$PATH"
echo "VISUAL_BOOT_BEGIN" >&2
if [ -n "${DATABASE_URL:-}" ]; then
    echo "External database forbidden in validation" >&2
    exit 1
fi
: "${MILE_VALIDATION_PASSWORD:?Set a synthetic account password}"
# Persistent mode is optional and restricted to a dedicated, explicitly mounted test disk.
persistent="${MILE_VALIDATION_PERSIST:-0}"
unset MILE_VALIDATION_KEY_FILE
if [ "$persistent" = 1 ]; then
  mountpoint -q /var/data || { echo "Dedicated validation disk /var/data required" >&2; exit 1; }
  storage="/var/data/the-mile-notification-validation"
  if [ -e "$storage" ] && [ ! -f "$storage/.synthetic-only-v1" ]; then
    echo "Unrecognized validation disk contents; refusing to reuse" >&2; exit 1
  fi
  mkdir -p "$storage"
  chmod 700 "$storage"
  touch "$storage/.synthetic-only-v1"
  mkdir -p "$storage/postgres" "$storage/portal" "$storage/keys"
  chown postgres:postgres "$storage" "$storage/postgres"
  chmod 700 "$storage/postgres" "$storage/keys"
  export MILE_VALIDATION_KEY_FILE="$storage/keys/vapid.pem"
  if [ -f "$storage/postgres/PG_VERSION" ] && [ ! -s "$MILE_VALIDATION_KEY_FILE" ]; then
    echo "Existing validation database without its VAPID key; refusing silent rotation" >&2; exit 1
  fi
  # Create the initial key before initializing PostgreSQL, so an interrupted first boot can resume.
  key_exports="$(python /srv/admin/visual_validation_keys.py)"
  unset key_exports
elif [ "$persistent" != 0 ]; then
  echo "Invalid MILE_VALIDATION_PERSIST" >&2; exit 1
fi
root="$(mktemp -d /tmp/mile-notify-pg-XXXXXXXX)"
pgdata="$root/data"
portal="$root/portal"
if [ "$persistent" = 1 ]; then
  pgdata="$storage/postgres"
  portal="$storage/portal"
fi
export MILE_VALIDATION_READY_FILE="$root/ready"
export MILE_VALIDATION_STAGE_FILE="$root/stage"
printf "%s\n" "database" > "$MILE_VALIDATION_STAGE_FILE"
admin_pid=""
player_pid=""
proxy_pid=""
cleanup() {
  status=$?
  trap - EXIT INT TERM
  echo "VISUAL_BOOT_EXIT status=$status stage=$(cat "$MILE_VALIDATION_STAGE_FILE" 2>/dev/null || true)" >&2
  for pid in "$admin_pid" "$player_pid" "$proxy_pid"; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  done
  if [ -f "$root/postgres.log" ] && [ "$status" -ne 0 ]; then tail -n 30 "$root/postgres.log" >&2; fi
  runuser -u postgres -- pg_ctl -D "$pgdata" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf "$root"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir "$root/socket"
chown -R postgres:postgres "$root"
chmod 700 "$root" "$root/socket"
echo "VISUAL_BOOT_DATABASE_INIT" >&2
if [ ! -f "$pgdata/PG_VERSION" ]; then
  runuser -u postgres -- initdb -D "$pgdata" -A trust --no-locale -E UTF8 >/dev/null
fi
runuser -u postgres -- pg_ctl -D "$pgdata" -l "$root/postgres.log" -o "-h '' -k $root/socket -c shared_buffers=16MB -c max_connections=20" -w -t 30 start
echo "VISUAL_BOOT_DATABASE_READY" >&2
if [ "$(runuser -u postgres -- psql -h "$root/socket" -d postgres -tA -c "SELECT 1 FROM pg_database WHERE datname='mile_notification_validation'")" != 1 ]; then
  runuser -u postgres -- createdb -h "$root/socket" mile_notification_validation
fi
export MILE_VALIDATION_SOCKET="$root/socket"
runuser -u postgres --preserve-environment -- /opt/validation/bin/python /srv/admin/validate_notifications_postgres.py
export DATABASE_URL="dbname=mile_notification_validation user=postgres host=$root/socket"
export MILE_DATA_DIR="$portal"
export MILE_BASE_URL="https://the-mile-notifications-pg-validation.onrender.com"
export MILE_NOTIFICATIONS_PREVIEW=1 MILE_NOTIFICATIONS_CAPTURE=1 MILE_NOTIFICATIONS_SEND=1 MILE_NOTIFICATIONS_PUSH_SEND=1 MILE_NOTIFICATIONS_INBOX=1 MILE_NOTIFICATIONS_PUSH=1
export MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS="validation-player,validation-chef"
export MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1
# Never reuse production keys. On persistent validation, load the same test pair.
key_exports="$(python /srv/admin/visual_validation_keys.py)"
eval "$key_exports"
unset key_exports
export MILE_NOTIFICATIONS_VAPID_PUBLIC_KEY="$MILE_VAPID_PUBLIC_KEY"
export MILE_NOTIFICATIONS_VAPID_PRIVATE_KEY_B64="$MILE_VAPID_PRIVATE_KEY_B64"
cd /srv/admin
echo "VISUAL_BOOT_ADMIN_INIT" >&2
printf "%s\n" "admin-init" > "$MILE_VALIDATION_STAGE_FILE"
timeout 120s /usr/bin/env MILE_SITE_ROLE=admin python visual_validation_wsgi.py initialize
cd /srv/admin/validation_player
echo "VISUAL_BOOT_PLAYER_INIT" >&2
printf "%s\n" "player-init" > "$MILE_VALIDATION_STAGE_FILE"
timeout 120s /usr/bin/env PYTHONPATH=/srv/admin MILE_SITE_ROLE=player python /srv/admin/visual_validation_wsgi.py initialize-player
cd /srv/admin
echo "VISUAL_BOOT_SEED" >&2
printf "%s\n" "seed" > "$MILE_VALIDATION_STAGE_FILE"
timeout 60s /usr/bin/env MILE_SITE_ROLE=admin python visual_validation_wsgi.py seed
echo "VISUAL_BOOT_GUNICORN" >&2
printf "%s\n" "workers" > "$MILE_VALIDATION_STAGE_FILE"
env -u MILE_VAPID_PUBLIC_KEY -u MILE_VAPID_PRIVATE_KEY_B64 MILE_SITE_ROLE=admin gunicorn --workers 1 --threads 2 --bind 127.0.0.1:10001 visual_validation_wsgi:application &
admin_pid=$!
cd /srv/admin/validation_player
PYTHONPATH=/srv/admin MILE_SITE_ROLE=player gunicorn --chdir /srv/admin/validation_player --workers 1 --threads 2 --bind 127.0.0.1:10002 visual_validation_wsgi:application &
player_pid=$!
cd /srv/admin
printf "%s\n" "http-smoke" > "$MILE_VALIDATION_STAGE_FILE"
python visual_validation_proxy.py
