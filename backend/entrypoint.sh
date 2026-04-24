#!/bin/sh
set -e

echo "▶ Running database migrations..."
node dist/db/migrate.js
echo "✔ Migrations complete."

echo "▶ Starting HRHub API..."
exec node dist/index.js
