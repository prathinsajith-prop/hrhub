import React from 'react'
import { cn } from '@/lib/utils'

interface PageWrapperProps {
    children: React.ReactNode
    className?: string
    /** Optional max-width override. Defaults to a balanced 1440px container. */
    width?: 'default' | 'narrow' | 'wide' | 'full'
}

const widthClass: Record<NonNullable<PageWrapperProps['width']>, string> = {
    default: 'max-w-[1440px]',
    narrow: 'max-w-4xl',
    wide: 'max-w-[1600px]',
    full: 'max-w-none',
}

export function PageWrapper({ children, className, width = 'default' }: PageWrapperProps) {
    return (
        <div className={cn(widthClass[width], 'mx-auto w-full space-y-5 page-enter', className)}>
            {children}
        </div>
    )
}
