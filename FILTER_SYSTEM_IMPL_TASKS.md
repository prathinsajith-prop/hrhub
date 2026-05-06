---
title: Filter System Implementation
version: 1.0.0
stack: React + Fastify + TypeScript
status: not-started
---

# Filter System — Claude Working File

## How to Use This File

Work through phases in order. Each phase has:
- **Goal** — what gets built
- **Files** — exact paths to create or edit
- **Scaffold** — copy-paste starting code
- **Rules** — decisions already made, follow exactly
- **Done when** — concrete completion check

Mark tasks `[x]` as you complete them. Update `status` in frontmatter.

---

## System Wire Format (Never Change This)

```
Frontend → API:  GET /api/listings?q=downtown&filter=status:EQ(active);price:BETWEEN(100,500)&page=0&per_page=20&sort_by=created_at&sort_dir=desc

filter segment format:  field:OPERATOR(value)
multiple filters:       semicolon-separated
```

**Operator token map — frontend name → wire token:**

| Frontend | Wire Token | Notes |
|---|---|---|
| `contains` | `LIKE` | |
| `not_contains` | `NOT_LIKE` | |
| `equals` or `is` | `EQ` | both map to same token |
| `is_not` | `NEQ` | |
| `starts_with` | `STARTS_WITH` | |
| `ends_with` | `ENDS_WITH` | |
| `greater_than` | `GT` | |
| `less_than` | `LT` | |
| `gte` | `GTE` | |
| `lte` | `LTE` | |
| `in` | `IN` | |
| `not_in` | `NOT_IN` | |
| `between` | `BETWEEN` | value serialized as `min,max` or `from,to` |
| `before` | `DATE_LT` | date only |
| `after` | `DATE_GT` | date only |
| `on` | `DATE_EQ` | date only |
| `is_null` | `IS_NULL` | serialize as `field:IS_NULL()` — empty parens |
| `is_not_null` | `IS_NOT_NULL` | same — empty parens |

---

## Phase 1 — Shared Types

**Goal:** Single source of truth for all filter-related TypeScript types.

**File:** `src/types/filters.ts`

- [ ] Create the file with the scaffold below — do not add extra fields

```ts
export type FilterType =
  | 'text'
  | 'select'
  | 'multi_select'
  | 'tags'
  | 'date_range'
  | 'number_range'
  | 'toggle'
  | 'autocomplete'

export interface AppliedFilter {
  value: string | string[] | boolean | { from?: string; to?: string } | { min?: number; max?: number } | AutocompleteOption | AutocompleteOption[] | null
  operator?: string
}

export interface FilterOption {
  value: string | number
  label: string
}

export interface FilterConfig {
  name: string
  label: string
  type: FilterType
  options?: FilterOption[]
  quickOptions?: FilterOption[]
  operators?: FilterOption[]
  placeholder?: string
  maxLength?: number
  min?: number
  max?: number
  step?: number
  prefix?: string
  suffix?: string
  showSlider?: boolean
  suggestions?: string[]
  multiple?: boolean
  freeSolo?: boolean
  onSearch?: (query: string) => Promise<FilterOption[]>
}

export interface QuickFilter {
  name: string
  label: string
  filter: Record<string, AppliedFilter>
}

export interface SearchHistoryEntry {
  id: string
  searchText: string | null
  filters: Record<string, AppliedFilter> | null
  label: string
  timestamp: number
}

export interface AutocompleteOption {
  value: string | number
  label: string
}

export type FilterObject = Record<string, AppliedFilter>
```

**Done when:** `src/types/filters.ts` exists and compiles with no errors.

---

## Phase 2 — Primitive Filter Components

**Goal:** Seven leaf-level input components. Each is fully controlled — no internal value state.

**Folder:** `src/components/filters/`

### Rules for all primitives
- Props always: `value`, `onChange`, `operators?`, `currentOperator?`, `onOperatorChange?`, `onApply?`
- Never manage `value` state internally — always controlled
- `onApply` is optional; if provided, render an Apply button
- Operator pills/tabs sit above the input

---

### 2.1 TextFilter

**File:** `src/components/filters/TextFilter.tsx`

```ts
interface TextFilterProps {
  value: string
  onChange: (value: string, operator?: string) => void
  operators?: FilterOption[]
  currentOperator?: string
  onOperatorChange?: (op: string) => void
  onApply?: () => void
  placeholder?: string
  maxLength?: number
}
```

Default operators: `contains · equals · starts_with · ends_with`

- [ ] Operator selector (pills or tabs)
- [ ] Text input
- [ ] Optional Apply button

---

### 2.2 SelectFilter

**File:** `src/components/filters/SelectFilter.tsx`

