import { useMemo, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { Plus, Briefcase, Users, Clock, TrendingUp, Star, DollarSign, Eye, Edit2, UserCheck, RefreshCcw } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/form-controls'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { useJobs, useApplications, useUpdateApplicationStage, useUpdateJob, useCreateJob, useCreateApplication, useUpdateApplication, useConvertCandidateToEmployee } from '@/hooks/useRecruitment'
import { toast, ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/overlays'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/primitives'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { Textarea } from '@/components/ui/textarea'
import { NewJobDialog, EditJobDialog } from '@/components/shared/action-dialogs'
import { EditCandidateDialog } from '@/components/shared/EditCandidateDialog'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { JOB_STATUS_OPTIONS } from '@/lib/options'

const JOB_FILTERS: FilterConfig[] = [
  { name: 'title', label: 'Job title', type: 'text', field: 'title' },
  { name: 'status', label: 'Status', type: 'select', field: 'status', options: JOB_STATUS_OPTIONS },
  { name: 'department', label: 'Department', type: 'text', field: 'department' },
  { name: 'location', label: 'Location', type: 'text', field: 'location' },
  { name: 'openings', label: 'Openings', type: 'number_range', field: 'openings', min: 1 },
  { name: 'minSalary', label: 'Min salary (AED)', type: 'number_range', field: 'minSalary', min: 0, prefix: 'AED' },
  { name: 'closingDate', label: 'Closing date', type: 'date_range', field: 'closingDate' },
]
import type { Candidate, ApplicationStage, Job } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'

const stages: { id: ApplicationStage; label: string; bgClass: string }[] = [
  { id: 'received', label: 'Received', bgClass: 'bg-muted/50 border-border' },
  { id: 'screening', label: 'Screening', bgClass: 'bg-info/5 border-info/20' },
  { id: 'interview', label: 'Interview', bgClass: 'bg-warning/5 border-warning/20' },
  { id: 'assessment', label: 'Assessment', bgClass: 'bg-primary/5 border-primary/20' },
  { id: 'offer', label: 'Offer', bgClass: 'bg-success/5 border-success/20' },
  { id: 'pre_boarding', label: 'Pre-boarding', bgClass: 'bg-accent/50 border-accent' },
  { id: 'rejected', label: 'Rejected', bgClass: 'bg-destructive/5 border-destructive/20' },
]

const CandidateCard = memo(function CandidateCard({
  candidate,
  onMove,
  onConvert,
  onEdit,
  draggable = false,
  isDragOverlay = false,
}: {
  candidate: Candidate
  onMove: (id: string, stage: ApplicationStage) => void
  onConvert?: (id: string) => void
  onEdit?: (id: string) => void
  draggable?: boolean
  isDragOverlay?: boolean
}) {
  const stageIdx = stages.findIndex(s => s.id === candidate.stage)
  // Skip 'rejected' as a "next stage" — it's a terminal state reached only via reject action.
  const nextStage = candidate.stage !== 'rejected' && candidate.stage !== 'pre_boarding'
    ? stages[stageIdx + 1] && stages[stageIdx + 1].id !== 'rejected' ? stages[stageIdx + 1] : undefined
    : undefined
  const navigate = useNavigate()

  const drag = useDraggable({ id: candidate.id, disabled: !draggable })
  const style: React.CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {}
  const isDragging = draggable && drag.isDragging
  // Spread listeners on the whole card so the user can grab it from anywhere,
  // but keep the inner action buttons clickable (they stop propagation).
  const cardDragProps = draggable && !isDragOverlay ? { ...drag.attributes, ...drag.listeners } : {}

  return (
    <div
      ref={draggable ? drag.setNodeRef : undefined}
      style={style}
      {...cardDragProps}
      className={cn(
        'bg-card rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow select-none',
        draggable && !isDragOverlay && 'cursor-grab active:cursor-grabbing',
        isDragging && !isDragOverlay && 'opacity-30',
        isDragOverlay && 'ring-2 ring-primary shadow-lg cursor-grabbing rotate-2',
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getInitials(candidate.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{candidate.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{candidate.nationality}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Star className="h-3 w-3 text-warning fill-warning" />
          <span className="text-[10px] font-medium">{candidate.score}</span>
          {onEdit && !isDragOverlay && (
            <button
              type="button"
              aria-label="Edit candidate"
              className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(candidate.id) }}
            >
              <Edit2 className="h-3 w-3" />
            </button>
          )}
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMove(candidate.id, nextStage.id) }}
        >
          Move to {nextStage.label} &rarr;
        </Button>
      )}
      {candidate.stage === 'pre_boarding' && onConvert && (
        <Button
          size="sm"
          variant="default"
          className="w-full text-[10px] h-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onConvert(candidate.id) }}
        >
          <UserCheck className="h-3 w-3 mr-1" /> Convert to Employee
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-[10px] h-6 mt-1"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); navigate(`/recruitment/candidates/${candidate.id}`) }}
      >
        <Eye className="h-3 w-3 mr-1" /> View Profile
      </Button>
    </div>
  )
})

function StageColumn({
  stage,
  candidates,
  onMove,
  onConvert,
  onEdit,
  showAdd,
  onAdd,
  addDisabled,
}: {
  stage: typeof stages[number]
  candidates: Candidate[]
  onMove: (id: string, stage: ApplicationStage) => void
  onConvert?: (id: string) => void
  onEdit?: (id: string) => void
  showAdd: boolean
  onAdd: () => void
  addDisabled: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `stage:${stage.id}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-56 rounded-xl border p-3 space-y-2 transition-colors',
        stage.bgClass,
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{stage.label}</p>
        <div className="flex items-center gap-1">
          {showAdd && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              aria-label="Add candidate"
              onClick={onAdd}
              disabled={addDisabled}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          <span className="h-5 w-5 rounded-full bg-background text-[10px] font-bold flex items-center justify-center border border-border shadow-sm">
            {candidates.length}
          </span>
        </div>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {candidates.map(c => (
          <CandidateCard key={c.id} candidate={c} onMove={onMove} onConvert={onConvert} onEdit={onEdit} draggable />
        ))}
        {candidates.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-lg py-6 text-center">
            <p className="text-[10px] text-muted-foreground">{isOver ? 'Drop here' : 'No candidates'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

const buildJobColumns = (onEdit: (job: Job) => void): ColumnDef<Job>[] => [
  {
    accessorKey: 'title',
    header: 'Position',
    cell: ({ row: { original: j } }) => (
      <div>
        <p className="font-medium text-sm text-foreground">{j.title}</p>
        <p className="text-[11px] text-muted-foreground">{j.department} &middot; {j.location}</p>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string
      const config: Record<string, string> = {
        open: 'bg-success/10 text-success border-success/20',
        on_hold: 'bg-warning/10 text-warning border-warning/20',
        closed: 'bg-muted text-muted-foreground',
      }
      return (
        <Badge variant="outline" className={cn('capitalize text-[11px]', config[s] || config.closed)}>
          {labelFor(s)}
        </Badge>
      )
    },
  },
  { accessorKey: 'openings', header: 'Openings', cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as number}</span> },
  { accessorKey: 'applications', header: 'Applications', cell: ({ getValue }) => <span className="text-sm">{getValue() as number}</span> },
  {
    id: 'salary',
    header: 'Salary Range',
    cell: ({ row: { original: j } }) => (
      <span className="text-xs text-muted-foreground">{formatCurrency(j.minSalary)} – {formatCurrency(j.maxSalary)}</span>
    ),
  },
  { accessorKey: 'closingDate', header: 'Closing', cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
  {
    id: 'actions',
    header: '',
    cell: ({ row: { original: j } }) => (
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Edit job"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => onEdit(j)}
      >
        <Edit2 className="h-3.5 w-3.5" />
      </Button>
    ),
    size: 60,
  },
]

function AddCandidateDialog({ open, onOpenChange, jobs }: { open: boolean; onOpenChange: (o: boolean) => void; jobs: Job[] }) {
  const [jobId, setJobId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nationality, setNationality] = useState('')
  const [experience, setExperience] = useState('')
  const [expectedSalary, setExpectedSalary] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')
  const [notes, setNotes] = useState('')
  const createApp = useCreateApplication()

  const reset = () => {
    setJobId(''); setName(''); setEmail(''); setPhone(''); setNationality('')
    setExperience(''); setExpectedSalary(''); setResumeUrl(''); setNotes('')
  }

  const handleSave = async () => {
    if (!jobId) { toast.warning('Job required', 'Select the job this candidate is applying for.'); return }
    if (!name.trim()) { toast.warning('Name required', 'Enter the candidate name.'); return }
    if (!email.trim()) { toast.warning('Email required', 'Enter the candidate email.'); return }
    try {
      await createApp.mutateAsync({
        jobId,
        data: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          nationality: nationality.trim() || undefined,
          experience: experience ? Number(experience) : undefined,
          expectedSalary: expectedSalary ? Number(expectedSalary) : undefined,
          resumeUrl: resumeUrl.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      })
      toast.success('Candidate added', `${name.trim()} added to the pipeline.`)
      reset()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Please try again.'
      toast.error('Could not add candidate', msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Job</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger><SelectValue placeholder="Select an open job" /></SelectTrigger>
              <SelectContent>
                {jobs.length === 0 ? (
                  <SelectItem value="__none" disabled>No open jobs</SelectItem>
                ) : (
                  jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title} · {j.department}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label required>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 ..." />
            </div>
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="UAE" />
            </div>
            <div className="space-y-1.5">
              <Label>Experience (years)</Label>
              <NumericInput decimal={false} value={experience} onChange={(e) => setExperience(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected salary (AED)</Label>
              <NumericInput value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Resume URL</Label>
            <Input value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Source, recruiter remarks, etc." />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={createApp.isPending} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Add to pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConvertCandidateDialog({
  candidate,
  onOpenChange,
  onConverted,
}: {
  candidate: Candidate | null
  onOpenChange: (o: boolean) => void
  onConverted: (employeeId?: string) => void
}) {
  const updateApplication = useUpdateApplication()
  const convertToEmployee = useConvertCandidateToEmployee()
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10))
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('')
  const [basicSalary, setBasicSalary] = useState('')
  const [note, setNote] = useState('')

  if (!candidate) return null

  const appendNoteEntry = (existing: string | undefined, label: string, body: string): string => {
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const entry = `[${stamp}] ${label}: ${body.trim()}`
    return existing && existing.trim().length > 0 ? `${existing.trim()}\n${entry}` : entry
  }

  const handleSubmit = () => {
    const trimmed = note.trim()
    if (!trimmed) {
      toast.error('Note required', 'Please add a conversion note before creating the employee record.')
      return
    }
    const merged = appendNoteEntry(candidate.notes, 'Converted', trimmed)
    updateApplication.mutate(
      { id: candidate.id, data: { notes: merged } },
      {
        onSuccess: () => {
          convertToEmployee.mutate(
            {
              id: candidate.id,
              data: {
                joinDate: joinDate || undefined,
                designation: designation || undefined,
                department: department || undefined,
                basicSalary: basicSalary ? Number(basicSalary) : undefined,
              },
            },
            {
              onSuccess: (res) => {
                const resData = (res as { data?: { employee?: { employeeNo?: string; id?: string } } })?.data?.employee
                const empNo = resData?.employeeNo
                const empId = resData?.id
                toast.success('Candidate converted', empNo ? `Employee ${empNo} created.` : 'Employee created.')
                onConverted(empId)
              },
              onError: (err: unknown) => toast.error('Conversion failed', (err as { message?: string })?.message ?? 'Could not create employee.'),
            },
          )
        },
        onError: () => toast.error('Failed to save conversion note'),
      },
    )
  }

  const pending = updateApplication.isPending || convertToEmployee.isPending

  return (
    <Dialog open={!!candidate} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Convert {candidate.name} to Employee</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Join Date</Label>
              <DatePicker value={joinDate} onChange={setJoinDate} placeholder="Select join date" />
            </div>
            <div className="space-y-1.5">
              <Label>Basic Salary (AED)</Label>
              <NumericInput value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Engineer" />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
          </div>
          <div className="space-y-1.5">
            <Label required>Conversion Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Reason / context for conversion" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={pending} leftIcon={<UserCheck className="h-3.5 w-3.5" />}>
            Create Employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RecruitmentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('pipeline')
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<string[] | null>(null)
  const [addCandidateOpen, setAddCandidateOpen] = useState(false)
  const [convertCandidateId, setConvertCandidateId] = useState<string | null>(null)
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null)
  const { data: jobsData, isLoading: jobsLoading, isFetching: jobsFetching, refetch: refetchJobs } = useJobs({ limit: 50 })
  const { data: appsData, isLoading: appsLoading, refetch: refetchApps } = useApplications({ limit: 100 })
  const isLoading = jobsLoading || appsLoading
  const updateStage = useUpdateApplicationStage()
  const updateJob = useUpdateJob()
  const createJob = useCreateJob()
  const jobs = useMemo<Job[]>(() => (jobsData?.data as Job[]) ?? [], [jobsData?.data])
  const jobSearch = useSearchFilters({
    storageKey: 'hrhub.recruitment.jobs.searchHistory',
    availableFilters: JOB_FILTERS,
  })
  const filteredJobs = useMemo(
    () => applyClientFilters(jobs as unknown as Record<string, unknown>[], {
      searchInput: jobSearch.searchInput,
      appliedFilters: jobSearch.appliedFilters,
      searchFields: ['title', 'department', 'location'],
    }) as unknown as Job[],
    [jobs, jobSearch.appliedFilters, jobSearch.searchInput],
  )
  const candidates: Candidate[] = (appsData?.data as Candidate[]) ?? []
  const jobColumns = useMemo(() => buildJobColumns((j) => setEditJob(j)), [])

  const moveCandidate = (id: string, newStage: ApplicationStage) => {
    const c = candidates.find((c) => c.id === id)
    // Toast immediately — the optimistic cache update already reflects the move,
    // so the user sees the card jump and the confirmation in the same frame.
    if (c) toast.success('Candidate moved', `${c.name} moved to ${labelFor(newStage)} stage.`)
    updateStage.mutate(
      { id, stage: newStage },
      {
        onError: () => {
          if (c) toast.error('Move failed', `Could not move ${c.name}. Reverted.`)
        },
      },
    )
  }

  // Drag and drop wiring for the kanban.
  // 3px activation distance feels snappier while still letting card buttons receive clicks.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }))
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const activeDragCandidate = activeDragId ? candidates.find((c) => c.id === activeDragId) : null

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    if (!overId.startsWith('stage:')) return
    const targetStage = overId.slice('stage:'.length) as ApplicationStage
    const candidate = candidates.find((c) => c.id === String(active.id))
    if (!candidate || candidate.stage === targetStage) return
    if (targetStage === 'rejected') {
      toast.warning(
        'Open profile to reject',
        'Rejection requires a reason. Open the candidate profile and use the Reject button.',
      )
      return
    }
    moveCandidate(candidate.id, targetStage)
  }

  const openJobs = jobs.filter((j) => j.status === 'open').length
  const inInterview = candidates.filter((c) => c.stage === 'interview').length
  const inOffer = candidates.filter((c) => c.stage === 'offer' || c.stage === 'pre_boarding').length

  return (
    <PageWrapper>
      <PageHeader
        title={t('recruitment.title')}
        description={t('recruitment.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={jobsFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => { void refetchJobs(); void refetchApps() }} disabled={jobsFetching}>
              Refresh
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setAddCandidateOpen(true)} disabled={jobs.filter((j) => j.status === 'open').length === 0}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Candidate</span>
            </Button>
            <Button className="gap-2" onClick={() => setJobDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Job</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <KpiCardCompact label="Open Positions" value={openJobs} icon={Briefcase} color="blue" />
            <KpiCardCompact label="Total Applicants" value={candidates.length} icon={Users} color="cyan" />
            <KpiCardCompact label="In Interview" value={inInterview} icon={Clock} color="amber" />
            <KpiCardCompact label="Offer Stage" value={inOffer} icon={TrendingUp} color="green" />
          </>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'pipeline', label: 'Candidate Pipeline' },
          { id: 'jobs', label: 'Job Listings' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="border-b-0"
      />

      {activeTab === 'pipeline' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-3 min-w-max">
              {stages.map(stage => {
                const stageCandidates = candidates.filter((c) => c.stage === stage.id)
                return (
                  <StageColumn
                    key={stage.id}
                    stage={stage}
                    candidates={stageCandidates}
                    onMove={moveCandidate}
                    onConvert={(id) => setConvertCandidateId(id)}
                    onEdit={(id) => setEditCandidateId(id)}
                    showAdd={stage.id === 'received'}
                    onAdd={() => setAddCandidateOpen(true)}
                    addDisabled={jobs.filter((j) => j.status === 'open').length === 0}
                  />
                )
              })}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragCandidate && (
              <div className="w-56">
                <CandidateCard candidate={activeDragCandidate} onMove={moveCandidate} isDragOverlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {activeTab === 'jobs' && (
        <Card className="p-4 sm:p-5">
          <DataTable
            columns={jobColumns}
            data={filteredJobs}
            advancedFilter={{
              search: jobSearch,
              filters: JOB_FILTERS,
              placeholder: 'Search jobs…',
            }}
            pageSize={8}
            enableSelection
            getRowId={(row) => String(row.id)}
            toolbar={
              <Button size="sm" className="gap-1.5" onClick={() => setJobDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Job
              </Button>
            }
            bulkActions={(selected) => (
              <>
                <Button variant="outline" size="sm"
                  onClick={() => setCloseConfirm(selected.map((r) => r.id))}>
                  Close
                </Button>
                <Button variant="outline" size="sm"
                  onClick={async () => {
                    try {
                      await Promise.all(selected.map((r) => createJob.mutateAsync({
                        title: `${r.title} (Copy)`,
                        department: r.department,
                        location: r.location,
                        type: r.type,
                        status: 'draft',
                        openings: r.openings,
                        minSalary: r.minSalary,
                        maxSalary: r.maxSalary,
                        description: r.description,
                        requirements: r.requirements,
                        closingDate: r.closingDate,
                      })))
                      toast.success(`${selected.length} job(s) duplicated`, 'Draft copies created.')
                    } catch {
                      toast.error('Duplicate failed', 'Could not duplicate selected jobs.')
                    }
                  }}
                  disabled={createJob.isPending}>
                  Duplicate
                </Button>
              </>
            )}
          />
        </Card>
      )}

      <NewJobDialog open={jobDialogOpen} onOpenChange={setJobDialogOpen} />
      <AddCandidateDialog
        open={addCandidateOpen}
        onOpenChange={setAddCandidateOpen}
        jobs={jobs.filter((j) => j.status === 'open')}
      />
      <ConvertCandidateDialog
        key={convertCandidateId ?? 'none'}
        candidate={convertCandidateId ? candidates.find((c) => c.id === convertCandidateId) ?? null : null}
        onOpenChange={(o) => !o && setConvertCandidateId(null)}
        onConverted={(empId) => {
          setConvertCandidateId(null)
          if (empId) navigate(`/employees/${empId}`)
        }}
      />
      <EditCandidateDialog
        candidate={editCandidateId ? candidates.find((c) => c.id === editCandidateId) ?? null : null}
        open={!!editCandidateId}
        onOpenChange={(o) => !o && setEditCandidateId(null)}
      />
      {editJob && (
        <EditJobDialog
          open={!!editJob}
          onOpenChange={(o) => !o && setEditJob(null)}
          job={editJob}
        />
      )}
      <ConfirmDialog
        open={!!closeConfirm}
        onOpenChange={(o) => !o && setCloseConfirm(null)}
        title={`Close ${closeConfirm?.length ?? 0} job${closeConfirm?.length === 1 ? '' : 's'}?`}
        description="Closing these jobs will stop accepting new applications. Existing candidates remain in the pipeline."
        confirmLabel="Close jobs"
        variant="warning"
        onConfirm={async () => {
          try {
            await Promise.all((closeConfirm ?? []).map(id => updateJob.mutateAsync({ id, data: { status: 'closed' } })))
            toast.success(`${closeConfirm?.length ?? 0} jobs closed`, 'They are now read-only.')
          } catch {
            toast.error('Failed to close jobs', 'Some jobs could not be updated.')
          } finally {
            setCloseConfirm(null)
          }
        }}
      />
    </PageWrapper>
  )
}

export default RecruitmentPage
