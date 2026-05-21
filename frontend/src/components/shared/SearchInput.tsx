import { memo, type Ref } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
    value: string
    onChange: (value: string) => void
    onClear?: () => void
    containerClassName?: string
    /** size variant - 'sm' matches DataTable (h-8 text-xs), 'md' for larger forms */
    size?: 'sm' | 'md'
    ref?: Ref<HTMLInputElement>
}

function SearchInputBase({
    value,
    onChange,
    onClear,
    placeholder = 'Search...',
    containerClassName,
    className,
    size = 'sm',
    ref,
    ...props
}: SearchInputProps) {
    const handleClear = () => {
        if (onClear) {
            onClear()
        } else {
            onChange('')
        }
    }

    const sizeClasses = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'
    const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

    return (
        <div className={cn('relative flex-1', containerClassName)}>
            <Search
                className={cn(
                    'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
                    iconSize,
                )}
            />
            <Input
                ref={ref}
                type="search"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn('pl-9 pr-9', sizeClasses, className)}
                {...props}
            />
            {value && (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={handleClear}
                    className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    )}
                >
                    <X className={iconSize} />
                </button>
            )}
        </div>
    )
}

export const SearchInput = memo(SearchInputBase)