```ts
interface SelectFilterProps {
  value: string | string[]
  onChange: (value: string | string[]) => void
  options: FilterOption[]
  operators?: FilterOption[]
  currentOperator?: string
  onOperatorChange?: (op: string) => void
  showApplyButton?: boolean
  onApply?: () => void
}
```

Default operators: `is · is_not · in · not_in`

Multi-mode rule:
```ts
const isMulti = Array.isArray(value) || currentOperator === 'in' || currentOperator === 'not_in'
```

Coercion on operator switch:
- `is` / `is_not` → scalar: if value is array use `value[0]`
- `in` / `not_in` → array: if value is scalar wrap in `[value]`

- [ ] Operator selector
- [ ] Single select or multi-select list (driven by `isMulti`)
- [ ] Auto-coerce on operator change

---

### 2.3 DateRangeFilter

**File:** `src/components/filters/DateRangeFilter.tsx`

```ts
interface DateRangeFilterProps {
  value: { from?: string; to?: string }
  onChange: (value: { from?: string; to?: string }) => void
  operators?: FilterOption[]
  currentOperator?: string
  onOperatorChange?: (op: string) => void
  onApply?: () => void
}
```

Default operators: `on · before · after · between`

Layout rule:
- `between` → two date inputs (from + to)
- anything else → one date input (use `from` field)
- Switching away from `between` → clear `to`

- [ ] Operator selector
- [ ] Conditional one/two date inputs
- [ ] Clear `to` on operator switch

---

### 2.4 NumberRangeFilter

**File:** `src/components/filters/NumberRangeFilter.tsx`

```ts
interface NumberRangeFilterProps {
  value: { min?: number; max?: number }
  onChange: (value: { min?: number; max?: number }) => void
  minLimit?: number
  maxLimit?: number
  step?: number
  prefix?: string
  suffix?: string
  showSlider?: boolean
  operators?: FilterOption[]
  currentOperator?: string
  onOperatorChange?: (op: string) => void
  onApply?: () => void
}
```

Default operators: `equals · greater_than · less_than · between`

Layout rule:
- `between` → two inputs (min + max) + optional slider
- anything else → one input (use `min` field)
- Switching away from `between` → clear `max`

- [ ] Operator selector
- [ ] Conditional one/two numeric inputs
- [ ] Optional range slider when `showSlider && operator === 'between'`
- [ ] Clear `max` on operator switch

---

### 2.5 AutocompleteFilter

**File:** `src/components/filters/AutocompleteFilter.tsx`

```ts
interface AutocompleteFilterProps {
  value: AutocompleteOption | AutocompleteOption[] | null
  onChange: (value: AutocompleteOption | AutocompleteOption[] | null) => void
  options: AutocompleteOption[]
  multiple?: boolean
  freeSolo?: boolean
  loading?: boolean
  onInputChange?: (query: string) => void
  operators?: FilterOption[]
  currentOperator?: string
  onOperatorChange?: (op: string) => void
  quickOptions?: FilterOption[]
}
```

- [ ] Combobox with search input
- [ ] Call `onInputChange` on each keystroke (parent handles async fetch)
- [ ] Show `quickOptions` as chips above the input for one-click values
- [ ] Support `multiple` mode (renders tag-style chips inside input)

---

### 2.6 TagFilter

**File:** `src/components/filters/TagFilter.tsx`

```ts
interface TagFilterProps {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  maxTags?: number
}
```

No operator UI — always uses `in` on the wire.

- [ ] Text input — Enter key appends a tag
- [ ] Suggestion chips — click appends
- [ ] Each added tag shown as a deletable chip
- [ ] Respect `maxTags` limit

---

### 2.7 ToggleFilter

**File:** `src/components/filters/ToggleFilter.tsx`

```ts
interface ToggleFilterProps {
  value: boolean
  onChange: (value: boolean) => void
  label?: string
  type?: 'switch' | 'checkbox'
}
```

No operator UI — value goes straight to wire as `1` / `0`.

- [ ] Switch or checkbox (default: switch)
- [ ] Show `label` next to control

---

### 2.8 Barrel export

**File:** `src/components/filters/index.ts`

```ts
export { TextFilter } from './TextFilter'
export { SelectFilter } from './SelectFilter'
export { DateRangeFilter } from './DateRangeFilter'
export { NumberRangeFilter } from './NumberRangeFilter'
export { AutocompleteFilter } from './AutocompleteFilter'
export { TagFilter } from './TagFilter'
export { ToggleFilter } from './ToggleFilter'
```

**Done when:** All 7 files exist, barrel exports compile, each component renders in isolation.

---

## Phase 3 — AdvancedSearchBar

**Goal:** Orchestrator that composes all primitives inside a popover. This is the main filter UI.

