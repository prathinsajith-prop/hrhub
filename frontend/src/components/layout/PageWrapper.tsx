import React from 'react'
import { cn } from '@/lib/utils'

interface PageWrapperProps {
    children: React.ReactNode
    className?: string
}

export function PageWrapper({ children, className }: PageWrapperProps) {
    return (
        <div className={cn('max-w-screen-xl mx-auto w-full space-y-5 page-enter', className)}>
            {children}
        </div>
    )
}
