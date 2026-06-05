import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X as XIcon, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * Paginated source shape — used when ChipsField is wired to a server-backed
 * type-ahead. The parent owns the data via something like `useInfiniteQuery`:
 * pass the flattened items so far, whether more pages exist, the loading flag,
 * a function to fetch the next page, and (importantly) a callback so we can
 * push the typed query back up to refetch from offset 0.
 *
 * Strictly opt-in — when callers pass the plain `suggestions: string[]` prop
 * they get the original client-side mode (filter + slice in memory). This way
 * the candidate / referral / public careers forms don't pay for paging they
 * don't need.
 */
export interface ChipsFieldPagedSource {
    items: string[]
    hasMore: boolean
    isLoading?: boolean
    isFetchingMore?: boolean
    onLoadMore: () => void
    /** Called with the current trimmed query whenever the user types. The parent
     *  is expected to bump its query-key so the infinite list refetches from
     *  offset 0. Debouncing is the parent's responsibility. */
    onQueryChange?: (q: string) => void
}

// Page size for the in-memory (legacy) mode. Matches the server endpoint's
// default so the two modes feel identical at the UI layer.
const PAGE_SIZE = 10

/**
 * Free-form tag/chip input — type a value, press Enter (or the + button) to add,
 * Backspace on an empty input removes the last chip. Shared by the job form, the
 * candidate add/edit dialogs, the public careers apply form, and the portal
 * referral form so they all collect skills/tags with one consistent UX.
 *
 * Two type-ahead modes:
 *   • `suggestions: string[]` — client-side: full list filtered + sliced
 *     in-memory. Used where the list is small or already in cache.
 *   • `paged: ChipsFieldPagedSource` — server-side: parent drives an infinite
 *     query, we render pages incrementally as the dropdown scrolls and push
 *     the typed query back up via onQueryChange so each keystroke refetches.
 *
 * Picking from the dropdown adds the chip. Matching + de-duplication are
 * case-insensitive in both modes.
 */
