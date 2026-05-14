/**
 * Shared recruitment-stages module.
 *
 * - `STAGE_PALETTE`: the colour swatches admins can pick from in Organization
 *   Settings → Recruitment Stages. The DB stores a `colorKey` (string); this
 *   table resolves it to a pair of Tailwind classes. The classes are written
 *   verbatim here (not built dynamically) so Tailwind's content scanner picks
 *   them up at build time.
 * - `STAGE_PALETTE_KEYS`: ordered list for rendering the picker.
 * - `DEFAULT_STAGES`: fallback list used while the API request is in-flight,
 *   so the kanban renders with sensible labels/colours on first paint instead
 *   of flashing empty columns. Mirrors `DEFAULT_RECRUITMENT_STAGES` on the
 *   backend (`backend/src/modules/recruitment/recruitment.defaults.ts`).
 * - `resolveStageColor`: returns the (bg, dot) class pair for any colorKey,
 *   falling back to slate if the key is unknown.
 *
 * Keep this file in sync with the backend defaults file when stage keys or
 * colour names change.
 */

import type { ApplicationStage } from '@/types'

export interface RecruitmentStage {
    id: string
    tenantId: string
    stageKey: ApplicationStage
    label: string
    colorKey: string
    stageOrder: number
    isTerminal: boolean
    /** True for the tenant's designated entry stage. Exactly one per tenant. */
    isFirst: boolean
    /** True for the tenant's designated final stage. Exactly one per tenant. */
    isFinal: boolean
    /** Admins can hide any stage from the kanban while keeping it valid in the data. */
    showInKanban: boolean
    createdAt: string
    updatedAt: string
}

export interface StageColor {
    /** Column / chip background (with border). */
    bgClass: string
    /** Filled badge style — heavier than bgClass, used for active pills. */
    badgeClass: string
    /** Solid dot for stage markers. */
    dotClass: string
    /** Coloured text (timeline labels). */
    textClass: string
    /** Connector / progress line. */
    lineClass: string
    /** Solid swatch shown in the colour picker. */
    swatchClass: string
}

