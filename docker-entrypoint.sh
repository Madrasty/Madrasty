#!/bin/sh
# Container startup: bring the schema up to date, ensure the admin bootstrap
# exists, then run the server. Runs against the Postgres/Redis services that
# docker-compose starts first (the app waits on their healthchecks).
set -e

echo "==> Running database migrations..."
npm run db:migrate --workspace @madrasty/server

echo "==> Seeding admin bootstrap (idempotent)..."
npm run db:seed --workspace @madrasty/server || echo "(seed skipped/failed — continuing)"

echo "==> Starting Madrasty app..."
exec npm run serve --workspace @madrasty/server
