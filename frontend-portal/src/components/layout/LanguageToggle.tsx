import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const LANGUAGES: { code: 'en' | 'ar'; label: string; native: string }[] = [
    { code: 'en', label: 'English', native: 'EN' },
    { code: 'ar', label: 'العربية', native: 'AR' },
]

export function LanguageToggle() {
    const { i18n } = useTranslation()
    const current = (i18n.language?.slice(0, 2) ?? 'en') as 'en' | 'ar'

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Change language">
                    <Languages className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
                {LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        onClick={() => i18n.changeLanguage(lang.code)}
                        className="flex items-center justify-between gap-2"
                    >
                        <span className="font-medium">{lang.label}</span>
                        <span
                            className={
                                current === lang.code
                                    ? 'text-[10px] font-bold tracking-wider text-primary'
                                    : 'text-[10px] tracking-wider text-muted-foreground'
                            }
                        >
                            {lang.native}
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
