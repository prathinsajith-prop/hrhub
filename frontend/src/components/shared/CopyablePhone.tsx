import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyablePhoneProps {
    phone: string
    className?: string
}

export function CopyablePhone({ phone, className }: CopyablePhoneProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(phone).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copied!' : `Copy ${phone}`}
            className={cn(
                'group inline-flex items-center gap-1 rounded px-0.5 -mx-0.5 transition-colors',
                'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                copied && 'text-emerald-600',
                className,
            )}
        >
            <span className="truncate">{phone}</span>
            <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {copied
                    ? <Check className="h-3 w-3 text-emerald-600" />
                    : <Copy className="h-3 w-3 text-muted-foreground" />
                }
            </span>
        </button>
    )
}
