import { useEffect, useRef, useMemo, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { Plus, Briefcase, Users, Clock, TrendingUp, Star, Mail, Phone, Eye, Edit2, UserCheck, RefreshCcw, LayoutList, LayoutGrid, ChevronRight, Loader2, AlertCircle, FileText, XCircle } from 'lucide-react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/form-controls'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { useJobs, useApplications, useKanbanStage, useUpdateApplicationStage, useUpdateJob, useCreateJob, useCreateApplication, useUpdateApplication, useConvertCandidateToEmployee, useUploadResume } from '@/hooks/useRecruitment'
import { useRecruitmentSocket } from '@/hooks/useRecruitmentSocket'
import { useQueryClient } from '@tanstack/react-query'
import { toast, ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/overlays'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/primitives'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { Textarea } from '@/components/ui/textarea'
import { NewJobDialog, EditJobDialog, buildOrgOptions } from '@/components/shared/action-dialogs'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { Combobox } from '@/components/ui/combobox'
import { EditCandidateDialog } from '@/components/shared/EditCandidateDialog'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { type FilterConfig, buildFilterQueryString } from '@/lib/filters'
import { searchDepartments, searchNationalities } from '@/lib/filters/filter-loaders'
import { AdvancedSearchBar } from '@/components/filters/AdvancedSearchBar'
import { JOB_STATUS_OPTIONS } from '@/lib/options'
import { PhoneInput, CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { exportRecruitment } from '@/lib/export'
import { ExportDropdown } from '@/components/shared/ExportDropdown'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'

const PAGE_SIZE = 10

const JOB_FILTERS: FilterConfig[] = [
  { name: 'title', label: 'Job title', type: 'text', field: 'title' },
  { name: 'status', label: 'Status', type: 'multi_select', field: 'status', options: JOB_STATUS_OPTIONS },
  { name: 'department', label: 'Department', type: 'autocomplete', field: 'department', onSearch: searchDepartments, placeholder: 'Search departments…' },
  { name: 'location', label: 'Location', type: 'text', field: 'location' },
  { name: 'openings', label: 'Openings', type: 'number_range', field: 'openings', min: 1 },
  { name: 'minSalary', label: 'Min salary (AED)', type: 'number_range', field: 'minSalary', min: 0, prefix: 'AED' },
  { name: 'closingDate', label: 'Closing date', type: 'date_range', field: 'closingDate' },
]

const CANDIDATE_FILTERS: FilterConfig[] = [
  { name: 'nationality', label: 'Nationality', type: 'autocomplete', field: 'nationality', onSearch: searchNationalities, placeholder: 'Search nationalities…' },
  { name: 'experience', label: 'Experience (yrs)', type: 'number_range', field: 'experience', min: 0 },
  { name: 'expectedSalary', label: 'Expected salary (AED)', type: 'number_range', field: 'expectedSalary', min: 0, prefix: 'AED' },
  { name: 'score', label: 'Score', type: 'number_range', field: 'score', min: 0, max: 100 },
]
import type { Candidate, ApplicationStage, Job } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'

const stages: { id: ApplicationStage; label: string; bgClass: string; dotClass: string }[] = [
  { id: 'received', label: 'Received', bgClass: 'bg-muted/50 border-border', dotClass: 'bg-slate-400' },
  { id: 'screening', label: 'Screening', bgClass: 'bg-info/5 border-info/20', dotClass: 'bg-info' },
  { id: 'interview', label: 'Interview', bgClass: 'bg-warning/5 border-warning/20', dotClass: 'bg-warning' },
  { id: 'assessment', label: 'Assessment', bgClass: 'bg-primary/5 border-primary/20', dotClass: 'bg-primary' },
  { id: 'offer', label: 'Offer', bgClass: 'bg-success/5 border-success/20', dotClass: 'bg-success' },
  { id: 'pre_boarding', label: 'Pre-boarding', bgClass: 'bg-accent/50 border-accent', dotClass: 'bg-emerald-500' },
  { id: 'rejected', label: 'Rejected', bgClass: 'bg-destructive/5 border-destructive/20', dotClass: 'bg-destructive' },
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
  onMove: (candidate: Candidate, stage: ApplicationStage) => void
  onConvert?: (candidate: Candidate) => void
  onEdit?: (candidate: Candidate) => void
  draggable?: boolean
  isDragOverlay?: boolean
}) {
  const stageIdx = stages.findIndex(s => s.id === candidate.stage)
  // Skip 'rejected' as a "next stage" — it's a terminal state reached only via reject action.
  const nextStage = candidate.stage !== 'rejected' && candidate.stage !== 'pre_boarding'
    ? stages[stageIdx + 1] && stages[stageIdx + 1].id !== 'rejected' ? stages[stageIdx + 1] : undefined
    : undefined
  const navigate = useNavigate()

  // Pass the full candidate through drag data so handleDragStart can capture it
  // for the DragOverlay and optimistic stage update without a flat-array lookup.
  const drag = useDraggable({ id: candidate.id, data: { candidate }, disabled: !draggable })
  const isDragging = draggable && drag.isDragging
  const cardDragProps = draggable && !isDragOverlay ? { ...drag.attributes, ...drag.listeners } : {}

  return (
    <div
      ref={draggable ? drag.setNodeRef : undefined}
      {...cardDragProps}
      className={cn(
        'bg-card rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow select-none',
        draggable && !isDragOverlay && 'cursor-grab active:cursor-grabbing',
        isDragging && !isDragOverlay && 'opacity-20 pointer-events-none',
        isDragOverlay && 'ring-2 ring-primary shadow-xl cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">{getInitials(candidate.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight truncate">{candidate.name}</p>
            {candidate.nationality && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{candidate.nationality}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <Star className="h-3 w-3 text-warning fill-warning" />
          <span className="text-[10px] font-semibold text-foreground">{candidate.score}</span>
          {!isDragOverlay && (
            <button
              type="button"
              aria-label="View profile"
              className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); navigate(`/recruitment/candidates/${candidate.id}`) }}
            >
              <Eye className="h-3 w-3" />
            </button>
          )}
          {onEdit && !isDragOverlay && (
            <button
              type="button"
              aria-label="Edit candidate"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEdit(candidate) }}
            >
              <Edit2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {(candidate.jobTitle || candidate.experience !== undefined) && (
        <div className="flex items-center gap-1.5 mb-2 px-0.5">
          <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-foreground/80 font-medium truncate flex-1">
            {candidate.jobTitle ?? 'Open Position'}
          </p>
          {candidate.experience !== undefined && (
            <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{candidate.experience}y
            </span>
          )}
        </div>
      )}

      <div className="space-y-1 mb-3 bg-muted/40 rounded-lg p-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{candidate.email}</span>
        </div>
        {candidate.phone && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{candidate.phone}</span>
          </div>
        )}
      </div>
      {nextStage && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full text-[10px] h-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMove(candidate, nextStage.id) }}
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
          onClick={(e) => { e.stopPropagation(); onConvert(candidate) }}
        >
          <UserCheck className="h-3 w-3 mr-1" /> Convert to Employee
        </Button>
      )}
    </div>
  )
})

