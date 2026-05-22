#!/usr/bin/env bash
# Compares each Drizzle schema table defined in backend-portal/src/db/schema/
# against its sibling in backend/src/db/schema/ and reports column-level drift.
#
# Background:
#   The portal duplicates Drizzle schema files instead of importing them from
#   the main backend. Whenever a migration changes a column on the admin side,
#   the portal's mirror has to be updated by hand. Forgetting causes 500s the
#   next time the portal touches that table (see the `jurisdiction →
#   business_type` incident — backend-portal kept selecting a column that no
#   longer existed).
#
# Run before pushing portal changes and after applying a new migration:
#   ./scripts/check-portal-schema-drift.sh
#
# Exit 0 = clean. Exit 1 = drift detected (column declared on the portal that
# doesn't exist on main — guarantees a runtime 500). Exit 2 = fatal error.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exec python3 - "$ROOT" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
main_dir = root / "backend" / "src" / "db" / "schema"
portal_dir = root / "backend-portal" / "src" / "db" / "schema"

if not main_dir.is_dir() or not portal_dir.is_dir():
    print(f"fatal: expected {main_dir} and {portal_dir} to exist", file=sys.stderr)
    sys.exit(2)

# Matches: pgTable('foo', { ... }) — capturing the table name + a heuristic
# body. Drizzle table definitions are always single top-level statements, so
# we anchor on the `export const ... = pgTable('name', {` opener and grab
# every line until the matching `})` at column 0 or inside `}, (t) =>` form.
TABLE_OPEN = re.compile(r"export\s+const\s+\w+\s*=\s*pgTable\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*\{")
# Column declaration inside a table body — `<name>: <type>(...)` at indent.
# We deliberately use a tight set of types: any drizzle-orm/pg-core helper
# that produces an actual column. .references(), .notNull(), comments, and
# everything else after the type call are ignored.
COL_DECL = re.compile(
    r"^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"
    r"(?:text|uuid|jsonb|jsonb|boolean|timestamp|date|numeric|integer|serial|bigint)\("
)


def parse_tables(file: Path) -> dict[str, set[str]]:
    """Return {table_name: {column_names}} for one schema file."""
    src = file.read_text()
    tables: dict[str, set[str]] = {}
    for match in TABLE_OPEN.finditer(src):
        name = match.group(1)
        # Walk forward from the opening brace, tracking brace depth so we can
        # detect the matching close. Drizzle's `}, (t) => ({...}))` pattern
        # has the columns-body close before the indexes-body opens; we only
        # care about column declarations between the first { and the matching }.
        start = match.end() - 1  # position of the `{`
        depth = 0
        end = start
        for i in range(start, len(src)):
            ch = src[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        body = src[start + 1 : end]
        cols = set()
        for line in body.splitlines():
            m = COL_DECL.match(line)
            if m:
                cols.add(m.group(1))
        if cols:
            tables[name] = cols
    return tables


# Build the union of tables across ALL main schema files. The portal might
# reference a table whose main definition lives in a file named differently.
main_tables: dict[str, set[str]] = {}
for f in sorted(main_dir.glob("*.ts")):
    if f.name == "index.ts":
        continue
    for t, cols in parse_tables(f).items():
        # If a table is defined in multiple main files (shouldn't happen, but
        # defensive), union the columns.
        main_tables.setdefault(t, set()).update(cols)

# Compare portal-side per file, table-by-table.
total_drift = 0
total_gap = 0
total_orphan = 0

for portal_file in sorted(portal_dir.glob("*.ts")):
    if portal_file.name == "index.ts":
        continue
    portal_tables = parse_tables(portal_file)
    for tbl_name, portal_cols in portal_tables.items():
        if tbl_name not in main_tables:
            print(f"ℹ  {portal_file.name}: table '{tbl_name}' is portal-only (no sibling in main)")
            total_orphan += 1
            continue
        main_cols = main_tables[tbl_name]
        only_portal = portal_cols - main_cols  # ← will cause 500 at runtime
        only_main = main_cols - portal_cols     # ← silent data gap

        if only_portal:
            print(f"❌ DRIFT  {portal_file.name} [{tbl_name}] declares columns absent from main:")
            for col in sorted(only_portal):
                print(f"      - {col}")
            total_drift += 1
        if only_main:
            print(f"⚠  GAP    {portal_file.name} [{tbl_name}] missing columns added on main:")
            for col in sorted(only_main):
                print(f"      + {col}")
            total_gap += 1

print()
if total_drift > 0:
    print(f"💥 {total_drift} table(s) have drift — these WILL cause runtime 500s.")
    print("   Remove or rename the offending columns in backend-portal/src/db/schema/.")
    sys.exit(1)
if total_gap > 0:
    print(f"⚠  {total_gap} table(s) have soft gaps — main has columns the portal hasn't mirrored.")
    print("   Not a runtime error, but the portal can't read/write those fields.")
print(f"✅ No drift detected. (gaps: {total_gap}, portal-only tables: {total_orphan})")
PY
