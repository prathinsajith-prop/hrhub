import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput, EventClickArg, EventContentArg } from '@fullcalendar/core'
import {
    CalendarDays, Plane, FileText, CalendarCheck2, Star,
    ChevronLeft, ChevronRight, Filter,
} from 'lucide-react'

import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useVisas } from '@/hooks/useVisa'
import { useDocuments } from '@/hooks/useDocuments'
import { useLeaveRequests } from '@/hooks/useLeave'
import { usePerformanceReviews } from '@/hooks/usePerformance'

type EventKind = 'visa' | 'document' | 'leave' | 'review'

const KIND_META: Record<EventKind, {
    label: string
    icon: typeof Plane
    bg: string
    border: string
    text: string
}> = {
    visa: { label: 'Visa', icon: Plane, bg: '#ecfeff', border: '#06b6d4', text: '#155e75' },
    document: { label: 'Document', icon: FileText, bg: '#fffbeb', border: '#f59e0b', text: '#854d0e' },
    leave: { label: 'Leave', icon: CalendarCheck2, bg: '#ecfdf5', border: '#10b981', text: '#065f46' },
    review: { label: 'Review', icon: Star, bg: '#f5f3ff', border: '#8b5cf6', text: '#5b21b6' },
}

function safeISO(s: string | undefined | null): string | null {
    if (!s) return null
    const d = new Date(s)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
}

type ViewKey = 'dayGridMonth' | 'timeGridWeek' | 'listWeek'

