#!/usr/bin/env bash
#
# Run the SQL tests against a throwaway Postgres.
#
# The order trigger decides what every customer is charged, and it is plpgsql inside a migration —
# so without this it is only ever exercised in production. This spins up a cluster in /tmp, builds
# the smallest schema the trigger touches, applies the real migration unedited, and runs the
# assertions in tests/sql/. Nothing here touches Supabase.
#
#   npm run test:sql
#
# Requires the postgresql server binaries (Debian/Ubuntu: apt-get install postgresql).
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/pg-sqltests}"
PGPORT="${PGPORT:-5433}"
PGSOCK="${PGSOCK:-/tmp}"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "SKIP: no Postgres server binaries at $PGBIN. Set PGBIN, or install postgresql." >&2
  exit 0
fi

# initdb refuses to run as root, so use an unprivileged owner when we are.
RUNNER=""
if [ "$(id -u)" = "0" ]; then
  id -u pgtest >/dev/null 2>&1 || useradd -m pgtest
  RUNNER="pgtest"
fi
run() { if [ -n "$RUNNER" ]; then su "$RUNNER" -c "PATH=$PGBIN:\$PATH $*"; else PATH="$PGBIN:$PATH" sh -c "$*"; fi; }

cleanup() { run "pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
rm -f "$PGSOCK/.s.PGSQL.$PGPORT" "$PGSOCK/.s.PGSQL.$PGPORT.lock"
rm -rf "$PGDATA"
mkdir -p "$PGDATA"
[ -n "$RUNNER" ] && chown "$RUNNER" "$PGDATA"

run "initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
# Unix socket only: no TCP listener means no port to collide with a stale cluster or anything else
# already running on this machine.
run "pg_ctl -D $PGDATA -l /tmp/pg-sqltests.log -o \"-p $PGPORT -k $PGSOCK -c listen_addresses=''\" start" >/dev/null
for _ in $(seq 1 20); do
  "$PGBIN/pg_isready" -h "$PGSOCK" -p "$PGPORT" >/dev/null 2>&1 && break
done

psql() { "$PGBIN/psql" -h "$PGSOCK" -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -f tests/sql/discount_harness.sql
psql -f supabase/migrations/20260823120000_discounts.sql >/dev/null
psql -f tests/sql/discount_math.sql 2>&1 | sed -e 's/^psql:[^ ]* //' -e '/^NOTICE:  $/d' -e 's/^NOTICE:  //'

echo
echo "SQL tests passed."
