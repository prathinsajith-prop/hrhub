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
    pill: 'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
    underline:
        'inline-flex h-auto w-full items-center justify-start gap-5 overflow-x-auto rounded-none border-b border-border/60 bg-transparent p-0 text-muted-foreground sm:gap-6',
}

const TRIGGER_VARIANTS: Record<TabsVariant, string> = {
    pill: 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
    underline:
        'relative -mb-px inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-b-2 border-transparent bg-transparent px-0.5 pb-2.5 pt-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-primary',
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
