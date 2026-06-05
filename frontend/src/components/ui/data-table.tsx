import * as React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type Row,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, X, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { SearchInput } from '@/components/shared/SearchInput'
import { AdvancedSearchBar } from '@/components/filters/AdvancedSearchBar'
import { QuickColumnFilter } from '@/components/QuickColumnFilter'
import type { FilterConfig, QuickFilter, AppliedFilter } from '@/lib/filters'
import type { UseSearchFiltersReturn } from '@/hooks/useSearchFilters'

export interface DataTableAdvancedFilter {
  search: UseSearchFiltersReturn
  filters: FilterConfig[]
  quickFilters?: QuickFilter[]
  placeholder?: string
  onApply?: () => void
  /**
   * Set when the page already filters `data` server-side from `search.searchInput`
   * (the parent feeds the term to its query). The search box stays, but the term is
   * NOT re-applied as a client-side global filter — otherwise rows the server matched
   * on a field that has no accessor column (e.g. email, MOHRE no.) get filtered back
   * out and the table shows "No results" while the count says there are matches.
   */
  serverFiltered?: boolean
}

/** Wire server-side pagination into DataTable so no external TablePagination is needed. */
export interface DataTableServerPagination {
  total: number
  offset: number
  limit: number
  onPageChange: (offset: number) => void
  loading?: boolean
}

interface DataTableColumnMeta {
  filterable?: boolean
  filterKey?: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  pageSize?: number
  toolbar?: React.ReactNode
  emptyMessage?: string
  onRowClick?: (row: TData) => void
  isLoading?: boolean
  enableSelection?: boolean
  bulkActions?: (selected: TData[]) => React.ReactNode
  getRowId?: (row: TData, index: number) => string
  advancedFilter?: DataTableAdvancedFilter
  columnFilterConfigs?: Record<string, FilterConfig>
  appliedColumnFilters?: Record<string, AppliedFilter>
  onColumnFilterChange?: (filterKey: string, filter: AppliedFilter | null) => void
  /** When provided, DataTable renders server-side pagination instead of internal pagination. */
  serverPagination?: DataTableServerPagination
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 1) return []
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

