import { Laptop2, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useMyAssets, useEmployeeAssets, type AssetAssignment } from '@/hooks/useAssets'
import { formatDate } from '@/lib/utils'

type Props =
    | { variant: 'me'; employeeId?: undefined; title?: string }
    | { variant: 'employee'; employeeId: string | undefined; title?: string }

/**
 * Card listing the currently-assigned company assets (laptops, phones, etc.)
 * for either the signed-in user (`variant="me"`) or a specific team member
 * (`variant="employee"`). Uses different hooks under the hood so query keys
 * stay distinct — the same employee viewing their own assets shouldn't share
 * a cache entry with a manager viewing the same employee.
 */
export function AssignedAssetsCard(props: Props) {
    const title = props.title ?? 'Assigned assets'
    const me = useMyAssets()
    const other = useEmployeeAssets(props.variant === 'employee' ? props.employeeId : undefined)
    const query = props.variant === 'me' ? me : other
    const isActive = props.variant === 'me' || !!props.employeeId
    const showSkeleton = isActive && query.isLoading
    const assets: AssetAssignment[] = query.data ?? []

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {title}
                    </h3>
                    {assets.length > 0 ? (
                        <Badge variant="secondary" className="text-xs">{assets.length}</Badge>
                    ) : null}
                </div>

                {showSkeleton ? (
                    <div className="space-y-3">
                        <Skeleton className="h-16 w-full rounded-lg" />
                        <Skeleton className="h-16 w-full rounded-lg" />
                    </div>
                ) : assets.length === 0 ? (
                    <EmptyState
                        icon={<Package className="size-5" />}
                        title="No assets assigned"
                        description="Company gear assigned to you will appear here."
                    />
                ) : (
                    <ul className="space-y-2">
                        {assets.map((a) => (
                            <AssetRow key={a.id} a={a} />
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

function AssetRow({ a }: { a: AssetAssignment }) {
    const secondary = [a.assetBrand, a.assetModel].filter(Boolean).join(' ') || a.categoryName || null
    return (
        <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:bg-card/70">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <Laptop2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{a.assetName ?? a.assetCode ?? 'Asset'}</p>
                    {a.assetCode ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {a.assetCode}
                        </span>
                    ) : null}
                    {a.assetCondition ? (
                        <Badge
                            variant={a.assetCondition === 'damaged' ? 'destructive' : 'outline'}
                            className="text-[10px] capitalize"
                        >
                            {a.assetCondition}
                        </Badge>
                    ) : null}
                </div>
                {secondary ? (
                    <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Assigned {formatDate(a.assignedDate)}
                    {a.expectedReturnDate ? ` · Return by ${formatDate(a.expectedReturnDate)}` : ''}
                    {a.assetSerialNumber ? ` · S/N ${a.assetSerialNumber}` : ''}
                </p>
            </div>
        </li>
    )
}
