/**
 * In-process WebSocket connection registry.
 *
 * Maps userId → Set<WsSocket> and tenantId → Set<userId> for O(1) lookup in
 * both directions. All state is module-level so it's shared across the process.
 *
 * No Redis pub/sub — single-process Railway deployment is fine at current scale.
 * Horizontal scaling would require replacing broadcastTo* with Redis pub/sub.
 */

export interface WsEvent {
    type: string
    payload: Record<string, unknown>
}

// Minimal interface — we only need send + readyState from the underlying socket
export interface WsSocket {
    send: (data: string) => void
    readyState: number
}

const WS_OPEN = 1

const userSockets = new Map<string, Set<WsSocket>>()
const tenantUsers = new Map<string, Set<string>>()

export function registerConnection(userId: string, tenantId: string, socket: WsSocket): void {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set())
    userSockets.get(userId)!.add(socket)

    if (!tenantUsers.has(tenantId)) tenantUsers.set(tenantId, new Set())
    tenantUsers.get(tenantId)!.add(userId)
}

export function removeConnection(userId: string, tenantId: string, socket: WsSocket): void {
    const sockets = userSockets.get(userId)
    if (!sockets) return

    sockets.delete(socket)

    if (sockets.size === 0) {
        userSockets.delete(userId)
        const tenantSet = tenantUsers.get(tenantId)
        if (tenantSet) {
            tenantSet.delete(userId)
            if (tenantSet.size === 0) tenantUsers.delete(tenantId)
        }
    }
}

function sendToSocket(userId: string, tenantId: string, socket: WsSocket, event: WsEvent): void {
    if (socket.readyState !== WS_OPEN) {
        // Proactively evict dead sockets discovered during broadcast
        removeConnection(userId, tenantId, socket)
        return
    }
    try {
        socket.send(JSON.stringify(event))
    } catch {
        removeConnection(userId, tenantId, socket)
    }
}

export function broadcastToUser(userId: string, tenantId: string, event: WsEvent): void {
    const sockets = userSockets.get(userId)
    if (!sockets || sockets.size === 0) return
    // Snapshot the Set before iterating — sendToSocket may mutate it via removeConnection
    for (const s of [...sockets]) sendToSocket(userId, tenantId, s, event)
}

export function broadcastToTenant(tenantId: string, event: WsEvent): void {
    const userIds = tenantUsers.get(tenantId)
    if (!userIds || userIds.size === 0) return
    for (const uid of [...userIds]) broadcastToUser(uid, tenantId, event)
}

export function getConnectionStats(): { connectedUsers: number; connectedTenants: number; totalSockets: number } {
    let totalSockets = 0
    for (const sockets of userSockets.values()) totalSockets += sockets.size
    return {
        connectedUsers: userSockets.size,
        connectedTenants: tenantUsers.size,
        totalSockets,
    }
}
