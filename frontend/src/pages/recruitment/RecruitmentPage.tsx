import React, { useState } from 'react'
import { Plus, Briefcase, Users, Clock, TrendingUp, MoreHorizontal, Star, MapPin, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Avatar, AvatarFallback } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/form-controls'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { useJobs, useApplications, useUpdateApplicationStage } from '@/hooks/useRecruitment'
import { toast } from '@/components/ui/overlays'
import type { Candidate, ApplicationStage } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'

const stages: { id: ApplicationStage; label: string; color: string }[] = [
  { id: 'received', label: 'Received', color: 'bg-slate-100 border-slate-200' },
  { id: 'screening', label: 'Screening', color: 'bg-blue-50 border-blue-200' },
  { id: 'interview', label: 'Interview', color: 'bg-violet-50 border-violet-200' },
  { id: 'assessment', label: 'Assessment', color: 'bg-amber-50 border-amber-200' },
  { id: 'offer', label: 'Offer', color: 'bg-emerald-50 border-emerald-200' },
  { id: 'pre_boarding', label: 'Pre-boarding', color: 'bg-teal-50 border-teal-200' },
]

function CandidateCard({ candidate, onMove }: { candidate: Candidate; onMove: (id: string, stage: ApplicationStage) => void }) {
  const stageIdx = stages.findIndex(s => s.id === candidate.stage)
  const nextStage = stages[stageIdx + 1]

  return (
    <div className="bg-card rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow card-hover">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px]">{getInitials(candidate.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-semibold">{candidate.name}</p>
            <p className="text-[10px] text-muted-foreground">{candidate.nationality}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-medium">{candidate.score}</span>
        </div>
      </div>
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {candidate.experience}y exp
        </div>
        {candidate.expectedSalary && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <DollarSign className="h-3 w-3" /> {formatCurrency(candidate.expectedSalary)}
          </div>
        )}
      </div>
      {nextStage && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full text-[10px] h-6"
          onClick={() => onMove(candidate.id, nextStage.id)}
        >
          Move to {nextStage.label} →
        </Button>
      )}
    </div>
  )
}

const jobColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'title',
    header: 'Position',
    cell: ({ row: { original: j } }) => (
      <div>
        <p className="font-medium text-sm">{j.title}</p>
        <p className="text-[11px] text-muted-foreground">{j.department} · {j.location}</p>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string
      const v = s === 'open' ? 'success' : s === 'on_hold' ? 'warning' : 'secondary'
      return <Badge variant={v as any} className="capitalize text-[11px]">{s.replace('_', ' ')}</Badge>
    },
  },
  { accessorKey: 'openings', header: 'Openings', cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as number}</span> },
  { accessorKey: 'applications', header: 'Applications', cell: ({ getValue }) => <span className="text-sm">{getValue() as number}</span> },
  {
    id: 'salary',
    header: 'Salary Range',
    cell: ({ row: { original: j } }) => (
      <span className="text-xs">{formatCurrency(j.minSalary)} – {formatCurrency(j.maxSalary)}</span>
    ),
  },
  { accessorKey: 'closingDate', header: 'Closing', cell: ({ getValue }) => <span className="text-xs">{formatDate(getValue() as string)}</span> },
]

export function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState('pipeline')
  const { data: jobsData } = useJobs({ limit: 50 })
  const { data: appsData } = useApplications({ limit: 100 })
  const updateStage = useUpdateApplicationStage()
  const jobs: any[] = (jobsData?.data as any[]) ?? []
  const candidates: Candidate[] = (appsData?.data as Candidate[]) ?? []

  const moveCandidate = (id: string, newStage: ApplicationStage) => {
    const c = candidates.find((c: any) => c.id === id)
    updateStage.mutate({ id, stage: newStage }, {
      onSuccess: () => {
        if (c) toast.success('Candidate moved', `${(c as any).name} moved to ${newStage.replace('_', ' ')} stage.`)
      }
    })
  }

  return (
    <PageWrapper>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Open Positions" value={jobs.filter((j: any) => j.status === 'open').length} icon={Briefcase} color="blue" />
        <KpiCardCompact label="Total Applicants" value={candidates.length} icon={Users} color="purple" />
        <KpiCardCompact label="In Interview" value={candidates.filter((c: any) => c.stage === 'interview').length} icon={Clock} color="amber" />
        <KpiCardCompact label="Offer Stage" value={candidates.filter((c: any) => c.stage === 'offer' || c.stage === 'pre_boarding').length} icon={TrendingUp} color="green" />
      </div>

      <Tabs
        tabs={[
          { id: 'pipeline', label: 'Candidate Pipeline' },
          { id: 'jobs', label: 'Job Listings' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {stages.map(stage => {
              const stageCandidates = candidates.filter((c: any) => c.stage === stage.id)
              return (
                <div key={stage.id} className={cn('w-52 rounded-xl border p-3 space-y-2', stage.color)}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">{stage.label}</p>
                    <span className="h-5 w-5 rounded-full bg-card text-[10px] font-bold flex items-center justify-center border border-current/20">
                      {stageCandidates.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stageCandidates.map(c => (
                      <CandidateCard key={c.id} candidate={c} onMove={moveCandidate} />
                    ))}
                    {stageCandidates.length === 0 && (
                      <div className="border-2 border-dashed border-current/20 rounded-lg py-6 text-center">
                        <p className="text-[10px] text-muted-foreground">No candidates</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <Card className="p-5">
          <DataTable
            columns={jobColumns}
            data={jobs}
            searchKey="title"
            searchPlaceholder="Search jobs..."
            pageSize={8}
            toolbar={
              <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>New Job</Button>
            }
          />
        </Card>
      )}
    </PageWrapper>
  )
}
