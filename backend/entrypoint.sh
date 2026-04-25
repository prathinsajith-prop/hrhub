#!/bin/sh
set -e

echo "▶ Running database migrations..."
node dist/db/migrate.js

echo "▶ Starting HRHub API..."
exec node dist/index.js
