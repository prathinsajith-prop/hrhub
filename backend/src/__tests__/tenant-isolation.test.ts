import { describe, it, expect } from 'vitest'
import { runWithTenant, getCurrentTenant, requireTenant } from '../lib/tenantContext.js'

const TENANT_A = '11111111-0000-0000-0000-000000000001'
const TENANT_B = '22222222-0000-0000-0000-000000000002'

describe('tenantContext', () => {
    it('returns undefined outside any tenant context', () => {
        expect(getCurrentTenant()).toBeUndefined()
    })

    it('requireTenant throws outside context', () => {
        expect(() => requireTenant()).toThrow('No tenant context active')
    })

    it('sets and reads tenant ID inside runWithTenant', async () => {
        const result = await runWithTenant(TENANT_A, async () => getCurrentTenant())
        expect(result).toBe(TENANT_A)
    })

    it('requireTenant returns ID inside context', async () => {
        await runWithTenant(TENANT_A, async () => {
            expect(requireTenant()).toBe(TENANT_A)
        })
    })

    it('context is removed after runWithTenant resolves', async () => {
        await runWithTenant(TENANT_A, async () => undefined)
        expect(getCurrentTenant()).toBeUndefined()
    })

    it('concurrent contexts are isolated — tenant A cannot see tenant B data', async () => {
        const results = await Promise.all([
            runWithTenant(TENANT_A, async () => {
                await new Promise(r => setTimeout(r, 5))
                return getCurrentTenant()
            }),
            runWithTenant(TENANT_B, async () => {
                await new Promise(r => setTimeout(r, 2))
                return getCurrentTenant()
            }),
        ])
        expect(results[0]).toBe(TENANT_A)
        expect(results[1]).toBe(TENANT_B)
    })

    it('nested contexts restore parent on exit', async () => {
        await runWithTenant(TENANT_A, async () => {
            expect(getCurrentTenant()).toBe(TENANT_A)
            await runWithTenant(TENANT_B, async () => {
                expect(getCurrentTenant()).toBe(TENANT_B)
            })
            expect(getCurrentTenant()).toBe(TENANT_A)
        })
    })

    it('context does not leak outside the runWithTenant scope', async () => {
        await runWithTenant(TENANT_A, async () => {
            await new Promise(r => setTimeout(r, 1))
        })

        // After the context block resolves, no tenant should be set
        await new Promise(r => setTimeout(r, 5))
        expect(getCurrentTenant()).toBeUndefined()
    })
})