**File:** `src/components/AdvancedSearchBar.tsx`

### Props

```ts
interface AdvancedSearchBarProps {
  config?: {
    filters: FilterConfig[]
    quickFilters?: QuickFilter[]
  }
  searchValue?: string
  appliedFilters?: FilterObject          // if provided → controlled mode
  onSearch?: (value: string) => void
  onAdvancedFilterApply?: (filters: FilterObject) => void
  placeholder?: string
  storageKey?: string                    // localStorage key, default: 'searchHistory'
  sortFiltersAlphabetically?: boolean
}
```

### Internal state

```ts
const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)
const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
const [expandedFilter, setExpandedFilter] = useState<string | null>(null)
const [localAppliedFilters, setLocalAppliedFilters] = useState<FilterObject>({})
const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
```

### Controlled vs uncontrolled rule

```ts
const isControlled = appliedFilters !== undefined
const activeFilters = isControlled ? appliedFilters : localAppliedFilters

function setActiveFilters(next: FilterObject) {
  if (isControlled) {
    onAdvancedFilterApply?.(next)
  } else {
    setLocalAppliedFilters(next)
  }
}
```

### Core functions to implement

**`handleApplyFilter(filterId, value, operator?)`**
```ts
// empty check: null | '' | [] | {} → remove key
// otherwise: setActiveFilters({ ...activeFilters, [filterId]: { value, operator } })
```

**`handleRemoveFilter(filterId)`**
```ts
const next = { ...activeFilters }
delete next[filterId]
setActiveFilters(next)
```

**`handleClearAllFilters()`**
```ts
setActiveFilters({})
```

**`renderFilterComponent(filter: FilterConfig)`**
```ts
switch (filter.type) {
  case 'text':         return <TextFilter ... />
  case 'select':       return <SelectFilter ... />
  case 'multi_select': return <SelectFilter ... />  // same component, multi-mode triggered by operator
  case 'tags':         return <TagFilter ... />
  case 'date_range':   return <DateRangeFilter ... />
  case 'number_range': return <NumberRangeFilter ... />
  case 'toggle':       return <ToggleFilter ... />
  case 'autocomplete': return <AutocompleteFilter ... />
}
```

**`formatFilterValue(config, value, operator): string`** — for chip labels
```ts
// string          → value as-is
// string[]        → value.join(', ')
// { from, to }    → `${from} – ${to}`
// { min, max }    → `${config.prefix ?? ''}${min} – ${max}${config.suffix ?? ''}`
// boolean         → value ? 'Yes' : 'No'
// AutocompleteOption → option.label
// AutocompleteOption[] → options.map(o => o.label).join(', ')
```

### Popover structure

```
<TextField>
  startAdornment:
    TuneIcon (Badge count=Object.keys(activeFilters).length) → onClick open popover
    {first 2 active filter chips} {remaining count chip "+N more"}
  endAdornment:
    {activeFilters has entries ? <CloseIcon onClick=clearAll /> : <SearchIcon />}

<Popover anchor=popoverAnchor>
  {Quick Filters section}
    {config.quickFilters.map chip → onClick: apply entire filter map}

  {showAdvancedOptions === false → Recent Searches panel}
    {searchHistory.map → label + timestamp, onClick restore, × delete}
    <Button onClick={() => setShowAdvancedOptions(true)}>Advanced Filters</Button>

  {showAdvancedOptions === true → Filter List panel}
    <SortToggle />
    {active filter chips — each deletable}
    {expandedFilter === null
      ? filter list rows (click row → setExpandedFilter(filter.name))
      : renderFilterComponent(expandedFilter) + back button}
    Footer: [Clear All] [Search → calls onSearch + saves history]
```

### Search history rules
- Key: `storageKey` prop (default `'searchHistory'`)
- Max: 10 entries — evict oldest on overflow
- De-duplicate: skip save if new entry is identical to most recent
- Label: if `searchText` is non-empty use it; otherwise build from filters: `"Status: Active, Price: $100–$500"`
- Restore: set search + filters then call `onSearch()` after 50 ms

- [ ] Controlled/uncontrolled logic
- [ ] `handleApplyFilter` / `handleRemoveFilter` / `handleClearAllFilters`
- [ ] `renderFilterComponent` dispatch
- [ ] `formatFilterValue` chip labels
- [ ] Popover with quick filters, history, advanced panel
- [ ] `expandedFilter` drill-down navigation
- [ ] Search history (localStorage read/write/delete)

**Done when:** Popover opens, all filter types render and update `activeFilters`, chips show, clear all works.

---

## Phase 4 — FilterBar (Page Layout Wrapper)

