import { PageHeader } from '@/components/shared/PageHeader'
import { PerformanceCard } from '@/components/shared/PerformanceCard'

export function EmployeePerformancePage() {
    return (
        <div className="space-y-5">
            <PageHeader
                title="Performance"
                subtitle="Your reviews and any warnings on record"
            />
            <PerformanceCard variant="me" />
        </div>
    )
}
