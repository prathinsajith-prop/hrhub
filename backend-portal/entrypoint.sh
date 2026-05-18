#!/bin/sh
set -e

# This service is intentionally migration-free — schema changes are owned by the
# main backend (./backend). The portal reads/writes the same tables through its
# duplicated schema mirrors in src/db/schema/, but must NEVER run drizzle-kit
# generate/push/migrate here. If a schema change is needed, deploy the main
# backend first (which applies the migration), then deploy this service with an
# updated schema mirror.

echo "▶ Starting HRHub Portal API..."
exec node dist/index.js