**Goal:** Thin wrapper that a page mounts. Normalises the object-map format from the API into the array format `AdvancedSearchBar` expects.

**File:** `src/components/FilterBar.tsx`

```ts
interface FilterBarProps {
  filters?: Record<string, FilterConfig>
  quickFilters?: Record<string, QuickFilter>
  placeholder?: string
  searchValue?: string
  appliedFilters?: FilterObject
  onSearch?: (value: string) => void
  onFiltersChange?: (filters: FilterObject) => void
}

export function FilterBar(props: FilterBarProps) {
  const filterArray = Object.values(props.filters ?? {})
  const quickFilterArray = Object.values(props.quickFilters ?? {})

  return (
    <AdvancedSearchBar
      config={{ filters: filterArray, quickFilters: quickFilterArray }}
      searchValue={props.searchValue}
      appliedFilters={props.appliedFilters}
      placeholder={props.placeholder}
      onSearch={props.onSearch}
      onAdvancedFilterApply={props.onFiltersChange}
    />
  )
}
```

- [ ] Create file with the scaffold above
- [ ] No additional logic needed — this is intentionally thin

**Done when:** `<FilterBar filters={record} />` renders without errors.

---

## Phase 5 — Per-Column Table Filters

**Goal:** Individual column header filter icons that open a lightweight popover (not the full advanced bar).

**Files:** `src/components/Table.tsx` (add filter logic), `src/components/QuickColumnFilter.tsx` (new)

### Column type addition

```ts
interface Column {
  key: string
  label: string
  sortable?: boolean
  filterable?: boolean  // add this
  filter_key?: string   // add this — maps to FilterConfig key
}
```

### Table filter state

```ts
const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null)
const [columnFilters, setColumnFilters] = useState<Record<string, AppliedFilter>>({})
```

### Render filter icon in column header

```ts
// Only render when all three are true:
col.filterable && col.filter_key && props.filters?.[col.filter_key]

<FunnelIcon
  onClick={(e) => { setFilterAnchorEl(e.currentTarget); setActiveFilterKey(col.filter_key) }}
  color={columnFilters[col.filter_key] ? 'primary' : 'default'}
/>
```

### `QuickColumnFilter` props

```ts
interface QuickColumnFilterProps {
  anchor: HTMLElement | null
  filterConfig: FilterConfig
  currentValue?: AppliedFilter
  onApply: (filterKey: string, filter: AppliedFilter) => void
  onClose: () => void
}
```

Supported types: `text · select · multiselect · number · date · daterange`

On apply:
```ts
setColumnFilters(prev => ({ ...prev, [filterKey]: { operator, value } }))
props.onFilterChange?.(filterKey, { operator, value })
```

- [ ] Add `filterable` and `filter_key` to column type
- [ ] Render funnel icon with active/inactive colour
- [ ] `QuickColumnFilter` popover for each supported type
- [ ] Column filter state managed in table, propagated via `onFilterChange` prop

**Done when:** Clicking a column header filter icon opens popover, selecting a value colours the icon and propagates the filter.

---

## Phase 6 — useSearchFilters Hook

**Goal:** Single hook that encapsulates all search + filter state so pages don't duplicate the pattern.

**File:** `src/hooks/useSearchFilters.ts`

```ts
interface UseSearchFiltersOptions {
  storageKey?: string          // default: 'searchHistory.default'
  maxHistoryItems?: number     // default: 10
  availableFilters?: Record<string, FilterConfig>
}

interface UseSearchFiltersReturn {
  searchInput: string
  appliedFilters: FilterObject
  searchInputRef: React.MutableRefObject<string>
  appliedFiltersRef: React.MutableRefObject<FilterObject>
  handleSearchChange: (value: string) => void
  handleFiltersChange: (filters: FilterObject) => void
  handleClearAll: () => void
  setSearchInput: React.Dispatch<React.SetStateAction<string>>
  setAppliedFilters: React.Dispatch<React.SetStateAction<FilterObject>>
  saveSearchToHistory: () => void
  loadSearchHistory: () => SearchHistoryEntry[]
  applySearchFromHistory: (entry: SearchHistoryEntry) => void
}
```

### Implementation rules

```ts
// Refs must stay in sync — use useEffect for each
useEffect(() => { searchInputRef.current = searchInput }, [searchInput])
useEffect(() => { appliedFiltersRef.current = appliedFilters }, [appliedFilters])
// Refs exist so async fetch callbacks never capture stale state
```

`handleFiltersChange`:
1. `setAppliedFilters(newFilters)`
2. Call pagination reset callback if provided
3. Save to history

`handleSearchChange`: just `setSearchInput` — search executes on Enter via page logic.

`handleClearAll`:
1. `setSearchInput('')`
2. `setAppliedFilters({})`
3. Call pagination reset callback if provided