export const STAGE_PALETTE: Record<string, StageColor & { label: string }> = {
    slate:   { label: 'Slate',   bgClass: 'bg-muted/50 border-border',                 badgeClass: 'bg-slate-100 text-slate-600 border-slate-300',                dotClass: 'bg-slate-400',    textClass: 'text-slate-600',    lineClass: 'bg-slate-200',     swatchClass: 'bg-slate-400' },
    stone:   { label: 'Stone',   bgClass: 'bg-stone-500/5 border-stone-500/20',        badgeClass: 'bg-stone-100 text-stone-700 border-stone-300',                dotClass: 'bg-stone-500',    textClass: 'text-stone-700',    lineClass: 'bg-stone-200',     swatchClass: 'bg-stone-500' },
    blue:    { label: 'Blue',    bgClass: 'bg-info/5 border-info/20',                  badgeClass: 'bg-info/10 text-info border-info/20',                         dotClass: 'bg-info',         textClass: 'text-info',         lineClass: 'bg-info/30',       swatchClass: 'bg-info' },
    sky:     { label: 'Sky',     bgClass: 'bg-sky-500/5 border-sky-500/20',            badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',                       dotClass: 'bg-sky-500',      textClass: 'text-sky-600',      lineClass: 'bg-sky-200',       swatchClass: 'bg-sky-500' },
    cyan:    { label: 'Cyan',    bgClass: 'bg-cyan-500/5 border-cyan-500/20',          badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',                    dotClass: 'bg-cyan-500',     textClass: 'text-cyan-600',     lineClass: 'bg-cyan-200',      swatchClass: 'bg-cyan-500' },
    teal:    { label: 'Teal',    bgClass: 'bg-teal-500/5 border-teal-500/20',          badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',                    dotClass: 'bg-teal-500',     textClass: 'text-teal-600',     lineClass: 'bg-teal-200',      swatchClass: 'bg-teal-500' },
    primary: { label: 'Brand',   bgClass: 'bg-primary/5 border-primary/20',            badgeClass: 'bg-primary/10 text-primary border-primary/20',                dotClass: 'bg-primary',      textClass: 'text-primary',      lineClass: 'bg-primary/30',    swatchClass: 'bg-primary' },
    indigo:  { label: 'Indigo',  bgClass: 'bg-indigo-500/5 border-indigo-500/20',      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',              dotClass: 'bg-indigo-500',   textClass: 'text-indigo-600',   lineClass: 'bg-indigo-200',    swatchClass: 'bg-indigo-500' },
    violet:  { label: 'Violet',  bgClass: 'bg-violet-500/5 border-violet-500/20',      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',              dotClass: 'bg-violet-500',   textClass: 'text-violet-600',   lineClass: 'bg-violet-200',    swatchClass: 'bg-violet-500' },
    purple:  { label: 'Purple',  bgClass: 'bg-purple-500/5 border-purple-500/20',      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',              dotClass: 'bg-purple-500',   textClass: 'text-purple-600',   lineClass: 'bg-purple-200',    swatchClass: 'bg-purple-500' },
    fuchsia: { label: 'Fuchsia', bgClass: 'bg-fuchsia-500/5 border-fuchsia-500/20',    badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',           dotClass: 'bg-fuchsia-500',  textClass: 'text-fuchsia-600',  lineClass: 'bg-fuchsia-200',   swatchClass: 'bg-fuchsia-500' },
    pink:    { label: 'Pink',    bgClass: 'bg-pink-500/5 border-pink-500/20',          badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',                    dotClass: 'bg-pink-500',     textClass: 'text-pink-600',     lineClass: 'bg-pink-200',      swatchClass: 'bg-pink-500' },
    rose:    { label: 'Rose',    bgClass: 'bg-rose-500/5 border-rose-500/20',          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',                    dotClass: 'bg-rose-500',     textClass: 'text-rose-600',     lineClass: 'bg-rose-200',      swatchClass: 'bg-rose-500' },
    red:     { label: 'Red',     bgClass: 'bg-destructive/5 border-destructive/20',    badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',    dotClass: 'bg-destructive',  textClass: 'text-destructive',  lineClass: 'bg-destructive/30',swatchClass: 'bg-destructive' },
    orange:  { label: 'Orange',  bgClass: 'bg-orange-500/5 border-orange-500/20',      badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',              dotClass: 'bg-orange-500',   textClass: 'text-orange-600',   lineClass: 'bg-orange-200',    swatchClass: 'bg-orange-500' },
    amber:   { label: 'Amber',   bgClass: 'bg-warning/5 border-warning/20',            badgeClass: 'bg-warning/10 text-warning border-warning/20',                dotClass: 'bg-warning',      textClass: 'text-warning',      lineClass: 'bg-warning/30',    swatchClass: 'bg-warning' },
    yellow:  { label: 'Yellow',  bgClass: 'bg-yellow-500/5 border-yellow-500/20',      badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',              dotClass: 'bg-yellow-500',   textClass: 'text-yellow-700',   lineClass: 'bg-yellow-200',    swatchClass: 'bg-yellow-500' },
    lime:    { label: 'Lime',    bgClass: 'bg-lime-500/5 border-lime-500/20',          badgeClass: 'bg-lime-50 text-lime-700 border-lime-200',                    dotClass: 'bg-lime-500',     textClass: 'text-lime-600',     lineClass: 'bg-lime-200',      swatchClass: 'bg-lime-500' },
    green:   { label: 'Green',   bgClass: 'bg-success/5 border-success/20',            badgeClass: 'bg-success/10 text-success border-success/20',                dotClass: 'bg-success',      textClass: 'text-success',      lineClass: 'bg-success/30',    swatchClass: 'bg-success' },
    emerald: { label: 'Emerald', bgClass: 'bg-accent/50 border-accent',                badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',           dotClass: 'bg-emerald-500',  textClass: 'text-emerald-600',  lineClass: 'bg-emerald-200',   swatchClass: 'bg-emerald-500' },
}

export const STAGE_PALETTE_KEYS = Object.keys(STAGE_PALETTE)

export function resolveStageColor(colorKey: string | undefined): StageColor {
    return STAGE_PALETTE[colorKey ?? ''] ?? STAGE_PALETTE.slate
}

// Used as the optimistic fallback while the API is loading. Always kept in
// sync with DEFAULT_RECRUITMENT_STAGES on the backend.
export const DEFAULT_STAGES: ReadonlyArray<Pick<RecruitmentStage, 'stageKey' | 'label' | 'colorKey' | 'stageOrder' | 'isTerminal' | 'isFirst' | 'isFinal' | 'showInKanban'>> = [
    { stageOrder: 1, stageKey: 'received',     label: 'Received',     colorKey: 'slate',   isTerminal: false, isFirst: true,  isFinal: false, showInKanban: true  },
    { stageOrder: 2, stageKey: 'screening',    label: 'Screening',    colorKey: 'blue',    isTerminal: false, isFirst: false, isFinal: false, showInKanban: true  },
    { stageOrder: 3, stageKey: 'interview',    label: 'Interview',    colorKey: 'amber',   isTerminal: false, isFirst: false, isFinal: false, showInKanban: true  },
    { stageOrder: 4, stageKey: 'assessment',   label: 'Assessment',   colorKey: 'primary', isTerminal: false, isFirst: false, isFinal: false, showInKanban: true  },
    { stageOrder: 5, stageKey: 'offer',        label: 'Offer',        colorKey: 'green',   isTerminal: false, isFirst: false, isFinal: false, showInKanban: true  },
    { stageOrder: 6, stageKey: 'pre_boarding', label: 'Pre-boarding', colorKey: 'emerald', isTerminal: false, isFirst: false, isFinal: false, showInKanban: true  },
    { stageOrder: 7, stageKey: 'rejected',     label: 'Rejected',     colorKey: 'red',     isTerminal: true,  isFirst: false, isFinal: true,  showInKanban: false },
]

/** Stages rendered on the kanban board. Admin-controlled per stage. */
export function kanbanStages<T extends { showInKanban: boolean }>(stages: ReadonlyArray<T>): T[] {
    return stages.filter(s => s.showInKanban)
}

/** Find a stage by its key. Returns undefined if not present. */
export function stageByKey<T extends { stageKey: string }>(stages: ReadonlyArray<T>, key: string): T | undefined {
    return stages.find(s => s.stageKey === key)
}

/** Next stage in the configured order, skipping stages hidden from the kanban. */
export function nextStage<T extends { stageKey: string; stageOrder: number; showInKanban: boolean }>(
    stages: ReadonlyArray<T>,
    currentKey: string,
): T | undefined {
    const linear = kanbanStages(stages)
    const idx = linear.findIndex(s => s.stageKey === currentKey)
    if (idx < 0) return undefined
    return linear[idx + 1]
}
