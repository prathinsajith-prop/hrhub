import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter as FilterIcon, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Select as UiSelect,
    SelectContent as UiSelectContent,
    SelectItem as UiSelectItem,
    SelectTrigger as UiSelectTrigger,
    SelectValue as UiSelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import type { OrgUnit } from '@/hooks/useOrgUnits'

export interface OrgFilters {
    /** Selected employee id — focuses the chart on this person's reporting chain. */
    employeeId: string
    branchId: string
    divisionId: string
    departmentId: string
    designation: string
}

export const EMPTY_ORG_FILTERS: OrgFilters = {
    employeeId: '', branchId: '', divisionId: '', departmentId: '', designation: '',
}

export function isOrgFiltersActive(f: OrgFilters): boolean {
    return !!(f.employeeId || f.branchId || f.divisionId || f.departmentId || f.designation)
}

const ALL = '__all__'

export function OrgUnitFilters({
    filters, onChange, units, designations, hideDesignation = false,
}: {
    filters: OrgFilters
    onChange: (next: OrgFilters) => void
    units: OrgUnit[]
    designations: Array<{ name: string; isActive: boolean }>
    /** Org Structure tab hides this — designation only makes sense when employees are in scope. */
    hideDesignation?: boolean
}) {
    const { t } = useTranslation()

    const branches = useMemo(() => units.filter(u => u.type === 'branch'), [units])
    const divisions = useMemo(() => {
        const list = units.filter(u => u.type === 'division')
        return filters.branchId ? list.filter(d => d.parentId === filters.branchId) : list
    }, [units, filters.branchId])
    const departments = useMemo(() => {
        const list = units.filter(u => u.type === 'department')
        if (filters.divisionId) return list.filter(d => d.parentId === filters.divisionId)
        if (filters.branchId) {
            const divIds = new Set(
                units.reduce<string[]>((acc, u) => {
                    if (u.type === 'division' && u.parentId === filters.branchId) acc.push(u.id)
                    return acc
                }, []),
            )
            return list.filter(d => d.parentId && divIds.has(d.parentId))
        }
        return list
    }, [units, filters.divisionId, filters.branchId])

    const designationOptions = useMemo(
        () => designations.reduce<string[]>((acc, d) => {
            if (d.isActive) acc.push(d.name)
            return acc
        }, []).sort((a, b) => a.localeCompare(b)),
        [designations],
    )

    const isActive = isOrgFiltersActive(filters)

    function set<K extends keyof OrgFilters>(key: K, value: OrgFilters[K]) {
        const next = { ...filters, [key]: value }
        // Cascade: clearing a higher level clears lower levels
        if (key === 'branchId') { next.divisionId = ''; next.departmentId = '' }
        if (key === 'divisionId') { next.departmentId = '' }
        onChange(next)
    }

    return (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FilterIcon className="size-3.5" />
                    {t('orgSettings.structure.filters')}
                </div>
                {isActive && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onChange(EMPTY_ORG_FILTERS)}>
                        <XIcon className="size-3" />
                        {t('orgSettings.structure.clearFilters')}
                    </Button>
                )}
            </div>
            <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2', hideDesignation ? 'lg:grid-cols-5' : 'lg:grid-cols-6')}>
                <div className="sm:col-span-2">
                    <EmployeeSelect
                        value={filters.employeeId}
                        onValueChange={id => set('employeeId', id)}
                        placeholder={t('orgChart.selectEmployee', { defaultValue: 'Search employee…' })}
                        clearable
                        className="h-9 text-sm w-full"
                    />
                </div>
                <UiSelect value={filters.branchId || ALL} onValueChange={v => set('branchId', v === ALL ? '' : v)}>
                    <UiSelectTrigger className="h-9 text-sm"><UiSelectValue placeholder={t('orgSettings.structure.allBranches')} /></UiSelectTrigger>
                    <UiSelectContent>
                        <UiSelectItem value={ALL}>{t('orgSettings.structure.allBranches')}</UiSelectItem>
                        {branches.map(b => <UiSelectItem key={b.id} value={b.id}>{b.name}</UiSelectItem>)}
                    </UiSelectContent>
                </UiSelect>
                <UiSelect value={filters.divisionId || ALL} onValueChange={v => set('divisionId', v === ALL ? '' : v)}>
                    <UiSelectTrigger className="h-9 text-sm"><UiSelectValue placeholder={t('orgSettings.structure.allDivisions')} /></UiSelectTrigger>
                    <UiSelectContent>
                        <UiSelectItem value={ALL}>{t('orgSettings.structure.allDivisions')}</UiSelectItem>
                        {divisions.map(d => <UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>)}
                    </UiSelectContent>
                </UiSelect>
                <UiSelect value={filters.departmentId || ALL} onValueChange={v => set('departmentId', v === ALL ? '' : v)}>
                    <UiSelectTrigger className="h-9 text-sm"><UiSelectValue placeholder={t('orgSettings.structure.allDepartments')} /></UiSelectTrigger>
                    <UiSelectContent>
                        <UiSelectItem value={ALL}>{t('orgSettings.structure.allDepartments')}</UiSelectItem>
                        {departments.map(d => <UiSelectItem key={d.id} value={d.id}>{d.name}</UiSelectItem>)}
                    </UiSelectContent>
                </UiSelect>
                {!hideDesignation && (
                    <UiSelect value={filters.designation || ALL} onValueChange={v => set('designation', v === ALL ? '' : v)}>
                        <UiSelectTrigger className="h-9 text-sm"><UiSelectValue placeholder={t('orgSettings.structure.allDesignations')} /></UiSelectTrigger>
                        <UiSelectContent>
                            <UiSelectItem value={ALL}>{t('orgSettings.structure.allDesignations')}</UiSelectItem>
                            {designationOptions.map(name => <UiSelectItem key={name} value={name}>{name}</UiSelectItem>)}
                        </UiSelectContent>
                    </UiSelect>
                )}
            </div>
        </div>
    )
}