History label generation:
```ts
label = searchText?.trim()
     || Object.entries(filters)
          .map(([key, f]) => `${availableFilters[key]?.label ?? key}: ${formatValue(f)}`)
          .join(', ')
     || 'Search'
```

- [ ] State + refs with sync effects
- [ ] `handleSearchChange`, `handleFiltersChange`, `handleClearAll`
- [ ] localStorage history CRUD (save / load / apply / delete)
- [ ] History label generation

**Done when:** Hook exported and used in one page with no inline filter state duplication.

---

## Phase 7 — Query Builder

**Goal:** Pure functions that convert `FilterObject` → query string for the API.

**File:** `src/lib/queryBuilder.ts`

### Operator map

```ts
const OPERATOR_MAP: Record<string, string> = {
  contains: 'LIKE', not_contains: 'NOT_LIKE',
  equals: 'EQ', is: 'EQ', is_not: 'NEQ',
  starts_with: 'STARTS_WITH', ends_with: 'ENDS_WITH',
  greater_than: 'GT', less_than: 'LT', gte: 'GTE', lte: 'LTE',
  in: 'IN', not_in: 'NOT_IN', between: 'BETWEEN',
  before: 'DATE_LT', after: 'DATE_GT', on: 'DATE_EQ',
  is_null: 'IS_NULL', is_not_null: 'IS_NOT_NULL',
}
```

### Value serialization rules

```ts
function serializeValue(value: AppliedFilter['value'], operator: string): string | null {
  if (operator === 'is_null' || operator === 'is_not_null') return ''        // empty parens
  if (value === null || value === '' || value === undefined) return null      // skip filter
  if (Array.isArray(value)) {
    if (value.length === 0) return null                                       // skip filter
    return value.map(v => (typeof v === 'object' ? v.value : v)).join(',')
  }
  if (typeof value === 'object' && 'from' in value) {
    if (!value.from && !value.to) return null
    return [value.from, value.to].filter(Boolean).join(',')
  }
  if (typeof value === 'object' && 'min' in value) {
    if (value.min == null && value.max == null) return null
    return [value.min, value.max].filter(v => v != null).join(',')
  }
  if (typeof value === 'object' && 'value' in value) return String(value.value)  // AutocompleteOption
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}
```

### `buildFilterQueryString(filters: FilterObject): string`

```ts
export function buildFilterQueryString(filters: FilterObject): string {
  return Object.entries(filters)
    .map(([field, { value, operator = 'equals' }]) => {
      const token = OPERATOR_MAP[operator] ?? operator.toUpperCase()
      const serialized = serializeValue(value, operator)
      if (serialized === null) return null
      return `${field}:${token}(${serialized})`
    })
    .filter(Boolean)
    .join(';')
}
```

### `buildSearchQuery`

```ts
export function buildSearchQuery(
  searchQuery: string,
  filters: FilterObject,
  opts: { sortBy?: string; sortDir?: string; perPage?: number; page?: number }
): string {
  const params = new URLSearchParams()
  if (searchQuery) params.set('q', searchQuery)
  const filterStr = buildFilterQueryString(filters)
  if (filterStr) params.set('filter', filterStr)
  if (opts.sortBy) params.set('sort_by', opts.sortBy)
  if (opts.sortDir) params.set('sort_dir', opts.sortDir)
  if (opts.perPage != null) params.set('per_page', String(opts.perPage))
  if (opts.page != null) params.set('page', String(opts.page))
  return params.toString()
}
```

- [ ] `OPERATOR_MAP` constant
- [ ] `serializeValue` with all value shape cases
- [ ] `buildFilterQueryString` — returns `''` for empty/all-skipped filters
- [ ] `buildSearchQuery` — combines all params

**Done when:** Unit tests in Phase 11.2 all pass.

---

## Phase 8 — Fastify Backend Filter Parser

**Goal:** Parse the `?filter=` query string into ORM-ready WHERE conditions. No external library — build from scratch.

### 8.1 parseFilterString

**File:** `src/plugins/filters/parseFilterString.ts`

