import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

type TabsVariant = 'pill' | 'underline'

/**
 * Two visual flavours share one primitive:
 *   - `pill` (default): the compact segmented control — best for short 2-tab
 *     toggles (Profile, Performance).
 *   - `underline`: a clean, editorial section-nav bar for primary in-page
 *     navigation with several wide tabs (Home, My Work). The active tab is
 *     marked by a primary-coloured underline + text, matching the header nav's
 *     accent so the whole portal reads as one design language.
 *
 * The variant is shared from <TabsList> down to each <TabsTrigger> via context,
 * so call sites only set it once on the list.
 */
const TabsVariantContext = React.createContext<TabsVariant>('pill')

const LIST_VARIANTS: Record<TabsVariant, string> = {
    // Compact segmented control: a raised "card" chip marks the active tab.
    pill: 'inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-border/50 bg-muted/50 p-1 text-muted-foreground',
    // Editorial section-nav: each tab is a hoverable surface that lifts on the
    // baseline, with an animated primary underline pill on the active tab.
    underline:
        'inline-flex h-auto w-full items-center justify-start gap-1 overflow-x-auto rounded-none border-b border-border/60 bg-transparent p-0 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
}

const TRIGGER_VARIANTS: Record<TabsVariant, string> = {
    pill: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60 [&_svg]:size-3.5 [&_svg]:shrink-0',
    underline:
        'group relative -mb-px inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary/[0.06] data-[state=active]:text-primary data-[state=active]:font-semibold after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100 [&_svg]:size-3.5 [&_svg]:shrink-0',
}

function TabsList({
    variant = 'pill',
    className,
    ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
    return (
        <TabsVariantContext.Provider value={variant}>
            <TabsPrimitive.List className={cn(LIST_VARIANTS[variant], className)} {...props} />
        </TabsVariantContext.Provider>
    )
}

function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
    const variant = React.useContext(TabsVariantContext)
    return <TabsPrimitive.Trigger className={cn(TRIGGER_VARIANTS[variant], className)} {...props} />
}

function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            className={cn(
                'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className,
            )}
            {...props}
        />
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
