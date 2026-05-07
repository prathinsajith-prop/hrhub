/**
 * useRecruitmentSocket
 *
 * Subscribes to all recruitment WebSocket events for the current tenant and
 * invalidates the affected TanStack Query caches so every connected HR manager
 * sees changes immediately.
 *
 * Events handled:
 *   recruitment:stage-changed    — card moved between columns
 *   recruitment:candidate-added  — new candidate appears in Received column
 *   recruitment:candidate-removed — candidate deleted / converted to employee
 *   recruitment:candidate-updated — candidate profile (notes, score…) edited
 *   recruitment:job-changed      — job created / updated / deleted
 *
 * The actorSocketId in every payload is compared with this tab's socket.socketId.
 * Same-tab actions are skipped — the local optimistic update already handled them.
 * This correctly handles same-user-multiple-tabs scenarios (userId-based guards
 * would block all tabs for the same user account).
 *
 * NOTE: Cache keys for kanban columns are 5-element:
 *   ['applications-kanban', stageId, q, filter, jobId]
 * We use invalidateQueries with a 2-element prefix key so all variants of a
 * stage's query (different q/filter params) are correctly invalidated.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '@/hooks/useSocket'
import { socket } from '@/lib/socket'

// ── Typed payloads ────────────────────────────────────────────────────────────

interface StageChangedPayload {
    applicationId: string
    fromStage: string
    toStage: string
    actorId: string
    actorSocketId?: string | null
}

interface CandidateAddedPayload {
    applicationId: string
    actorId: string
    actorSocketId?: string | null
}

interface CandidateRemovedPayload {
    applicationId: string
    stage: string
    actorId: string
    actorSocketId?: string | null
}

interface CandidateUpdatedPayload {
    applicationId: string
    stage: string
    actorId: string
    actorSocketId?: string | null
}

interface JobChangedPayload {
    jobId: string
    action: 'create' | 'update' | 'delete'
    actorId: string
    actorSocketId?: string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRecruitmentSocket() {
    const qc = useQueryClient()

    // Prefix key — invalidateQueries uses fuzzy/prefix matching so this correctly
    // invalidates ['applications-kanban', stage, q, filter, jobId] for all q/filter combos.
    const stageKey = (stage: string) => ['applications-kanban', stage] as const

    /** Returns true when this tab triggered the action (skip — already handled optimistically) */
    const isOwnAction = (actorSocketId?: string | null) =>
        actorSocketId != null && actorSocketId === socket.socketId

    // ── recruitment:stage-changed ─────────────────────────────────────────────
    const onStageChanged = useCallback((raw: Record<string, unknown>) => {
        const { fromStage, toStage, actorSocketId } = raw as unknown as StageChangedPayload
        if (isOwnAction(actorSocketId)) return
        qc.invalidateQueries({ queryKey: stageKey(fromStage) })
        qc.invalidateQueries({ queryKey: stageKey(toStage) })
    }, [qc])

    // ── recruitment:candidate-added ───────────────────────────────────────────
    const onCandidateAdded = useCallback((raw: Record<string, unknown>) => {
        const { actorSocketId } = raw as unknown as CandidateAddedPayload
        if (isOwnAction(actorSocketId)) return
        qc.invalidateQueries({ queryKey: stageKey('received') })
    }, [qc])

    // ── recruitment:candidate-removed ─────────────────────────────────────────
    const onCandidateRemoved = useCallback((raw: Record<string, unknown>) => {
        const { stage, actorSocketId } = raw as unknown as CandidateRemovedPayload
        if (isOwnAction(actorSocketId)) return
        qc.invalidateQueries({ queryKey: stageKey(stage) })
    }, [qc])

    // ── recruitment:candidate-updated ─────────────────────────────────────────
    const onCandidateUpdated = useCallback((raw: Record<string, unknown>) => {
        const { applicationId, stage, actorSocketId } = raw as unknown as CandidateUpdatedPayload
        if (isOwnAction(actorSocketId)) return
        qc.invalidateQueries({ queryKey: stageKey(stage) })
        qc.invalidateQueries({ queryKey: ['application', applicationId] })
    }, [qc])

    // ── recruitment:job-changed ───────────────────────────────────────────────
    const onJobChanged = useCallback((raw: Record<string, unknown>) => {
        const { actorSocketId } = raw as unknown as JobChangedPayload
        if (isOwnAction(actorSocketId)) return
        qc.invalidateQueries({ queryKey: ['jobs'] })
    }, [qc])

    useSocketEvent('recruitment:stage-changed', onStageChanged)
    useSocketEvent('recruitment:candidate-added', onCandidateAdded)
    useSocketEvent('recruitment:candidate-removed', onCandidateRemoved)
    useSocketEvent('recruitment:candidate-updated', onCandidateUpdated)
    useSocketEvent('recruitment:job-changed', onJobChanged)
}