```ts
export interface ParsedFilter {
  field: string
  operator: string   // wire token e.g. 'EQ', 'LIKE', 'BETWEEN'
  rawValue: string   // the raw string inside parens
  value: string | string[] | number | number[] | null
}

export function parseFilterString(filterStr: string): ParsedFilter[] {
  if (!filterStr) return []
  return filterStr
    .split(';')
    .map(segment => parseSegment(segment.trim()))
    .filter((f): f is ParsedFilter => f !== null)
}

function parseSegment(segment: string): ParsedFilter | null {
  const match = segment.match(/^([^:]+):([A-Z_]+)\(([^)]*)\)$/)
  if (!match) return null
  const [, field, operator, rawValue] = match
  return { field, operator, rawValue, value: coerceValue(operator, rawValue) }
}

function coerceValue(operator: string, raw: string): ParsedFilter['value'] {
  if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') return null
  if (['IN', 'NOT_IN'].includes(operator)) return raw.split(',').map(v => v.trim())
  if (operator === 'BETWEEN') {
    const parts = raw.split(',').map(v => v.trim())
    const nums = parts.map(Number)
    return nums.every(n => !isNaN(n)) ? nums : parts
  }
  const num = Number(raw)
  if (!isNaN(num) && raw !== '') return num
  return raw
}
```

### 8.2 applyFiltersToQuery (Prisma example)

**File:** `src/plugins/filters/applyFiltersToQuery.ts`

```ts
// fieldMap: maps frontend field name → actual DB column (or dotted path for relations)
// Example: { 'status': 'status', 'agent': 'agent.name', 'price': 'askingPrice' }

export function buildPrismaWhere(
  filters: ParsedFilter[],
  fieldMap: Record<string, string>,
  allowedFields: string[]
): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  for (const f of filters) {
    if (!allowedFields.includes(f.field)) continue  // whitelist check
    const col = fieldMap[f.field] ?? f.field
    where[col] = operatorToPrisma(f.operator, f.value)
  }
  return where
}

function operatorToPrisma(operator: string, value: ParsedFilter['value']): unknown {
  switch (operator) {
    case 'EQ':          return { equals: value }
    case 'NEQ':         return { not: value }
    case 'LIKE':        return { contains: value, mode: 'insensitive' }
    case 'NOT_LIKE':    return { not: { contains: value, mode: 'insensitive' } }
    case 'STARTS_WITH': return { startsWith: String(value), mode: 'insensitive' }
    case 'ENDS_WITH':   return { endsWith: String(value), mode: 'insensitive' }
    case 'GT':          return { gt: value }
    case 'LT':          return { lt: value }
    case 'GTE':         return { gte: value }
    case 'LTE':         return { lte: value }
    case 'IN':          return { in: value }
    case 'NOT_IN':      return { notIn: value }
    case 'BETWEEN':     return { gte: (value as number[])[0], lte: (value as number[])[1] }
    case 'DATE_EQ':     return { equals: new Date(String(value)) }
    case 'DATE_LT':     return { lt: new Date(String(value)) }
    case 'DATE_GT':     return { gt: new Date(String(value)) }
    case 'IS_NULL':     return null
    case 'IS_NOT_NULL': return { not: null }
    default:            return { equals: value }
  }
}
```

### 8.3 Fastify plugin

**File:** `src/plugins/filters/filterPlugin.ts`

```ts
import fp from 'fastify-plugin'
import { parseFilterString, ParsedFilter } from './parseFilterString'

declare module 'fastify' {
  interface FastifyRequest {
    parsedFilters: ParsedFilter[]
    searchQuery: string
    pagination: { page: number; perPage: number; sortBy?: string; sortDir?: string }
  }
}

export default fp(async (fastify) => {
  fastify.decorateRequest('parsedFilters', null)
  fastify.decorateRequest('searchQuery', '')
  fastify.decorateRequest('pagination', null)

  fastify.addHook('preHandler', async (req) => {
    const q = req.query as Record<string, string>
    req.parsedFilters = parseFilterString(q.filter ?? '')
    req.searchQuery = q.q ?? ''
    req.pagination = {
      page: parseInt(q.page ?? '0', 10),
      perPage: Math.min(parseInt(q.per_page ?? '20', 10), 100),
      sortBy: q.sort_by,
      sortDir: q.sort_dir,
    }
  })
})
```

### 8.4 Route usage pattern

```ts
fastify.get('/listings', async (req, reply) => {
  const { parsedFilters, searchQuery, pagination } = req

  const where = buildPrismaWhere(parsedFilters, LISTING_FIELD_MAP, LISTING_ALLOWED_FIELDS)

  const [data, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      skip: pagination.page * pagination.perPage,
      take: pagination.perPage,
      orderBy: pagination.sortBy ? { [pagination.sortBy]: pagination.sortDir ?? 'asc' } : undefined,
    }),
    prisma.listing.count({ where }),
  ])

  return { data, total, page: pagination.page, perPage: pagination.perPage }
})
```

### 8.5 Field map and whitelist pattern (define per resource)

```ts
// src/resources/listings/filters.ts
export const LISTING_FIELD_MAP: Record<string, string> = {
  status: 'status',
  price: 'askingPrice',
  bedrooms: 'bedrooms',
  agent: 'agentId',
  created_at: 'createdAt',
}

export const LISTING_ALLOWED_FIELDS = Object.keys(LISTING_FIELD_MAP)
```

