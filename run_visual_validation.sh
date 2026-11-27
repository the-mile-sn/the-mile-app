#!/bin/sh
set -eu
if [ -n "${DATABASE_URL:-}" ]; then
    echo "External database forbidden in validation" >&2
    exit 1
fi
: "${MILE_VALIDATION_PASSWORD:?Set a synthetic account password}"
root="$(mktemp -d /tmp/mile-notify-pg-XXXXXXXX)"
mkdir "$root/socket"
chown -R postgres:postgres "$root"
chmod 700 "$root" "$root/socket"
runuser -u postgres -- initdb -D "$root/data" -A trust --no-locale -E UTF8 >/dev/null
runuser -u postgres -- pg_ctl -D "$root/data" -o "-h '' -k $root/socket -c shared_buffers=16MB -c max_connections=20" -w start >/dev/null
runuser -u postgres -- createdb -h "$root/socket" mile_notification_validation
export MILE_VALIDATION_SOCKET="$root/socket"
runuser -u postgres --preserve-environment -- python /srv/admin/validate_notifications_postgres.py
export DATABASE_URL="dbname=mile_notification_validation user=postgres host=$root/socket"
export MILE_DATA_DIR="$root/portal"
export MILE_BASE_URL="https://the-mile-notifications-pg-validation.onrender.com"
export MILE_NOTIFICATIONS_PREVIEW=1 MILE_NOTIFICATIONS_CAPTURE=1 MILE_NOTIFICATIONS_SEND=1 MILE_NOTIFICATIONS_PUSH_SEND=1 MILE_NOTIFICATIONS_INBOX=1 MILE_NOTIFICATIONS_PUSH=1
export MILE_NOTIFICATIONS_TEST_RECIPIENT_IDS="validation-player,validation-chef"
export MILE_BACKOFFICE_TRANSLATIONS_ENABLED=1
# Generated exclusively for this temporary instance. No production credentials.
eval "$(python /srv/admin/visual_validation_keys.py)"
cd /srv/admin
MILE_SITE_ROLE=admin python visual_validation_wsgi.py initialize
cd /srv/admin/validation_player
PYTHONPATH=/srv/admin MILE_SITE_ROLE=player python /srv/admin/visual_validation_wsgi.py initialize-player
cd /srv/admin
MILE_SITE_ROLE=admin python visual_validation_wsgi.py seed
MILE_SITE_ROLE=admin gunicorn --workers 1 --threads 2 --bind 127.0.0.1:10001 visual_validation_wsgi:application &
admin_pid=$!
cd /srv/admin/validation_player
PYTHONPATH=/srv/admin MILE_SITE_ROLE=player gunicorn --chdir /srv/admin/validation_player --workers 1 --threads 2 --bind 127.0.0.1:10002 visual_validation_wsgi:application &
player_pid=$!
cd /srv/admin
cleanup() {
  kill "$admin_pid" "$player_pid" 2>/dev/null || true
  runuser -u postgres -- pg_ctl -D "$root/data" -m fast -w stop >/dev/null || true
  rm -rf "$root"
}
trap cleanup EXIT INT TERM
python visual_validation_proxy.py
