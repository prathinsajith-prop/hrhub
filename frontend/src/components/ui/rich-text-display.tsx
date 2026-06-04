/**
 * Display-only renderer for rich-text (HTML) content.
 *
 * Kept separate from `rich-text-editor.tsx` on purpose: that module pulls in the
 * full tiptap editor stack. Read-only surfaces — especially the public, anon-
 * facing careers pages — should render formatted content WITHOUT shipping the
 * editor. This component depends only on DOMPurify, so it stays tiny.
 */
import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'code', 'pre']
const ALLOWED_ATTR = ['href', 'target', 'rel']

export function RichTextDisplay({ html, className }: { html: string; className?: string }) {
    const clean = useMemo(() => {
        if (!html || html === '<p></p>') return null
        return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, FORCE_BODY: true })
    }, [html])
    if (!clean) return null
    return (
        <div
            className={cn('prose-display text-sm text-muted-foreground leading-relaxed', className)}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    )
}