interface PaginationBarProps {
  currentPage: number
  totalPages: number
  from: number
  to: number
  total: number
  loading?: boolean
  onPage: (page: number) => void
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

function PaginationBar({ currentPage, totalPages, from, to, total, loading, onPage, onPrev, onNext, canPrev, canNext }: PaginationBarProps) {
  if (total <= 0) return null
  const pages = getPageNumbers(currentPage, totalPages)
  const multiPage = totalPages > 1

  return (
    <div className="flex items-center justify-between gap-4 pt-1">
      {/* Result count */}
      <p className="text-sm text-muted-foreground shrink-0">
        Showing{' '}
        <span className="font-medium text-foreground">{from}</span>
        –
        <span className="font-medium text-foreground">{to}</span>
        {' '}of{' '}
        <span className="font-medium text-foreground">{total}</span>
        {' '}results
      </p>

      {/* Navigation - only when more than one page */}
      {multiPage && (
        <div className="flex items-center gap-1">
          {/* Previous */}
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev || loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-0.5">
            {pages.map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="flex size-8 items-center justify-center text-xs text-muted-foreground">
                  ···
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  onClick={() => onPage(p as number)}
                  disabled={loading}
                  className={cn(
                    'flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
                    p === currentPage
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>

          {/* Next */}
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext || loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  pageSize = 10,
  toolbar,
  emptyMessage = 'No results found.',
  onRowClick,
  isLoading,
  enableSelection = false,
  bulkActions,
  getRowId,
  advancedFilter,
  columnFilterConfigs,
  appliedColumnFilters,
  onColumnFilterChange,
  serverPagination,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [internalGlobalFilter, setInternalGlobalFilter] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // When using advanced filter, the search input value lives in the search hook.
  // For server-filtered pages the term already narrowed `data`, so don't re-apply it
  // here (it can only see accessor columns and would drop validly-matched rows).
  const globalFilter = advancedFilter
    ? (advancedFilter.serverFiltered ? '' : advancedFilter.search.searchInput)
    : internalGlobalFilter
  const setGlobalFilter = advancedFilter
    ? (v: string) => advancedFilter.search.setSearchInput(typeof v === 'string' ? v : '')
    : setInternalGlobalFilter

  const selectionColumn: ColumnDef<TData, TValue> = React.useMemo(
    () => ({
      id: '__select__',
      size: 36,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? 'indeterminate' : false)
          }
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all on page"
          onClick={e => e.stopPropagation()}
        />
      ),
      cell: ({ row }: { row: Row<TData> }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={e => e.stopPropagation()}
        />
      ),
    }),
    [],
  )

  const allColumns = React.useMemo(
    () => (enableSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableSelection, selectionColumn],
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableSelection,
    getRowId,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    initialState: { pagination: { pageSize } },
  })

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map(r => r.original),
    [table, rowSelection], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const selectedCount = selectedRows.length

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {advancedFilter ? (
        <AdvancedSearchBar
          search={advancedFilter.search}
          filters={advancedFilter.filters}
          quickFilters={advancedFilter.quickFilters}
          placeholder={advancedFilter.placeholder ?? searchPlaceholder}
          onApply={advancedFilter.onApply}
          rightSlot={toolbar}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            {searchKey !== undefined && (
              <SearchInput
                value={globalFilter}
                onChange={setGlobalFilter}
                placeholder={searchPlaceholder}
                containerClassName="max-w-xs"
              />
            )}
          </div>
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {/* Bulk action bar */}
      {enableSelection && selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {selectedCount}
            </span>
            <span>selected</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => table.resetRowSelection()}
            >
              <X className="size-3 mr-1" /> Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {bulkActions ? bulkActions(selectedRows) : null}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      aria-sort={
                        !header.column.getCanSort() ? undefined
                          : header.column.getIsSorted() === 'asc' ? 'ascending'
                            : header.column.getIsSorted() === 'desc' ? 'descending'
                              : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-0.5">
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors text-left"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span className="ml-0.5">
                                {header.column.getIsSorted() === 'asc' ? (
                                  <ChevronUp className="size-3" />
                                ) : header.column.getIsSorted() === 'desc' ? (
                                  <ChevronDown className="size-3" />
                                ) : (
                                  <ChevronsUpDown className="size-3 opacity-40" />
                                )}
                              </span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          )}
                          {(() => {
                            const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined
                            if (!meta?.filterable || !meta.filterKey) return null
                            const cfg = columnFilterConfigs?.[meta.filterKey]
                            if (!cfg) return null
                            return (
                              <QuickColumnFilter
                                filterConfig={cfg}
                                currentValue={appliedColumnFilters?.[meta.filterKey]}
                                onApply={(key, filter) => onColumnFilterChange?.(key, filter)}
                              >
                                <Filter className="size-3" />
                              </QuickColumnFilter>
                            )
                          })()}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {allColumns.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border/40 bg-card transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-muted/50',
                      row.getIsSelected() && 'bg-primary/5 hover:bg-primary/10',
                    )}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"], [role="checkbox"], [role="menuitem"], [role="option"]')) return
                      onRowClick?.(row.original)
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={allColumns.length} className="h-32 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {serverPagination ? (
        // Server-side: DataTable holds exactly one internal "page" - pagination is driven
        // by serverPagination props so the parent doesn't need a separate TablePagination.
        (() => {
          const { total, offset, limit, onPageChange, loading } = serverPagination
          const totalPages = Math.ceil(total / limit)
          const currentPage = Math.floor(offset / limit) + 1
          const from = total > 0 ? offset + 1 : 0
          const to = Math.min(offset + limit, total)
          return (
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              from={from}
              to={to}
              total={total}
              loading={loading || isLoading}
              onPage={(p) => onPageChange((p - 1) * limit)}
              onPrev={() => onPageChange(Math.max(0, offset - limit))}
              onNext={() => onPageChange(offset + limit)}
              canPrev={offset > 0}
              canNext={offset + limit < total}
            />
          )
        })()
      ) : (
        // Client-side: use TanStack table's internal pagination state.
        (() => {
          const { pageIndex, pageSize: ps } = table.getState().pagination
          const filteredCount = table.getFilteredRowModel().rows.length
          const totalPages = table.getPageCount()
          const currentPage = pageIndex + 1
          const from = filteredCount > 0 ? pageIndex * ps + 1 : 0
          const to = Math.min((pageIndex + 1) * ps, filteredCount)
          return (
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              from={from}
              to={to}
              total={filteredCount}
              loading={isLoading}
              onPage={(p) => table.setPageIndex(p - 1)}
              onPrev={() => table.previousPage()}
              onNext={() => table.nextPage()}
              canPrev={table.getCanPreviousPage()}
              canNext={table.getCanNextPage()}
            />
          )
        })()
      )}
    </div>
  )
}
