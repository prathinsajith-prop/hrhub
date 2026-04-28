#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# ── Helpers ──────────────────────────────────────────────────────────────────
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
header() { echo; bold "══════════════════════════════════════"; bold "  $*"; bold "══════════════════════════════════════"; }

run_step() {
  local label="$1"; shift
  printf '  %-35s' "$label..."
  if "$@" >/tmp/ci-step.log 2>&1; then
    green "✓ PASS"
    (( PASS++ )) || true
  else
    red "✗ FAIL"
    (( FAIL++ )) || true
    cat /tmp/ci-step.log
  fi
}

# ── Backend ───────────────────────────────────────────────────────────────────
header "Backend"
cd "$ROOT/backend"

run_step "Install dependencies"  pnpm install --frozen-lockfile
run_step "Type-check"            pnpm exec tsc --noEmit
run_step "Lint (zero errors)"    pnpm lint
run_step "Build"                 pnpm build
run_step "Tests" env \
  DATABASE_URL="postgresql://stub:stub@localhost:5432/stub" \
  JWT_SECRET="ci-test-secret-at-least-32-characters-long" \
  REFRESH_TOKEN_SECRET="ci-test-refresh-secret-at-least-32-characters-long" \
  pnpm test

# ── Frontend ──────────────────────────────────────────────────────────────────
header "Frontend"
cd "$ROOT/frontend"

run_step "Install dependencies"  pnpm install --frozen-lockfile
run_step "Type-check"            pnpm exec tsc -p tsconfig.app.json --noEmit
run_step "Lint (zero errors)"    pnpm exec eslint src --ext .ts,.tsx
run_step "Tests"                 pnpm test
run_step "Build"                 pnpm build

# ── Summary ───────────────────────────────────────────────────────────────────
echo
bold "══════════════════════════════════════"
bold "  Results: $(green "$PASS passed")  $([ $FAIL -gt 0 ] && red "$FAIL failed" || echo '0 failed')"
bold "══════════════════════════════════════"
echo

[ $FAIL -eq 0 ]
