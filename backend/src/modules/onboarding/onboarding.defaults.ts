/**
 * Default onboarding steps seeded for each new tenant.
 *
 * Tenants can edit / reorder / extend these via the Onboarding Template tab
 * in Organization Settings. The seed is for first-day usability only — it is
 * not consulted again once the tenant has its own rows.
 */
export const DEFAULT_ONBOARDING_TEMPLATE = [
    { stepOrder: 1, title: 'HR documentation & contracts',           owner: 'HR',      slaDays: 1  },
    { stepOrder: 2, title: 'IT equipment setup & laptop handover',   owner: 'IT',      slaDays: 1  },
    { stepOrder: 3, title: 'System access & account creation',       owner: 'IT',      slaDays: 2  },
    { stepOrder: 4, title: 'Access card & office orientation',       owner: 'Admin',   slaDays: 2  },
    { stepOrder: 5, title: 'Introduction to team & manager',         owner: 'Manager', slaDays: 3  },
    { stepOrder: 6, title: 'Employee handbook & policy review',      owner: 'HR',      slaDays: 5  },
    { stepOrder: 7, title: 'Benefits enrollment & payroll setup',    owner: 'HR',      slaDays: 7  },
    { stepOrder: 8, title: 'Compliance & safety training',           owner: 'HR',      slaDays: 10 },
    { stepOrder: 9, title: '30-day check-in with manager',           owner: 'Manager', slaDays: 30 },
] as const

/**
 * Builds the seed-row payload for `onboardingTemplateSteps` from the default
 * template. Used by tenant creation (auth.signupTenant, tenants.createTenant)
 * and lazy seed / reset in onboarding.service.
 */
export function buildDefaultOnboardingTemplateRows(tenantId: string) {
    return DEFAULT_ONBOARDING_TEMPLATE.map(s => ({
        tenantId,
        stepOrder: s.stepOrder,
        title: s.title,
        owner: s.owner,
        slaDays: s.slaDays,
    }))
}
