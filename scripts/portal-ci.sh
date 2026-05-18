#!/usr/bin/env bash
# Run the same checks GitHub Actions runs for backend-portal + frontend-portal.
# Usage:
#   scripts/portal-ci.sh                # run everything
#   scripts/portal-ci.sh backend        # backend only
#   scripts/portal-ci.sh frontend       # frontend only
#   scripts/portal-ci.sh --fix          # autofix lint where possible
#
# Exits non-zero on the first failure so you can wire it into a pre-push hook.

set -e

# ── colours (only when stdout is a TTY) ─────────────────────────────────────
if [ -t 1 ]; then
    BOLD=$(printf '\033[1m'); GREEN=$(printf '\033[32m'); RED=$(printf '\033[31m')
    YELLOW=$(printf '\033[33m'); CYAN=$(printf '\033[36m'); DIM=$(printf '\033[2m')
    RESET=$(printf '\033[0m')
else
    BOLD=""; GREEN=""; RED=""; YELLOW=""; CYAN=""; DIM=""; RESET=""
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
FIX_FLAG=""
if [ "$1" = "--fix" ] || [ "$2" = "--fix" ]; then
    FIX_FLAG="--fix"
fi

step() {
    echo ""
    echo "${BOLD}${CYAN}── $1${RESET}"
}

run() {
    local label="$1"; shift
    echo "${DIM}\$ $*${RESET}"
    if "$@"; then
        echo "${GREEN}✓ $label${RESET}"
    else
        echo "${RED}✗ $label failed${RESET}"
        exit 1
    fi
}

# ── Backend portal ───────────────────────────────────────────────────────────
check_backend() {
    cd "$ROOT/backend-portal"
    step "backend-portal — install"
    run "install" pnpm install --frozen-lockfile

    step "backend-portal — type-check"
    run "tsc" pnpm exec tsc --noEmit

    step "backend-portal — lint"
    if [ -n "$FIX_FLAG" ]; then
        run "lint --fix" pnpm exec eslint src --ext .ts $FIX_FLAG
    else
        run "lint" pnpm lint
    fi

    step "backend-portal — build"
    run "build" pnpm build
}

# ── Frontend portal ──────────────────────────────────────────────────────────
check_frontend() {
    cd "$ROOT/frontend-portal"
    step "frontend-portal — install"
    run "install" pnpm install --frozen-lockfile

    step "frontend-portal — type-check"
    run "tsc" pnpm exec tsc -p tsconfig.app.json --noEmit

    step "frontend-portal — lint"
    if [ -n "$FIX_FLAG" ]; then
        run "lint --fix" pnpm exec eslint src --ext .ts,.tsx $FIX_FLAG
    else
        run "lint" pnpm exec eslint src --ext .ts,.tsx
    fi

    step "frontend-portal — build"
    run "build" pnpm build
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "$TARGET" in
    backend|be)
        check_backend
        ;;
    frontend|fe)
        check_frontend
        ;;
    all|--fix|"")
        check_backend
        check_frontend
        ;;
    *)
        echo "${YELLOW}Unknown target: $TARGET${RESET}"
        echo "Usage: $0 [backend|frontend|all] [--fix]"
        exit 2
        ;;
esac

echo ""
echo "${BOLD}${GREEN}✓ Portal CI passed.${RESET}"
