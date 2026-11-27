#!/bin/sh
set -eu
if [ -n "${DATABASE_URL:-}" ]; then
    echo "Refusing external database configuration" >&2
    exit 1
fi
root="$(mktemp -d /tmp/mile-notify-pg-XXXXXXXX)"
mkdir "$root/socket"
chown -R postgres:postgres "$root"
chmod 700 "$root" "$root/socket"
runuser -u postgres -- initdb -D "$root/data" -A trust --no-locale -E UTF8 >/dev/null
runuser -u postgres -- pg_ctl -D "$root/data" -o "-h '' -k $root/socket" -w start >/dev/null
cleanup() {
    runuser -u postgres -- pg_ctl -D "$root/data" -m fast -w stop >/dev/null || true
    rm -rf "$root"
}
trap cleanup EXIT INT TERM
runuser -u postgres -- createdb -h "$root/socket" mile_notification_validation
export MILE_VALIDATION_SOCKET="$root/socket"
runuser -u postgres --preserve-environment -- /opt/validation/bin/python /validation/validate_notifications_postgres.py
cleanup
trap - EXIT INT TERM
echo "NOTIFICATIONS_POSTGRES_VALIDATION_PASSED"
exec /opt/validation/bin/python -c 'import os; from http.server import HTTPServer,BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200 if self.path=="/" else 404); self.end_headers()
  if self.path=="/": self.wfile.write(b"PostgreSQL validation passed; synthetic data only.")
HTTPServer(("0.0.0.0",int(os.environ.get("PORT","10000"))),Handler).serve_forever()'
