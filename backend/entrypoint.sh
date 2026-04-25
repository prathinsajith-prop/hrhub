#!/bin/sh
set -e

# NOTE: Dependencies are baked into the runtime image at build time (multi-stage
# Dockerfile copies pruned node_modules from the prod-deps stage). We do NOT run
# `pnpm install` here — pnpm is not present in the runtime image and would fail.

echo "▶ Running database migrations..."
node dist/db/migrate.js

# Optional one-shot seed. Set RUN_SEED=true on the first deploy only; the seed
# itself is idempotent (guarded by tradeLicenseNo) and will exit cleanly if the
# demo tenant already exists, so leaving it on is safe but wasteful.
if [ "${RUN_SEED:-false}" = "true" ]; then
    echo "▶ Seeding database (idempotent)..."
    node dist/db/seed.js
fi

echo "▶ Starting HRHub API..."
exec node dist/index.js