- [ ] `parseFilterString` with regex parser and value coercion
- [ ] `buildPrismaWhere` with all operator cases
- [ ] Fastify plugin with request decoration
- [ ] Field map + allowed fields pattern for each resource

**Done when:** `GET /listings?filter=status:EQ(active)` returns only active listings. Unknown field returns 200 (silently skipped, not 500).

---

## Phase 9 — Filter Config Endpoint

**Goal:** API endpoint that returns `FilterConfig` per resource so the frontend doesn't hardcode filter definitions.

### 9.1 Endpoint contract

```
GET /api/:resource/filter-config

Response:
{
  "filters": {
    "status": {
      "name": "status",
      "label": "Status",
      "type": "select",
      "options": [
        { "value": "active",   "label": "Active" },
        { "value": "pending",  "label": "Pending" },
        { "value": "archived", "label": "Archived" }
      ]
    },
    "price": {
      "name": "price",
      "label": "Price",
      "type": "number_range",
      "min": 0,
      "max": 10000000,
      "prefix": "$",
      "showSlider": true
    }
  },
  "quickFilters": {
    "active_only": {
      "name": "active_only",
      "label": "Active Only",
      "filter": { "status": { "value": "active", "operator": "is" } }
    }
  }
}
```

**File:** `src/routes/filterConfig.ts`

- [ ] Route registered for each resource (`/listings/filter-config`, `/contacts/filter-config`, etc.)
- [ ] `options` arrays for `select` / `multi_select` fetched from DB or static enum
- [ ] Response validated with Zod or JSON Schema before sending

### 9.2 Frontend loading

```ts
// In page component — run once on mount
useEffect(() => {
  fetch('/api/listings/filter-config')
    .then(r => r.json())
    .then(({ filters, quickFilters }) => {
      setAvailableFilters(filters)
      setAvailableQuickFilters(quickFilters)
    })
}, [])
```

- [ ] Fetch on mount, store in page state (or React Query)
- [ ] Pass to `<FilterBar filters={availableFilters} quickFilters={availableQuickFilters} />`

---

## Phase 10 — Full Page Integration

**Goal:** Wire everything together on a real page.

### Complete page pattern

```tsx
// src/pages/ListingsPage.tsx
function ListingsPage() {
  const [availableFilters, setAvailableFilters] = useState<Record<string, FilterConfig>>({})
  const [availableQuickFilters, setAvailableQuickFilters] = useState<Record<string, QuickFilter>>({})
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const perPage = 20

  const lastFetchRef = useRef<string>('')  // bust de-duplication on force-refresh

  const { searchInput, appliedFilters, searchInputRef, appliedFiltersRef,
          handleSearchChange, handleFiltersChange, handleClearAll } =
    useSearchFilters({ storageKey: 'listings.search', availableFilters })

  // Load filter config once
  useEffect(() => {
    fetch('/api/listings/filter-config').then(r => r.json()).then(cfg => {
      setAvailableFilters(cfg.filters)
      setAvailableQuickFilters(cfg.quickFilters ?? {})
    })
  }, [])

  // Fetch data whenever search/filter/page changes
  const fetchData = useCallback(async () => {
    const qs = buildSearchQuery(searchInputRef.current, appliedFiltersRef.current, {
      page, perPage, sortBy: 'created_at', sortDir: 'desc',
    })
    if (qs === lastFetchRef.current) return
    lastFetchRef.current = qs
    const res = await fetch(`/api/listings?${qs}`)
    const json = await res.json()
    setData(json.data)
    setTotal(json.total)
  }, [page, perPage])

  useEffect(() => { fetchData() }, [searchInput, appliedFilters, page])

  return (
    <>
      <FilterBar
        filters={availableFilters}
        quickFilters={availableQuickFilters}
        searchValue={searchInput}
        appliedFilters={appliedFilters}
        onSearch={handleSearchChange}
        onFiltersChange={(f) => { setPage(0); handleFiltersChange(f) }}
      />
      <Table
        data={data}
        columns={COLUMNS}
        filters={availableFilters}
        onFilterChange={(key, filter) => {
          handleFiltersChange({ ...appliedFiltersRef.current, [key]: filter })
          setPage(0)
        }}
      />
      <Pagination total={total} page={page} perPage={perPage} onChange={setPage} />
    </>
  )
}
```

- [ ] Filter config loaded on mount
- [ ] `useSearchFilters` for all state
- [ ] `fetchData` reads from refs (stale-closure safe)
- [ ] `page` resets to `0` on every filter/search change
- [ ] `lastFetchRef` prevents duplicate API calls

