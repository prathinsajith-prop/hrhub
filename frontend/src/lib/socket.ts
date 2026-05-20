/**
 * Singleton WebSocket client for HRHub real-time events.
 *
 * Features:
 *  - JWT auth via query param (browsers cannot set custom headers on WS upgrades)
 *  - Same-token guard - calling connect() with the same token when already
 *    connected is a no-op; a new token triggers a clean reconnect
 *  - Exponential back-off reconnect: 1 s → 2 s → 4 s … capped at 30 s
 *  - Application-level ping every 25 s; expects a JSON { type: 'pong' } reply
 *    within 5 s, otherwise closes the socket and triggers reconnect
 *  - Page-visibility reconnect: immediately reconnects when a background tab
 *    regains focus after the connection may have been silently dropped
 *  - Stale-handler isolation: each WebSocket instance is tagged with an id;
 *    onopen / onmessage / onclose only act if they belong to the current socket
 *  - Connection state observable via onStateChange / offStateChange
 *
 * Public API:
 *   socket.connect(accessToken)        - call after login / token refresh
 *   socket.disconnect()                - call after logout
 *   socket.on('notification:new', fn)  - subscribe to a server event
 *   socket.off('notification:new', fn) - unsubscribe
 *   socket.state                       - 'connecting' | 'connected' | 'disconnected'
 *   socket.onStateChange(fn)           - watch connection state
 *   socket.offStateChange(fn)          - stop watching
 */

export type SocketState = 'connecting' | 'connected' | 'disconnected'
type EventHandler = (payload: Record<string, unknown>) => void
type StateHandler = (state: SocketState) => void

const PING_INTERVAL_MS = 25_000
const PONG_TIMEOUT_MS = 5_000
const MAX_BACKOFF_MS = 30_000

class HRHubSocket {
    /** Stable per-tab/page-load ID. Sent as X-Socket-Id on API requests so the
     *  server can echo it in WS broadcasts, letting this tab skip its own events. */
    readonly socketId: string = crypto.randomUUID()

    private ws: WebSocket | null = null
    private wsId = 0          // increments on every open() call; used to detect stale handlers
    private token: string | null = null
    private _state: SocketState = 'disconnected'
    private eventListeners = new Map<string, Set<EventHandler>>()
    private stateListeners = new Set<StateHandler>()
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private pingTimer: ReturnType<typeof setInterval> | null = null
    private pongTimer: ReturnType<typeof setTimeout> | null = null
    private backoff = 1000
    private intentionalClose = false

    constructor() {
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (
                    document.visibilityState === 'visible' &&
                    this._state === 'disconnected' &&
                    this.token &&
                    !this.intentionalClose
                ) {
                    this.backoff = 1000          // reset on manual tab focus
                    this.clearReconnectTimer()
                    this.open()
                }
            })
        }
    }

    get state(): SocketState {
        return this._state
    }

    on(event: string, handler: EventHandler): void {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set())
        this.eventListeners.get(event)!.add(handler)
    }

    off(event: string, handler: EventHandler): void {
        this.eventListeners.get(event)?.delete(handler)
    }

    onStateChange(handler: StateHandler): void {
        this.stateListeners.add(handler)
    }

    offStateChange(handler: StateHandler): void {
        this.stateListeners.delete(handler)
    }

    connect(token: string): void {
        // No-op if already connected with the same token
        if (this.token === token && this._state === 'connected') return

        this.token = token
        this.intentionalClose = false
        this.backoff = 1000
        this.clearReconnectTimer()

        // Cleanly replace an existing socket without triggering its reconnect logic
        this.detachAndClose()
        this.open()
    }

    disconnect(): void {
        this.intentionalClose = true
        this.token = null
        this.clearReconnectTimer()
        this.detachAndClose()
        this.setState('disconnected')
    }

    private open(): void {
        if (!this.token || this.intentionalClose) return

        const apiBase = (import.meta.env.VITE_API_URL as string) || ''
        const wsBase = apiBase
            ? apiBase.replace(/^http/, 'ws')
            : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

        const url = `${wsBase}/api/v1/ws?token=${encodeURIComponent(this.token)}`

        this.setState('connecting')

        // Tag this socket instance so stale event handlers from a previous socket
        // can recognise they no longer belong to the current connection.
        const id = ++this.wsId
        let ws: WebSocket
        try {
            ws = new WebSocket(url)
        } catch {
            this.setState('disconnected')
            this.scheduleReconnect()
            return
        }

        this.ws = ws

        ws.onopen = () => {
            if (this.wsId !== id) return   // stale - a newer socket won the race
            this.setState('connected')
            this.backoff = 1000
            this.startHeartbeat(id)
        }

        ws.onmessage = (evt) => {
            if (this.wsId !== id) return
            let msg: { type: string; payload?: Record<string, unknown> }
            try {
                msg = JSON.parse(evt.data as string)
            } catch {
                return
            }

            if (msg.type === 'pong') {
                this.clearPongTimer()
                return
            }

            const handlers = this.eventListeners.get(msg.type)
            if (handlers) for (const h of handlers) h(msg.payload ?? {})
        }

        ws.onclose = (evt) => {
            if (this.wsId !== id) return   // already replaced - ignore
            this.ws = null
            this.stopHeartbeat()

            // Auth errors: do not reconnect
            if (evt.code === 4001 || evt.code === 4003) {
                this.setState('disconnected')
                return
            }

            if (!this.intentionalClose) {
                this.setState('disconnected')
                this.scheduleReconnect()
            }
        }

        ws.onerror = () => {
            // onclose always fires after onerror; reconnect logic lives there
        }
    }

    /** Close the current socket without triggering its reconnect handlers. */
    private detachAndClose(): void {
        this.stopHeartbeat()
        if (this.ws) {
            const old = this.ws
            this.ws = null
            // Bump wsId so any pending onopen/onmessage/onclose for the old socket is ignored
            this.wsId++
            try { old.close() } catch { /* ignore */ }
        }
    }

    private startHeartbeat(id: number): void {
        this.stopHeartbeat()
        this.pingTimer = setInterval(() => {
            if (this.wsId !== id || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
            try {
                this.ws.send(JSON.stringify({ type: 'ping' }))
            } catch {
                return
            }
            this.pongTimer = setTimeout(() => {
                if (this.wsId !== id) return
                // Pong not received - connection is dead
                this.detachAndClose()
                if (!this.intentionalClose) {
                    this.setState('disconnected')
                    this.scheduleReconnect()
                }
            }, PONG_TIMEOUT_MS)
        }, PING_INTERVAL_MS)
    }

    private stopHeartbeat(): void {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        this.clearPongTimer()
    }

    private clearPongTimer(): void {
        if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null }
    }

    private scheduleReconnect(): void {
        if (this.intentionalClose || !this.token) return
        this.clearReconnectTimer()
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.open()
        }, this.backoff)
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    }

    private setState(next: SocketState): void {
        if (this._state === next) return
        this._state = next
        for (const h of this.stateListeners) h(next)
    }
}

export const socket = new HRHubSocket()
