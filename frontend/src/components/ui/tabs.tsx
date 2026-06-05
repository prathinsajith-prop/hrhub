"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

// Visual contract — the Radix-backed Tabs match the segmented-control look
// from `@/components/ui/form-controls` so the two never look out-of-family
// on the same page. Key visuals:
//   • List: rounded-xl muted rail with a hairline border and a subtle inner
//     highlight in light mode (no halo in dark mode).
//   • Trigger: transparent inactive · raised card on active with a hairline
//     ring; hover wash gives a soft affordance.
//   • Triggers can render their own count badges (see TabCountBadge below).
//
// Callers can still override via `className`; this is just a better default.

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Inline-flex keeps the rail sized to its tabs (it isn't a full-width
      // strip when there are only a few). The inset shadow gives a soft
      // top highlight in light mode that disappears in dark.
      "inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/60 p-1 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-none",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base — transparent on rail, foreground colour on hover/active.
      "group inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
      // Active — raised card with a hairline ring + subtle shadow. Foreground
      // text + (when the trigger renders an icon via the SVG selector below)
      // primary-tinted icon.
      "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/80",
      // Icon tint — inactive renders icons at 70% muted; active uses primary.
      "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground/80 data-[state=active]:[&_svg]:text-primary",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * Count pill displayed inside a TabsTrigger. Mirrors the badge shown in the
 * function-component Tabs (`@/components/ui/form-controls`) so the visual
 * language stays the same regardless of which Tabs implementation a page uses.
 *
 * Place it as a child after the label, e.g.
 *   <TabsTrigger value="applicants">
 *     <Users /> Applicants <TabsBadge>3</TabsBadge>
 *   </TabsTrigger>
 *
 * It reads the active state via the closest `[data-state]` ancestor — no
 * prop drilling — using a peer-aware className. (Radix already sets
 * data-state on the trigger, which is this badge's parent.)
 */
const TabsBadge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        // Default = inactive look; the trigger's `data-[state=active]` flips
        // both background and text via the ancestor selector below.
        "ms-0.5 inline-flex h-4 min-w-[1.125rem] items-center justify-center rounded-full bg-muted-foreground/15 px-1 text-[10px] font-semibold tabular-nums text-muted-foreground transition-colors",
        // When the trigger is active, switch to primary-tinted pill. The
        // selector targets THIS span only when its containing trigger has
        // data-state=active — no JS, no context, just CSS.
        "[[data-state=active]_&]:bg-primary/15 [[data-state=active]_&]:text-primary",
        className
      )}
      {...props}
    />
  )
)
TabsBadge.displayName = "TabsBadge"

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsBadge }
