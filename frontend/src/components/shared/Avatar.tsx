import { memo } from 'react'
import { cn } from '@/lib/utils'

interface InitialsAvatarProps {
    name: string
    className?: string
    size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<InitialsAvatarProps['size']>, string> = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
}

const PALETTE = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-sky-500',
    'bg-orange-500',
    'bg-teal-500',
]

function hashToColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
    return PALETTE[Math.abs(hash) % PALETTE.length]
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function InitialsAvatarBase({ name, className, size = 'md' }: InitialsAvatarProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0',
                SIZE[size],
                hashToColor(name),
                className,
            )}
            aria-hidden
        >
            {initials(name)}
        </span>
    )
}

export const InitialsAvatar = memo(InitialsAvatarBase)
