import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<string>()

/** Run fn with tenantId in async-local context. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
    return store.run(tenantId, fn)
}

/** Returns the tenant from async-local context, or undefined if not set. */
export function getCurrentTenant(): string | undefined {
    return store.getStore()
}

/** Returns the tenant or throws if not in a tenant context. */
export function requireTenant(): string {
    const id = store.getStore()
    if (!id) throw new Error('No tenant context active')
    return id
}
