#!/bin/bash
# Upsert production users into the dev database (identity flows prod → dev;
# content never does). Runs on every dev deploy.
set -euo pipefail

PROD_DB=/var/lib/cofind/cofind.db
DEV_DB=/var/lib/cofind-dev/cofind.db

sqlite3 "$DEV_DB" <<SQL
ATTACH DATABASE '$PROD_DB' AS prod;
INSERT INTO users (id, handle, display_name, password_hash, created_at)
  SELECT id, handle, display_name, password_hash, created_at FROM prod.users WHERE true
  ON CONFLICT(id) DO UPDATE SET
    handle = excluded.handle,
    display_name = excluded.display_name,
    password_hash = excluded.password_hash;
SQL

echo "dev users synced: $(sqlite3 "$DEV_DB" 'SELECT COUNT(*) FROM users')"