export function ChipsField({
    label, optional, icon, chips, onRemove,
    inputRef, inputValue, onInputChange, onKeyDown, onAdd, onAddValue,
    placeholder, chipClassName, suggestions, paged,
}: {
    label: string
    optional?: boolean
    icon?: React.ReactNode
    chips: string[]
    onRemove: (value: string) => void
    inputRef?: React.RefObject<HTMLInputElement | null>
    inputValue: string
    onInputChange: (v: string) => void
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
    onAdd: () => void
    /** Add a specific value (used when a suggestion is picked). Falls back to the
     *  typed-input flow when omitted. */
    onAddValue?: (value: string) => void
    placeholder?: string
    chipClassName?: string
    suggestions?: string[]
    paged?: ChipsFieldPagedSource
}) {
    const { t } = useTranslation()
    const [focused, setFocused] = useState(false)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    // ── PAGED MODE ───────────────────────────────────────────────────────────
    // Push the typed query up to the parent so it can refetch from offset 0.
    // Debounced 200ms so we don't fire on every keystroke. Depend on the
    // callback itself, NOT the `paged` object — callers build that object
    // fresh every render, but the callback is typically a stable setState,
    // so the timer only resets when the input actually changes.
    const onQueryChange = paged?.onQueryChange
    useEffect(() => {
        if (!onQueryChange) return
        const id = window.setTimeout(() => onQueryChange(inputValue.trim()), 200)
        return () => window.clearTimeout(id)
    }, [inputValue, onQueryChange])

    // In paged mode, hide chips the user has already added from the server-
    // returned page. Server-side dedup isn't worth a column round-trip; this is
    // a cheap O(n) filter on (at most) a few pages of strings. Keyed off
    // `paged.items` (stable between fetches) rather than the per-render
    // `paged` wrapper so the memo actually memoises.
    const pagedItems = paged?.items
    const pagedVisible = useMemo(() => {
        if (!pagedItems) return []
        const added = new Set(chips.map((c) => c.toLowerCase()))
        return pagedItems.filter((s) => !added.has(s.toLowerCase()))
    }, [pagedItems, chips])

    // ── CLIENT MODE ──────────────────────────────────────────────────────────
    // Case-insensitive: hide suggestions already added; filter by the typed text.
    // We keep the FULL filtered list here (no slice) so we can grow the visible
    // slice incrementally as the dropdown scrolls.
    const filtered = useMemo(() => {
        if (paged) return []
        if (!suggestions || suggestions.length === 0) return []
        const added = new Set(chips.map((c) => c.toLowerCase()))
        const q = inputValue.trim().toLowerCase()
        return suggestions
            .filter((s) => !added.has(s.toLowerCase()))
            .filter((s) => (q ? s.toLowerCase().includes(q) : true))
    }, [paged, suggestions, chips, inputValue])

    // Reset the visible window whenever the underlying client list changes.
    // State-during-render pattern (per CLAUDE.md) instead of useEffect so the
    // reset happens in the SAME render as the trigger — no double-render, no
    // `react-hooks/set-state-in-effect` warning. Paged mode doesn't use this
    // (the parent's queryKey reset handles it).
    const [lastInput, setLastInput] = useState(inputValue)
    const [lastSuggestions, setLastSuggestions] = useState(suggestions)
    if (lastInput !== inputValue || lastSuggestions !== suggestions) {
        setLastInput(inputValue)
        setLastSuggestions(suggestions)
        setVisibleCount(PAGE_SIZE)
    }

    const clientVisible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

    // Unified rendering surface — the dropdown reads from this regardless of mode.
    const visible = paged ? pagedVisible : clientVisible
    const hasMore = paged ? paged.hasMore : filtered.length > clientVisible.length
    const total = paged ? null : filtered.length
    const isLoading = paged?.isLoading ?? false
    const isFetchingMore = paged?.isFetchingMore ?? false

    // IntersectionObserver on the sentinel <li> at the bottom of the dropdown —
    // when it enters the scrollable list's viewport we reveal the next page.
    // In paged mode that fires `onLoadMore`; in client mode we just bump the
    // local slice. The observer's root is the <ul> itself so it works for an
    // internally scrolling popover (not the page). Depends on the stable
    // `onLoadMore` callback, not the per-render `paged` wrapper.
    const onLoadMore = paged?.onLoadMore
    const listRef = useRef<HTMLUListElement | null>(null)
    const sentinelRef = useRef<HTMLLIElement | null>(null)
    useEffect(() => {
        if (!focused || !hasMore) return
        const sentinel = sentinelRef.current
        const root = listRef.current
        if (!sentinel || !root) return
        const io = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting) return
                if (onLoadMore) onLoadMore()
                else setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length))
            },
            { root, rootMargin: '40px' },
        )
        io.observe(sentinel)
        return () => io.disconnect()
    }, [focused, hasMore, onLoadMore, filtered.length])

    const pick = (value: string) => {
        if (onAddValue) onAddValue(value)
        else { onInputChange(value); onAdd() }
    }

    // Dropdown is shown when the input is focused AND we have something to
    // render (visible rows, loading spinner, or "X of Y" footer).
    const showDropdown = focused && (visible.length > 0 || isLoading)

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5">{icon}{label}{optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</Label>
            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="list" aria-label={label}>
                    {chips.map((c) => (
                        <span key={c} role="listitem" className={cn('inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full', chipClassName ?? 'bg-primary/10 text-primary')}>
                            {c}
                            <button type="button" aria-label={`Remove "${c}"`} onClick={() => onRemove(c)} className="ml-0.5 opacity-60 hover:opacity-100">
                                <XIcon className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        // Delay so a suggestion click (mousedown) registers before blur closes the list.
                        onBlur={() => setTimeout(() => setFocused(false), 120)}
                        aria-label={`Add ${label.toLowerCase()}`}
                        placeholder={placeholder}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={!inputValue.trim()}>
                        <Plus className="size-3.5" />
                    </Button>
                </div>
                {showDropdown && (
                    <ul
                        ref={listRef}
                        role="listbox"
                        aria-label={`${label} suggestions`}
                        className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
                    >
                        {isLoading && visible.length === 0 ? (
                            <li className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" /> {t('common.loading')}
                            </li>
                        ) : null}

                        {visible.map((s) => (
                            <li key={s}>
                                <button
                                    type="button"
                                    // mousedown (not click) so it fires before the input's blur.
                                    onMouseDown={(e) => { e.preventDefault(); pick(s) }}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Plus className="size-3 opacity-50 shrink-0" />
                                    <span className="truncate">{s}</span>
                                </button>
                            </li>
                        ))}

                        {hasMore && (
                            // Sentinel: when this enters the dropdown's viewport
                            // the IntersectionObserver fetches/reveals the next page.
                            // Hint label doubles as a discoverability cue.
                            <li
                                ref={sentinelRef}
                                aria-hidden="true"
                                className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-center text-[11px] text-muted-foreground"
                            >
                                {isFetchingMore ? (
                                    <><Loader2 className="size-3 animate-spin" /> {t('common.loadingMore')}</>
                                ) : paged ? (
                                    <>{t('common.suggestionsLoaded', { count: visible.length })}</>
                                ) : (
                                    <>{t('common.suggestionsOfTotal', { count: visible.length, total })}</>
                                )}
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    )
}
