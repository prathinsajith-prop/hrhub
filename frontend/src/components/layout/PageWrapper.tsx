import React from 'react'
import { cn } from '@/lib/utils'

interface PageWrapperProps {
    children: React.ReactNode
    className?: string
    /** Optional max-width override. Defaults to a balanced 1440px container. */
    width?: 'default' | 'narrow' | 'wide' | 'full'
}

const widthClass: Record<NonNullable<PageWrapperProps['width']>, string> = {
    default: 'max-w-none',
    narrow: 'max-w-4xl',
    wide: 'max-w-none',
    full: 'max-w-none',
}

export function PageWrapper({ children, className, width = 'default' }: PageWrapperProps) {
    return (
        <div className={cn(widthClass[width], 'mx-auto w-full space-y-3 page-enter', className)}>
            {children}
        </div>
    )
}
