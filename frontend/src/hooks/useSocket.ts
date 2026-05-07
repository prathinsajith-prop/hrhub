import { useCallback, useEffect, useState } from 'react'
import { socket, type SocketState } from '@/lib/socket'

type Handler = (payload: Record<string, unknown>) => void

/**
 * Subscribe to a socket event for the lifetime of the component.
 * `handler` must be stable (wrap in useCallback if defined inline).
 */
export function useSocketEvent(event: string, handler: Handler): void {
    useEffect(() => {
        socket.on(event, handler)
        return () => socket.off(event, handler)
    }, [event, handler])
}

/**
 * Returns the current WebSocket connection state.
 * Re-renders the component whenever the state changes.
 */
export function useSocketState(): SocketState {
    const [state, setState] = useState<SocketState>(socket.state)

    const onStateChange = useCallback((next: SocketState) => setState(next), [])

    useEffect(() => {
        socket.onStateChange(onStateChange)
        return () => socket.offStateChange(onStateChange)
    }, [onStateChange])

    return state
}