// Each column fetches its own page of candidates and loads more on scroll.
// This replaces the old approach of loading 500 candidates upfront and slicing client-side.
function StageColumn({
  stage,
  onMove,
  onConvert,
  onEdit,
  showAdd,
  onAdd,
  addDisabled,
  kanbanParams,
}: {
  stage: typeof stages[number]
  onMove: (candidate: Candidate, targetStage: ApplicationStage) => void
  onConvert?: (candidate: Candidate) => void
  onEdit?: (candidate: Candidate) => void
  showAdd: boolean
  onAdd: () => void
  addDisabled: boolean
  kanbanParams?: { q?: string; filter?: string }
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `stage:${stage.id}` })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useKanbanStage(stage.id, kanbanParams)

  const candidates: Candidate[] = data?.pages.flatMap((p) => p.data) ?? []
  const total = data?.pages[0]?.total ?? 0

  // Trigger next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage() },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

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
        <div className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full shrink-0', stage.dotClass)} />
          <p className="text-xs font-semibold text-foreground">{stage.label}</p>
        </div>
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
            {isLoading ? '…' : total}
          </span>
        </div>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-3 space-y-2 animate-pulse">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-2.5 w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-6 w-full rounded-md" />
            </div>
          ))
        ) : (
          <>
            {candidates.map((c: Candidate) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onMove={onMove}
                onConvert={onConvert}
                onEdit={onEdit}
                draggable
              />
            ))}
            {hasNextPage && (
              <div ref={sentinelRef} className="py-2 flex justify-center">
                {isFetchingNextPage
                  ? <div className="flex gap-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-1.5 w-1.5 rounded-full" />)}</div>
                  : <span className="text-[10px] text-muted-foreground">Scroll for more</span>
                }
              </div>
            )}
            {candidates.length === 0 && (
              <div className="border-2 border-dashed border-border rounded-lg py-6 text-center">
                <p className="text-[10px] text-muted-foreground">{isOver ? 'Drop here' : 'No candidates'}</p>
              </div>
            )}
          </>
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
  { accessorKey: 'applications', header: 'Applications', cell: ({ getValue }) => <span className="text-sm">{(getValue() as number | null | undefined) ?? 0}</span> },
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
        onClick={(e) => { e.stopPropagation(); onEdit(j) }}
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
  const [notes, setNotes] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const createApp = useCreateApplication()
  const uploadResume = useUploadResume()

  const reset = () => {
    setJobId(''); setName(''); setEmail(''); setPhone(''); setNationality('')
    setExperience(''); setExpectedSalary(''); setNotes(''); setResumeFile(null)
  }

  const handleSave = async () => {
    if (!jobId) { toast.warning('Job required', 'Select the job this candidate is applying for.'); return }
    if (!name.trim()) { toast.warning('Name required', 'Enter the candidate name.'); return }
    if (!email.trim()) { toast.warning('Email required', 'Enter the candidate email.'); return }
    try {
      const result = await createApp.mutateAsync({
        jobId,
        data: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          nationality: nationality.trim() || undefined,
          experience: experience ? Number(experience) : undefined,
          expectedSalary: expectedSalary ? Number(expectedSalary) : undefined,
          notes: notes.trim() || undefined,
        },
      })
      const newId = (result as { data?: { id?: string } })?.data?.id
      if (resumeFile && newId) {
        await uploadResume.mutateAsync({ id: newId, file: resumeFile })
      }
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
            <Select value={jobId || undefined} onValueChange={setJobId}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <CountrySelect
                value={resolveCountryIso(nationality)}
                onChange={(iso) => setNationality(countryNameFromIso(iso))}
                placeholder="Select nationality"
              />
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
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Source, recruiter remarks, etc." />
          </div>
          <div className="space-y-1.5">
            <Label>Resume</Label>
            <label className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border cursor-pointer transition-colors',
              'hover:border-primary/50 hover:bg-primary/5',
              resumeFile && 'border-primary/40 bg-primary/5',
            )}>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="sr-only"
                onChange={e => setResumeFile(e.target.files?.[0] ?? null)}
              />
              <FileText className={cn('h-4 w-4 shrink-0', resumeFile ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-sm truncate', resumeFile ? 'text-foreground' : 'text-muted-foreground')}>
                {resumeFile ? resumeFile.name : 'Attach resume (PDF, DOC, DOCX)'}
              </span>
              {resumeFile && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setResumeFile(null) }}
                  className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove resume"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={createApp.isPending || uploadResume.isPending} leftIcon={<Plus className="h-3.5 w-3.5" />}>
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
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [designation, setDesignation] = useState('')
  const [department, setDepartment] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [basicSalary, setBasicSalary] = useState('')
  const [note, setNote] = useState('')
  const { data: orgUnitsRaw = [] } = useOrgUnits()
  const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
  const orgOptions = buildOrgOptions(orgUnits)

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
                departmentId: departmentId || undefined,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Combobox
              value={departmentId}
              onValueChange={(id) => {
                const opt = orgOptions.find(o => o.value === id)
                setDepartmentId(id)
                setDepartment(opt?.label ?? '')
              }}
              options={orgOptions}
              placeholder="Select department…"
            />
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

const CandidateListRow = memo(function CandidateListRow({
  candidate,
  onView,
  onEdit,
}: {
  candidate: Candidate
  onView: (id: string) => void
  onEdit?: (c: Candidate) => void
}) {
  const stage = stages.find(s => s.id === candidate.stage)
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors group cursor-pointer"
      onClick={() => onView(candidate.id)}
    >
      {/* Candidate info — flex-1 matches header */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-9 w-9 shrink-0 border border-border/60">
          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
            {getInitials(candidate.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{candidate.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {candidate.nationality && <span className="text-[11px] text-muted-foreground">{candidate.nationality}</span>}
            {candidate.experience > 0 && <span className="text-[11px] text-muted-foreground">{candidate.experience}y exp</span>}
            {candidate.jobTitle && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />{candidate.jobTitle}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Fixed-width data columns — match sticky header widths */}
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        <div className="w-[90px]">
          {stage && (
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border max-w-full', stage.bgClass)}>
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', stage.dotClass)} />
              <span className="truncate">{stage.label}</span>
            </span>
          )}
        </div>
        <div className="w-10 flex justify-center">
          {candidate.score > 0
            ? <div className="flex items-center gap-0.5 text-[11px] text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span className="font-medium">{candidate.score}</span></div>
            : <span className="text-[11px] text-muted-foreground/30">—</span>
          }
        </div>
        <div className="w-20 text-right text-[11px] text-muted-foreground">
          {candidate.expectedSalary != null ? formatCurrency(candidate.expectedSalary) : <span className="text-muted-foreground/30">—</span>}
        </div>
        <div className="w-[70px] text-right text-[11px] text-muted-foreground">
          {formatDate(candidate.appliedDate)}
        </div>
      </div>
      <div className="flex sm:hidden items-center gap-2 flex-wrap">
        {stage && (
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border', stage.bgClass)}>
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', stage.dotClass)} />{stage.label}
          </span>
        )}
        {candidate.score > 0 && <div className="flex items-center gap-0.5 text-[11px] text-amber-600"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span>{candidate.score}</span></div>}
        {candidate.expectedSalary != null && <span className="text-[11px] text-muted-foreground">{formatCurrency(candidate.expectedSalary)}</span>}
        <span className="text-[11px] text-muted-foreground">{formatDate(candidate.appliedDate)}</span>
      </div>
      {/* Actions — w-8 matches header spacer */}
      <div
        className="w-8 shrink-0 flex items-center justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        {onEdit
          ? <Button size="icon-sm" variant="ghost" aria-label="Edit candidate" onClick={() => onEdit(candidate)}><Edit2 className="h-3.5 w-3.5" /></Button>
          : <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        }
      </div>
    </div>
  )
})

export function RecruitmentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Real-time: subscribe to all recruitment WS events for this tenant
  useRecruitmentSocket()
  const [activeTab, setActiveTab] = useState('pipeline')
  const [pipelineView, setPipelineView] = useState<'kanban' | 'list'>('kanban')
  const [listStageFilter, setListStageFilter] = useState<ApplicationStage | 'all'>('all')
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<string[] | null>(null)
  const [addCandidateOpen, setAddCandidateOpen] = useState(false)
  const [convertCandidate, setConvertCandidate] = useState<Candidate | null>(null)
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null)
  const jobSearch = useSearchFilters({
    storageKey: 'hrhub.recruitment.jobs.searchHistory',
    availableFilters: JOB_FILTERS,
  })
  const candidateSearch = useSearchFilters({
    storageKey: 'hrhub.recruitment.candidates.searchHistory',
    availableFilters: CANDIDATE_FILTERS,
  })

  const serverJobFilters = useMemo(() => jobSearch.appliedFilters, [jobSearch.appliedFilters])

  const candidateFilterStr = useMemo(() => buildFilterQueryString(candidateSearch.appliedFilters) || undefined, [candidateSearch.appliedFilters])
  const candidateParams = useMemo(() => ({
    q: candidateSearch.searchInput || undefined,
    filter: candidateFilterStr,
  }), [candidateSearch.searchInput, candidateFilterStr])

  const [jobsOffset, setJobsOffset] = useState(0)
  const jobsFilterKey = (jobSearch.searchInput ?? '') + '||' + JSON.stringify(serverJobFilters)
  const [prevJobsFilterKey, setPrevJobsFilterKey] = useState(jobsFilterKey)
  if (jobsFilterKey !== prevJobsFilterKey) {
    setPrevJobsFilterKey(jobsFilterKey)
    setJobsOffset(0)
  }

  const { data: jobsData, isFetching: jobsFetching, refetch: refetchJobs } = useJobs({
    limit: PAGE_SIZE,
    offset: jobsOffset,
    q: jobSearch.searchInput || undefined,
    filters: serverJobFilters,
  })
  const jobsTotal = jobsData?.total ?? 0
  // Minimal query just to get the grand total for the KPI card.
  const { data: appsTotalData } = useApplications({ limit: 1 })
  // Per-stage queries for KPI cards — TanStack deduplicates with StageColumn's own calls.
  const { data: interviewData } = useKanbanStage('interview', candidateParams)
  const { data: offerData } = useKanbanStage('offer', candidateParams)
  const { data: preBoardingData } = useKanbanStage('pre_boarding', candidateParams)
  const { data: listAppsData, isLoading: listAppsLoading } = useApplications({
    limit: 200,
    q: candidateSearch.searchInput || undefined,
    filters: candidateSearch.appliedFilters,
    enabled: pipelineView === 'list' && activeTab === 'pipeline',
  })
  const allListCandidates = useMemo(
    () => ((listAppsData as { data?: Candidate[] })?.data ?? []) as Candidate[],
    [listAppsData],
  )
  const filteredListCandidates = useMemo(
    () => listStageFilter === 'all' ? allListCandidates : allListCandidates.filter(c => c.stage === listStageFilter),
    [allListCandidates, listStageFilter],
  )

  const { visibleCount: listVisibleCount, setVisibleCount: setListVisibleCount, sentinelRef: listSentinelRef } =
    useInfiniteScroll(filteredListCandidates.length)
  useEffect(() => { setListVisibleCount(20) }, [listStageFilter, candidateSearch.searchInput, candidateFilterStr, setListVisibleCount])

  const qc = useQueryClient()

  const updateStage = useUpdateApplicationStage()
  const updateJob = useUpdateJob()
  const createJob = useCreateJob()
  const jobs = useMemo<Job[]>(() => (jobsData?.data as Job[]) ?? [], [jobsData?.data])
  const filteredJobs = jobs
  const jobColumns = useMemo(() => buildJobColumns((j) => setEditJob(j)), [])

  const moveCandidate = (candidate: Candidate, newStage: ApplicationStage) => {
    toast.success('Candidate moved', `${candidate.name} moved to ${labelFor(newStage)} stage.`)
    updateStage.mutate(
      { id: candidate.id, stage: newStage, fromStage: candidate.stage, candidate },
      { onError: () => toast.error('Move failed', `Could not move ${candidate.name}. Reverted.`) },
    )
  }

  // Drag and drop — 3px activation lets buttons still receive clicks.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }))
  const [activeDragCandidate, setActiveDragCandidate] = useState<Candidate | null>(null)
  const [dragCardWidth, setDragCardWidth] = useState<number>(200)

  const handleDragStart = (e: DragStartEvent) => {
    const c = (e.active.data?.current as { candidate?: Candidate } | undefined)?.candidate ?? null
    setActiveDragCandidate(c)
    // Capture the exact card width so the overlay matches the original card
    const rect = e.active.rect.current.initial
    if (rect) setDragCardWidth(Math.round(rect.width))
  }
  const handleDragEnd = (e: DragEndEvent) => {
    const candidate = activeDragCandidate
    setActiveDragCandidate(null)
    const { over } = e
    if (!over || !candidate) return
    const overId = String(over.id)
    if (!overId.startsWith('stage:')) return
    const targetStage = overId.slice('stage:'.length) as ApplicationStage
    if (candidate.stage === targetStage) return
    if (targetStage === 'rejected') {
      toast.warning('Open profile to reject', 'Rejection requires a reason. Open the candidate profile and use the Reject button.')
      return
    }
    moveCandidate(candidate, targetStage)
  }

  const openJobs = jobs.filter((j) => j.status === 'open').length
  const inInterview = interviewData?.pages[0]?.total ?? 0
  const inOffer = (offerData?.pages[0]?.total ?? 0) + (preBoardingData?.pages[0]?.total ?? 0)

  return (
    <PageWrapper>
      <PageHeader
        title={t('recruitment.title')}
        description={t('recruitment.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={jobsFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => { void refetchJobs(); qc.invalidateQueries({ queryKey: ['applications-kanban'] }) }} disabled={jobsFetching}>
              Refresh
            </Button>
            <ExportDropdown
              onExportCsv={() => exportRecruitment({ format: 'csv' })}
              onExportPdf={() => exportRecruitment({ format: 'pdf' })}
            />
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCardCompact label="Open Positions" value={openJobs} icon={Briefcase} color="blue" />
        <KpiCardCompact label="Total Applicants" value={appsTotalData?.total ?? 0} icon={Users} color="cyan" />
        <KpiCardCompact label="In Interview" value={inInterview} icon={Clock} color="amber" />
        <KpiCardCompact label="Offer Stage" value={inOffer} icon={TrendingUp} color="green" />
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
        <>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <AdvancedSearchBar
                search={candidateSearch}
                filters={CANDIDATE_FILTERS}
                placeholder="Search candidates by name or email…"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 shrink-0 mt-0.5">
              <button
                type="button"
                title="Kanban view"
                onClick={() => setPipelineView('kanban')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  pipelineView === 'kanban'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="List view"
                onClick={() => setPipelineView('list')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  pipelineView === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>

          {pipelineView === 'kanban' && (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} autoScroll={false}>
              <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex gap-3 min-w-max">
                  {stages.map(stage => (
                    <StageColumn
                      key={stage.id}
                      stage={stage}
                      onMove={moveCandidate}
                      onConvert={setConvertCandidate}
                      onEdit={setEditCandidate}
                      showAdd={stage.id === 'received'}
                      onAdd={() => setAddCandidateOpen(true)}
                      addDisabled={jobs.filter((j) => j.status === 'open').length === 0}
                      kanbanParams={candidateParams}
                    />
                  ))}
                </div>
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDragCandidate && (
                  <div style={{ width: dragCardWidth }}>
                    <CandidateCard candidate={activeDragCandidate} onMove={moveCandidate} isDragOverlay />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {pipelineView === 'list' && (
            <div className="space-y-3">
              {allListCandidates.length > 0 && (() => {
                const stageCounts = allListCandidates.reduce<Record<string, number>>((acc, c) => {
                  acc[c.stage] = (acc[c.stage] ?? 0) + 1
                  return acc
                }, {})
                return (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setListStageFilter('all')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                        listStageFilter === 'all'
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                      )}
                    >
                      All · {allListCandidates.length}
                    </button>
                    {stages.map(s => {
                      const count = stageCounts[s.id] ?? 0
                      if (count === 0) return null
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setListStageFilter(listStageFilter === s.id ? 'all' : s.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                            listStageFilter === s.id
                              ? s.bgClass
                              : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', s.dotClass)} />
                          {s.label} · {count}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              <Card>
                <CardContent className="p-0">
                  {listAppsLoading ? (
                    <div className="px-4 py-4 space-y-2">
                      {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}
                    </div>
                  ) : filteredListCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <AlertCircle className="h-8 w-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm font-semibold">
                        {allListCandidates.length === 0 ? 'No candidates yet' : 'No candidates in this stage'}
                      </p>
                      {listStageFilter !== 'all' && (
                        <button type="button" onClick={() => setListStageFilter('all')} className="text-xs text-primary mt-2 hover:underline">
                          Show all
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 hidden sm:flex items-center gap-3 px-4 py-2 border-b bg-card/95 backdrop-blur-sm">
                        <div className="flex-1 min-w-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Candidate</div>
                        <div className="flex items-center gap-3 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <span className="w-[90px]">Stage</span>
                          <span className="w-10 text-center">Score</span>
                          <span className="w-20 text-right">Salary</span>
                          <span className="w-[70px] text-right">Applied</span>
                        </div>
                        <div className="w-8 shrink-0" />
                      </div>
                      <div className="divide-y divide-border/40">
                        {filteredListCandidates.slice(0, listVisibleCount).map(c => (
                          <CandidateListRow
                            key={c.id}
                            candidate={c}
                            onView={id => navigate(`/recruitment/candidates/${id}`)}
                            onEdit={setEditCandidate}
                          />
                        ))}
                      </div>
                      {filteredListCandidates.length > listVisibleCount && (
                        <div ref={listSentinelRef} className="py-3 flex justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {activeTab === 'jobs' && (
        <Card className="p-4 sm:p-5">
          <DataTable
            columns={jobColumns}
            data={filteredJobs}
            onRowClick={(j) => navigate(`/recruitment/jobs/${j.id}`)}
            advancedFilter={{
              search: jobSearch,
              filters: JOB_FILTERS,
              placeholder: 'Search jobs…',
            }}
            pageSize={PAGE_SIZE}
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
            serverPagination={{ total: jobsTotal, offset: jobsOffset, limit: PAGE_SIZE, onPageChange: setJobsOffset, loading: jobsFetching }}
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
        key={convertCandidate?.id ?? 'none'}
        candidate={convertCandidate}
        onOpenChange={(o) => !o && setConvertCandidate(null)}
        onConverted={(empId) => {
          setConvertCandidate(null)
          if (empId) navigate(`/employees/${empId}`)
        }}
      />
      <EditCandidateDialog
        candidate={editCandidate}
        open={!!editCandidate}
        onOpenChange={(o) => !o && setEditCandidate(null)}
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
