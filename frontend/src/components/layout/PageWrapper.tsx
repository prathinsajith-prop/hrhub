import React from 'react'
import { cn } from '@/lib/utils'

interface PageWrapperProps {
    children: React.ReactNode
    className?: string
    /** Optional max-width override. Defaults to a balanced 1440px container. */
    width?: 'default' | 'narrow' | 'wide' | 'full'
}

// Cap content widths so a 27" / TV display doesn't stretch text lines to
// 200+ characters. The viewport > breakpoint padding (px-6 on the parent
// shell) keeps the side margins balanced. Use:
//   default — typical app pages (dashboards, lists, detail)
//   narrow  — long-form prose (settings, profiles, forms)
//   wide    — data-heavy pages that need more horizontal real estate
//   full    — escape hatch for full-bleed pages (e.g. org chart)
const widthClass: Record<NonNullable<PageWrapperProps['width']>, string> = {
    default: 'max-w-[1440px] 3xl:max-w-[1680px]',
    narrow: 'max-w-4xl',
    wide: 'max-w-[1680px] 3xl:max-w-[1920px]',
    full: 'max-w-none',
}

export function PageWrapper({ children, className, width = 'default' }: PageWrapperProps) {
    return (
        <div className={cn(widthClass[width], 'mx-auto w-full space-y-4 page-slide-up', className)}>
            {children}
        </div>
    )
}
