import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface TabDef {
    value: string
    icon: LucideIcon
    label: string
}

interface OverflowTabsListProps {
    tabs: TabDef[]
    activeTab: string
    onTabChange: (value: string) => void
}

// Approximate width reserved for the "More" button in the available-space calculation.
const MORE_BTN_MIN_WIDTH = 80

// Shared trigger className — kept in sync with the detail page tab bar.
const TRIGGER_CLS =
    'gap-1.5 text-xs sm:text-sm font-medium px-4 py-3.5 rounded-none border-b-2 border-transparent shadow-none bg-transparent ' +
    'data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=active]:border-primary ' +
    'text-muted-foreground hover:text-foreground transition-colors -mb-px whitespace-nowrap shrink-0'

/**
 * OverflowTabsList
 *
 * Renders as many tabs as fit horizontally; excess tabs collapse into a "More"
 * dropdown. Selecting a tab from the dropdown swaps it into the visible row
 * (the last visible tab moves to More), ensuring the active tab is always
 * immediately reachable without opening the dropdown again.
 */
export function OverflowTabsList({ tabs, activeTab, onTabChange }: OverflowTabsListProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const ghostRef = useRef<HTMLDivElement>(null)

    // Stable ordering that persists swap operations across renders.
    const [orderedValues, setOrderedValues] = useState<string[]>(() => tabs.map(t => t.value))

    // How many tabs are visible (the rest go into More).
    const [visibleCount, setVisibleCount] = useState(tabs.length)

    // State-during-render: reset order when the tab set changes.
    // (CLAUDE.md pattern — avoids useEffect + extra render cycle)
    const tabKey = tabs.map(t => t.value).join(',')
    const [lastTabKey, setLastTabKey] = useState(tabKey)
    if (tabKey !== lastTabKey) {
        setLastTabKey(tabKey)
        setOrderedValues(tabs.map(t => t.value))
    }

    // Map from value → TabDef for O(1) lookup.
    const tabMap = useMemo(() => new Map(tabs.map(t => [t.value, t])), [tabs])

    // ── Derive render order ───────────────────────────────────────────────────
    // Ensures the active tab is always in the visible window by computing a
    // temporary swap — no state mutation, no useEffect needed.
    const renderOrder = useMemo(() => {
        const order = [...orderedValues]
        const activeIdx = order.indexOf(activeTab)
        if (activeIdx >= visibleCount && visibleCount > 0) {
            const lastVisible = visibleCount - 1
            ;[order[activeIdx], order[lastVisible]] = [order[lastVisible], order[activeIdx]]
        }
        return order
    }, [orderedValues, activeTab, visibleCount])

    // ── ResizeObserver: recalculate visibleCount ──────────────────────────────
    const recalculate = useCallback(() => {
        if (!containerRef.current || !ghostRef.current) return
        const containerWidth = containerRef.current.offsetWidth
        const ghostChildren = Array.from(ghostRef.current.children) as HTMLElement[]
        if (ghostChildren.length === 0) return

        // Total width if every tab is shown (no More button needed).
        const totalWidth = ghostChildren.reduce((s, el) => s + el.getBoundingClientRect().width, 0)
        if (totalWidth <= containerWidth) {
            setVisibleCount(tabs.length)
            return
        }

        // Reserve space for the More button and greedily fit tabs.
        let used = MORE_BTN_MIN_WIDTH
        let count = 0
        for (const el of ghostChildren) {
            const w = el.getBoundingClientRect().width
            if (used + w > containerWidth) break
            used += w
            count++
        }
        setVisibleCount(Math.max(1, count))
    }, [tabs.length])

    useEffect(() => { recalculate() }, [recalculate, tabKey])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const ro = new ResizeObserver(recalculate)
        ro.observe(el)
        return () => ro.disconnect()
    }, [recalculate])

    // ── Overflow tab selection ────────────────────────────────────────────────
    function handleMoreSelect(value: string) {
        // Persist the swap into orderedValues so the tab stays visible.
        setOrderedValues(prev => {
            const next = [...prev]
            const fromIdx = next.indexOf(value)
            const toIdx = visibleCount - 1
            if (fromIdx !== -1 && fromIdx !== toIdx) {
                ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
            }
            return next
        })
        onTabChange(value)
    }

    const visibleValues = renderOrder.slice(0, visibleCount)
    const overflowValues = renderOrder.slice(visibleCount)
    const hasOverflow = overflowValues.length > 0
    const overflowHasActive = overflowValues.includes(activeTab)

    return (
        <div ref={containerRef} className="relative w-full overflow-hidden">
            {/* ── Ghost row (invisible) — used only for width measurements ── */}
            <div
                ref={ghostRef}
                aria-hidden
                className="absolute top-0 left-0 flex opacity-0 pointer-events-none"
                style={{ visibility: 'hidden' }}
            >
                {tabs.map(tab => (
                    <span key={tab.value} className={cn(TRIGGER_CLS, 'inline-flex items-center')}>
                        <tab.icon className="h-3.5 w-3.5" />
                        {tab.label}
                    </span>
                ))}
            </div>

            {/* ── Visible tab list ── */}
            <TabsList className="h-auto bg-transparent p-0 w-full justify-start rounded-none border-b border-border/60 px-5 gap-0">
                {visibleValues.map(value => {
                    const tab = tabMap.get(value)
                    if (!tab) return null
                    return (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className={TRIGGER_CLS}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                        </TabsTrigger>
                    )
                })}

                {/* ── More dropdown ── */}
                {hasOverflow && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    TRIGGER_CLS,
                                    'inline-flex items-center gap-1 focus-visible:outline-none',
                                    overflowHasActive
                                        ? 'text-primary border-b-2 border-primary -mb-px'
                                        : 'border-b-2 border-transparent',
                                )}
                            >
                                More
                                <ChevronDown className="h-3 w-3 opacity-60" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                            {overflowValues.map(value => {
                                const tab = tabMap.get(value)
                                if (!tab) return null
                                const isActive = activeTab === value
                                return (
                                    <DropdownMenuItem
                                        key={value}
                                        onSelect={() => handleMoreSelect(value)}
                                        className={cn(
                                            'flex items-center gap-2 text-sm',
                                            isActive && 'text-primary font-medium bg-primary/5',
                                        )}
                                    >
                                        <tab.icon className="h-3.5 w-3.5 shrink-0" />
                                        {tab.label}
                                        {isActive && (
                                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                                        )}
                                    </DropdownMenuItem>
                                )
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </TabsList>
        </div>
    )
}