export function CalendarPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const calRef = useRef<FullCalendar | null>(null)
    const [filter, setFilter] = useState<Record<EventKind, boolean>>({
        visa: true, document: true, leave: true, review: true,
    })
    const [currentTitle, setCurrentTitle] = useState<string>('')
    const [view, setView] = useState<ViewKey>('dayGridMonth')

    const visas = useVisas({ limit: 100 })
    const documents = useDocuments({ limit: 100 })
    const leaves = useLeaveRequests({ limit: 100 })
    const reviews = usePerformanceReviews()

    const isLoading = visas.isLoading || documents.isLoading || leaves.isLoading || reviews.isLoading

    const events = useMemo<EventInput[]>(() => {
        const out: EventInput[] = []

        if (filter.visa) {
            const rows = ((visas.data as any)?.data ?? []) as any[]
            for (const v of rows) {
                const date = safeISO(v.expiryDate)
                if (!date) continue
                const c = KIND_META.visa
                out.push({
                    id: `visa-${v.id}`,
                    title: `Visa expires \u2014 ${v.employeeName ?? 'Employee'}`,
                    start: date,
                    allDay: true,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    textColor: c.text,
                    extendedProps: { kind: 'visa' as EventKind, href: `/visa/${v.id}`, sub: v.employeeName },
                })
            }
        }

        if (filter.document) {
            const rows = ((documents.data as any)?.data ?? []) as any[]
            for (const d of rows) {
                const date = safeISO(d.expiryDate)
                if (!date) continue
                const c = KIND_META.document
                out.push({
                    id: `doc-${d.id}`,
                    title: `${d.docType ?? d.category ?? 'Document'} expires`,
                    start: date,
                    allDay: true,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    textColor: c.text,
                    extendedProps: { kind: 'document' as EventKind, href: '/documents', sub: d.employeeName },
                })
            }
        }

        if (filter.leave) {
            const rows = ((leaves.data as any)?.data ?? []) as any[]
            for (const l of rows) {
                const start = safeISO(l.startDate)
                const end = safeISO(l.endDate)
                if (!start) continue
                const c = KIND_META.leave
                let endExclusive: string | undefined
                if (end) {
                    const d = new Date(end + 'T00:00:00Z')
                    d.setUTCDate(d.getUTCDate() + 1)
                    endExclusive = d.toISOString().slice(0, 10)
                }
                out.push({
                    id: `leave-${l.id}`,
                    title: `${l.employeeName ?? 'Employee'} \u2014 ${l.leaveType ?? 'leave'}`,
                    start,
                    end: endExclusive,
                    allDay: true,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    textColor: c.text,
                    extendedProps: { kind: 'leave' as EventKind, href: '/leave', sub: l.employeeName },
                })
            }
        }

        if (filter.review) {
            const rows = (Array.isArray(reviews.data) ? reviews.data : []) as any[]
            for (const r of rows) {
                const date = safeISO(r.reviewDate)
                if (!date) continue
                const c = KIND_META.review
                out.push({
                    id: `review-${r.id}`,
                    title: `Review \u2014 ${r.period ?? ''}`,
                    start: date,
                    allDay: true,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    textColor: c.text,
                    extendedProps: { kind: 'review' as EventKind, href: '/performance', sub: r.period },
                })
            }
        }

        return out
    }, [visas.data, documents.data, leaves.data, reviews.data, filter])

    const handleEventClick = (arg: EventClickArg) => {
        const href = arg.event.extendedProps.href as string | undefined
        if (href) navigate(href)
    }

    const counts = useMemo(() => {
        const c = { visa: 0, document: 0, leave: 0, review: 0 } as Record<EventKind, number>
        for (const e of events) c[(e.extendedProps?.kind as EventKind) ?? 'visa']++
        return c
    }, [events])

    const upcomingThisWeek = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return events.filter((e) => {
            const d = new Date(e.start as string)
            return d >= today && d <= weekEnd
        }).length
    }, [events])

    const toggle = (k: EventKind) => setFilter((f) => ({ ...f, [k]: !f[k] }))

    const goPrev = () => calRef.current?.getApi().prev()
    const goNext = () => calRef.current?.getApi().next()
    const goToday = () => calRef.current?.getApi().today()
    const changeView = (v: ViewKey) => {
        setView(v)
        calRef.current?.getApi().changeView(v)
    }

    const renderEventContent = (arg: EventContentArg) => {
        const kind = (arg.event.extendedProps.kind as EventKind) ?? 'visa'
        const Icon = KIND_META[kind].icon
        return (
            <div className="flex items-center gap-1 px-1 py-0.5 overflow-hidden w-full">
                <Icon className="h-3 w-3 shrink-0" style={{ color: KIND_META[kind].border }} />
                <span className="truncate text-[11px] leading-tight">{arg.event.title}</span>
            </div>
        )
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('nav.calendar', { defaultValue: 'Calendar' })}
                description={t('calendar.description', {
                    defaultValue: 'Visas, documents, leave, and reviews \u2014 unified.',
                })}
                actions={
                    <Badge variant="outline" className="text-xs">
                        <CalendarDays className="h-3 w-3 mr-1" />
                        {events.length} events
                    </Badge>
                }
            />

            {/* KPI strip / kind filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(KIND_META) as EventKind[]).map((k) => {
                    const m = KIND_META[k]
                    const Icon = m.icon
                    const active = filter[k]
                    return (
                        <Card
                            key={k}
                            onClick={() => toggle(k)}
                            className={`cursor-pointer transition-all ${active ? 'opacity-100 ring-1 ring-border' : 'opacity-50 hover:opacity-80'} hover:shadow-sm`}
                        >
                            <CardContent className="p-3 flex items-center gap-3">
                                <div
                                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: m.bg, color: m.border }}
                                >
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">{m.label}</p>
                                    <p className="text-lg font-semibold leading-tight">{counts[k]}</p>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Custom toolbar */}
            <Card className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-sm" onClick={goPrev} aria-label="Previous">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={goToday} className="h-8 text-xs">
                            Today
                        </Button>
                        <Button variant="outline" size="icon-sm" onClick={goNext} aria-label="Next">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <h2 className="text-sm font-semibold ml-2 font-display">{currentTitle}</h2>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                            <Filter className="h-2.5 w-2.5 mr-1" />
                            {upcomingThisWeek} this week
                        </Badge>
                        <div className="inline-flex rounded-md border bg-secondary p-0.5">
                            {(['dayGridMonth', 'timeGridWeek', 'listWeek'] as ViewKey[]).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => changeView(v)}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded ${view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    {v === 'dayGridMonth' ? 'Month' : v === 'timeGridWeek' ? 'Week' : 'List'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="p-3 hrhub-fullcalendar">
                {isLoading ? (
                    <Skeleton className="h-[600px] w-full" />
                ) : (
                    <FullCalendar
                        ref={calRef}
                        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                        initialView="dayGridMonth"
                        headerToolbar={false}
                        height="auto"
                        events={events}
                        dayMaxEventRows={3}
                        eventClick={handleEventClick}
                        eventContent={renderEventContent}
                        nowIndicator
                        weekends
                        firstDay={1}
                        datesSet={(arg) => setCurrentTitle(arg.view.title)}
                        dateClick={(info) => {
                            calRef.current?.getApi().changeView('listWeek', info.dateStr)
                            setView('listWeek')
                        }}
                    />
                )}
            </Card>
        </PageWrapper>
    )
}
