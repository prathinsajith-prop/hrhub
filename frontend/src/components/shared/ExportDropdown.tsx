import { useState } from 'react'
import { Download, ChevronDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ExportDropdownProps {
    onExportCsv: () => Promise<void> | void
    onExportPdf: () => Promise<void> | void
    label?: string
    disabled?: boolean
    size?: 'sm' | 'default'
}

export function ExportDropdown({
    onExportCsv,
    onExportPdf,
    label = 'Export',
    disabled = false,
    size = 'sm',
}: ExportDropdownProps) {
    const [loading, setLoading] = useState<'csv' | 'pdf' | null>(null)

    async function handle(format: 'csv' | 'pdf') {
        setLoading(format)
        try {
            await (format === 'csv' ? onExportCsv() : onExportPdf())
        } finally {
            setLoading(null)
        }
    }

    const busy = loading !== null

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size={size}
                    disabled={disabled || busy}
                    className="gap-1.5 font-medium"
                >
                    {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />
                    }
                    {busy ? (loading === 'csv' ? 'Exporting…' : 'Exporting…') : label}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52 p-1.5">
                <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                    Download as
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />

                <DropdownMenuItem
                    onClick={() => handle('csv')}
                    disabled={busy}
                    className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer group',
                        loading === 'csv' && 'opacity-60 pointer-events-none'
                    )}
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                        {loading === 'csv'
                            ? <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                            : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        }
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium leading-tight">CSV Spreadsheet</span>
                        <span className="text-[11px] text-muted-foreground leading-tight">Excel, Google Sheets</span>
                    </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={() => handle('pdf')}
                    disabled={busy}
                    className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer group',
                        loading === 'pdf' && 'opacity-60 pointer-events-none'
                    )}
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-50 border border-rose-100 group-hover:bg-rose-100 transition-colors">
                        {loading === 'pdf'
                            ? <Loader2 className="h-4 w-4 text-rose-600 animate-spin" />
                            : <FileText className="h-4 w-4 text-rose-600" />
                        }
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium leading-tight">PDF Document</span>
                        <span className="text-[11px] text-muted-foreground leading-tight">Print-ready report</span>
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