**Done when:** Page filters live data end-to-end: set a filter → URL query updates → table re-renders with filtered results.

---

## Phase 11 — Tests

### 11.1 parseFilterString unit tests

```ts
// Each should pass:
parseFilterString('status:EQ(active)')
  → [{ field: 'status', operator: 'EQ', value: 'active' }]

parseFilterString('price:BETWEEN(100,500)')
  → [{ field: 'price', operator: 'BETWEEN', value: [100, 500] }]

parseFilterString('category:IN(1,2,3)')
  → [{ field: 'category', operator: 'IN', value: ['1','2','3'] }]

parseFilterString('archived:IS_NULL()')
  → [{ field: 'archived', operator: 'IS_NULL', value: null }]

parseFilterString('status:EQ(active);price:BETWEEN(100,500)')
  → two entries

parseFilterString('')     → []
parseFilterString('bad')  → []  (no crash)
```

### 11.2 buildFilterQueryString unit tests

```ts
buildFilterQueryString({ status: { value: 'active', operator: 'is' } })
  → 'status:EQ(active)'

buildFilterQueryString({ price: { value: { min: 100, max: 500 }, operator: 'between' } })
  → 'price:BETWEEN(100,500)'

buildFilterQueryString({ featured: { value: true } })
  → 'featured:EQ(1)'

buildFilterQueryString({ tags: { value: ['a', 'b'], operator: 'in' } })
  → 'tags:IN(a,b)'

buildFilterQueryString({ status: { value: '', operator: 'is' } })
  → ''  (empty string skipped)

buildFilterQueryString({ date: { value: { from: '2024-01-01', to: '2024-12-31' }, operator: 'between' } })
  → 'date:BETWEEN(2024-01-01,2024-12-31)'
```

### 11.3 Component tests (React Testing Library)

```
SelectFilter:
  - operator changes from 'is' to 'in' → value coerces to array
  - operator changes from 'in' to 'is' → value coerces to first element

DateRangeFilter:
  - operator 'between' → two date inputs rendered
  - operator 'before' → one date input rendered
  - switching from 'between' to 'before' → 'to' value cleared

NumberRangeFilter:
  - same pattern as DateRangeFilter

AdvancedSearchBar:
  - active filter count badge shows correct number
  - clicking clear all resets badge to 0
  - chip for each active filter renders with correct label
```

### 11.4 Fastify integration test

```
GET /api/listings?filter=status:EQ(active)&q=downtown&page=0&per_page=20
  → 200, all results have status === 'active', search term applied

GET /api/listings?filter=price:BETWEEN(100000,500000)
  → 200, all results have price in range

GET /api/listings?filter=unknownField:EQ(x)
  → 200, field silently skipped (not 500)

GET /api/listings?filter=internalSecret:EQ(x)
  → 400 if internalSecret not in allowedFields (or 200 if just silently skipped — pick one, be consistent)
```

---

## File Map

```
src/
  types/
    filters.ts                      Phase 1
  components/
    filters/
      TextFilter.tsx                Phase 2.1
      SelectFilter.tsx              Phase 2.2
      DateRangeFilter.tsx           Phase 2.3
      NumberRangeFilter.tsx         Phase 2.4
      AutocompleteFilter.tsx        Phase 2.5
      TagFilter.tsx                 Phase 2.6
      ToggleFilter.tsx              Phase 2.7
      index.ts                      Phase 2.8
    AdvancedSearchBar.tsx           Phase 3
    FilterBar.tsx                   Phase 4
    Table.tsx                       Phase 5 (edit)
    QuickColumnFilter.tsx           Phase 5.3
  hooks/
    useSearchFilters.ts             Phase 6
  lib/
    queryBuilder.ts                 Phase 7
  plugins/
    filters/
      parseFilterString.ts          Phase 8.1
      applyFiltersToQuery.ts        Phase 8.2
      filterPlugin.ts               Phase 8.3
  routes/
    filterConfig.ts                 Phase 9.1
  resources/
    listings/
      filters.ts                    Phase 8.5 (field map + whitelist)
```

---

## Progress Tracker

| Phase | Description | Status |
|---|---|---|
| 1 | Shared types | `[ ]` |
| 2 | Primitive components (×7) | `[ ]` |
| 3 | AdvancedSearchBar | `[ ]` |
| 4 | FilterBar wrapper | `[ ]` |
| 5 | Per-column table filters | `[ ]` |
| 6 | useSearchFilters hook | `[ ]` |
| 7 | Query builder | `[ ]` |
| 8 | Fastify parser + plugin | `[ ]` |
| 9 | Filter config endpoint | `[ ]` |
| 10 | Full page integration | `[ ]` |
| 11 | Tests | `[ ]` |
