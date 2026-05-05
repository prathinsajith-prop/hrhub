import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface EmployeeLinkProps {
    id: string
    name: string
    className?: string
}

export function EmployeeLink({ id, name, className }: EmployeeLinkProps) {
    const navigate = useNavigate()
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); navigate(`/employees/${id}`) }}
            className={cn('text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer', className)}
        >
            {name}
        </button>
    )
}
