/**
 * Seed database with realistic demo data.
 * Idempotent — safe to re-run (guards on tradeLicenseNo).
 * Run: npm run db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import {
    tenants, entities, users, employees,
    tenantMemberships,
    recruitmentJobs, jobApplications,
    visaApplications,
    onboardingChecklists, onboardingSteps,
    payrollRuns, leaveRequests, leavePolicies,
    notifications, publicHolidays,
} from './schema/index.js'

const TRADE_LICENSE = 'DED-2019-12345'

async function seed() {
    console.log('🌱 Seeding database...')

    // ── Idempotency guard ──────────────────────────────────────
    const existing = await db.select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.tradeLicenseNo, TRADE_LICENSE))
        .limit(1)

    if (existing.length > 0) {
        console.log('Database already seeded. Skipping.')
        process.exit(0)
    }

    // ── 1. Tenant ──────────────────────────────────────────────
    const [tenant] = await db.insert(tenants).values({
        name: 'Al Noor Real Estate LLC',
        tradeLicenseNo: TRADE_LICENSE,
        jurisdiction: 'mainland',
        industryType: 'real_estate',
        subscriptionPlan: 'growth',
        isActive: true,
    }).returning()
    console.log('✓ Tenant:', tenant.id)

    // ── 2. Entity ──────────────────────────────────────────────
    const [entity] = await db.insert(entities).values({
        tenantId: tenant.id,
        entityName: 'Al Noor Real Estate LLC — Dubai',
        licenseType: 'LLC',
        isActive: true,
    }).returning()

    // ── 3. Users (one per role) ────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin@12345', 12)

    const [superAdmin] = await db.insert(users).values({
        tenantId: tenant.id, entityId: entity.id,
        email: 'superadmin@hrhub.ae', passwordHash,
        name: 'Alex Thompson', role: 'super_admin', department: 'Executive',
    }).returning()

    const [hrManager] = await db.insert(users).values({
        tenantId: tenant.id, entityId: entity.id,
        email: 'admin@hrhub.ae', passwordHash,
        name: 'Sarah Johnson', role: 'hr_manager', department: 'HR',
    }).returning()

    const [proOfficer] = await db.insert(users).values({
        tenantId: tenant.id, entityId: entity.id,
        email: 'pro@hrhub.ae', passwordHash,
        name: 'Khalid Al Mansoori', role: 'pro_officer', department: 'PRO',
    }).returning()

    const [deptHead] = await db.insert(users).values({
        tenantId: tenant.id, entityId: entity.id,
        email: 'manager@hrhub.ae', passwordHash,
        name: 'James Williams', role: 'dept_head', department: 'Legal',
    }).returning()

    const [employeeUser] = await db.insert(users).values({
        tenantId: tenant.id, entityId: entity.id,
        email: 'employee@hrhub.ae', passwordHash,
        name: 'Ahmed Al Mansouri', role: 'employee', department: 'Sales',
    }).returning()

    console.log('✓ Users created (5 roles)')

    // ── 4. Tenant memberships (required for multi-tenant auth) ─
    await db.insert(tenantMemberships).values([
        { tenantId: tenant.id, userId: superAdmin.id, role: 'super_admin', inviteStatus: 'accepted', isActive: true, acceptedAt: new Date() },
        { tenantId: tenant.id, userId: hrManager.id, role: 'hr_manager', inviteStatus: 'accepted', isActive: true, acceptedAt: new Date() },
        { tenantId: tenant.id, userId: proOfficer.id, role: 'pro_officer', inviteStatus: 'accepted', isActive: true, acceptedAt: new Date() },
        { tenantId: tenant.id, userId: deptHead.id, role: 'dept_head', inviteStatus: 'accepted', isActive: true, acceptedAt: new Date() },
        { tenantId: tenant.id, userId: employeeUser.id, role: 'employee', inviteStatus: 'accepted', isActive: true, acceptedAt: new Date() },
    ])
    console.log('✓ Tenant memberships created')

    // ── 5. Employees ───────────────────────────────────────────
    const employeeData = [
        { firstName: 'Ahmed', lastName: 'Al Mansouri', email: 'ahmed.mansouri@company.ae', phone: '+971 50 123 4567', nationality: 'Emirati', passportNo: 'AE12345678', emiratesId: '784-1985-1234567-1', dateOfBirth: '1985-03-15', gender: 'male' as const, department: 'Sales', designation: 'Senior Property Consultant', joinDate: '2022-01-10', status: 'active' as const, basicSalary: '12000', totalSalary: '18000', housingAllowance: '4000', transportAllowance: '1500', bankName: 'Emirates NBD', visaStatus: 'active' as const, visaExpiry: '2026-01-10', passportExpiry: '2027-03-15', emiratisationCategory: 'emirati' as const },
        { firstName: 'Rahul', lastName: 'Sharma', email: 'rahul.s@company.ae', phone: '+971 52 345 6789', nationality: 'Indian', passportNo: 'IN11223344', dateOfBirth: '1988-11-05', gender: 'male' as const, department: 'Finance', designation: 'Senior Accountant', joinDate: '2020-03-15', status: 'active' as const, basicSalary: '10000', totalSalary: '15000', housingAllowance: '3000', transportAllowance: '1000', bankName: 'ADCB', visaStatus: 'active' as const, visaExpiry: '2026-03-15', passportExpiry: '2026-11-05', emiratisationCategory: 'expat' as const },
        { firstName: 'Maria', lastName: 'Santos', email: 'maria.s@company.ae', phone: '+971 56 456 7890', nationality: 'Filipino', passportNo: 'PH55667788', dateOfBirth: '1993-04-18', gender: 'female' as const, department: 'Admin', designation: 'Executive Assistant', joinDate: '2023-02-01', status: 'probation' as const, basicSalary: '6000', totalSalary: '9000', housingAllowance: '2000', transportAllowance: '800', bankName: 'FAB', visaStatus: 'active' as const, visaExpiry: '2026-02-01', passportExpiry: '2027-04-18', emiratisationCategory: 'expat' as const },
        { firstName: 'Mohammad', lastName: 'Al Rashidi', email: 'mo.rashidi@company.ae', phone: '+971 50 567 8901', nationality: 'Emirati', passportNo: 'AE99887766', emiratesId: '784-1987-3456789-3', dateOfBirth: '1987-09-30', gender: 'male' as const, department: 'Operations', designation: 'Operations Manager', joinDate: '2019-08-20', status: 'active' as const, basicSalary: '18000', totalSalary: '26000', housingAllowance: '5000', transportAllowance: '2000', bankName: 'Dubai Islamic Bank', visaStatus: 'active' as const, visaExpiry: '2026-08-20', passportExpiry: '2028-09-30', emiratisationCategory: 'emirati' as const },
        { firstName: 'Priya', lastName: 'Nair', email: 'priya.n@company.ae', phone: '+971 54 678 9012', nationality: 'Indian', passportNo: 'IN44556677', dateOfBirth: '1992-12-08', gender: 'female' as const, department: 'Marketing', designation: 'Marketing Executive', joinDate: '2023-08-01', status: 'onboarding' as const, basicSalary: '8000', totalSalary: '12000', housingAllowance: '2500', transportAllowance: '1000', bankName: 'Mashreq', visaStatus: 'entry_permit' as const, passportExpiry: '2027-12-08', emiratisationCategory: 'expat' as const },
        { firstName: 'James', lastName: 'Williams', email: 'james.w@company.ae', phone: '+971 58 789 0123', nationality: 'American', passportNo: 'US33445566', dateOfBirth: '1980-06-14', gender: 'male' as const, department: 'Legal', designation: 'Legal Counsel', joinDate: '2020-11-01', status: 'active' as const, basicSalary: '22000', totalSalary: '32000', housingAllowance: '7000', transportAllowance: '2000', bankName: 'HSBC', visaStatus: 'active' as const, visaExpiry: '2026-11-01', passportExpiry: '2027-06-14', emiratisationCategory: 'expat' as const },
        { firstName: 'Fatima', lastName: 'Al Zaabi', email: 'fatima.z@company.ae', phone: '+971 55 890 1234', nationality: 'Emirati', passportNo: 'AE11334455', emiratesId: '784-1995-4567890-4', dateOfBirth: '1995-02-28', gender: 'female' as const, department: 'Customer Service', designation: 'Customer Relations Manager', joinDate: '2022-09-15', status: 'active' as const, basicSalary: '11000', totalSalary: '17000', housingAllowance: '3500', transportAllowance: '1200', bankName: 'Emirates NBD', visaStatus: 'active' as const, visaExpiry: '2026-09-15', passportExpiry: '2028-02-28', emiratisationCategory: 'emirati' as const },
    ]

    const insertedEmployees = await db.insert(employees).values(
        employeeData.map((e, i) => ({
            ...e,
            tenantId: tenant.id,
            entityId: entity.id,
            employeeNo: `HR-00${i + 1}`,
        }))
    ).returning()

    // Link employee records to their corresponding user accounts
    const ahmed = insertedEmployees.find(e => e.firstName === 'Ahmed')!
    const james = insertedEmployees.find(e => e.firstName === 'James')!

    await db.update(users).set({ employeeId: ahmed.id }).where(eq(users.id, employeeUser.id))
    await db.update(users).set({ employeeId: james.id }).where(eq(users.id, deptHead.id))

    console.log(`✓ ${insertedEmployees.length} employees created`)

    // ── 6. Leave policies (UAE Labour Law defaults) ────────────
    await db.insert(leavePolicies).values([
        { tenantId: tenant.id, leaveType: 'annual', daysPerYear: 30, accrualRule: 'monthly_2_then_30', maxCarryForward: 15, carryExpiresAfterMonths: 6 },
        { tenantId: tenant.id, leaveType: 'sick', daysPerYear: 90, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'maternity', daysPerYear: 60, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'paternity', daysPerYear: 5, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'compassionate', daysPerYear: 5, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'hajj', daysPerYear: 30, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'unpaid', daysPerYear: 0, accrualRule: 'none', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
        { tenantId: tenant.id, leaveType: 'public_holiday', daysPerYear: 0, accrualRule: 'none', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    ])
    console.log('✓ Leave policies created (UAE Labour Law)')

    // ── 7. UAE Public Holidays 2026 ────────────────────────────
    await db.insert(publicHolidays).values([
        { tenantId: tenant.id, name: "New Year's Day", date: '2026-01-01', year: 2026, isRecurring: true },
        { tenantId: tenant.id, name: "Isra Mi'raj", date: '2026-01-27', year: 2026, isRecurring: false, notes: 'Approximate — based on lunar calendar' },
        { tenantId: tenant.id, name: 'Arafat (Eid Al Adha Eve)', date: '2026-06-15', year: 2026, isRecurring: false, notes: 'Approximate' },
        { tenantId: tenant.id, name: 'Eid Al Adha', date: '2026-06-16', year: 2026, isRecurring: false, notes: 'Approximate' },
        { tenantId: tenant.id, name: 'Eid Al Adha Holiday', date: '2026-06-17', year: 2026, isRecurring: false },
        { tenantId: tenant.id, name: 'Eid Al Adha Holiday', date: '2026-06-18', year: 2026, isRecurring: false },
        { tenantId: tenant.id, name: 'Islamic New Year', date: '2026-07-17', year: 2026, isRecurring: false, notes: 'Approximate' },
        { tenantId: tenant.id, name: "Prophet's Birthday", date: '2026-09-25', year: 2026, isRecurring: false, notes: 'Approximate' },
        { tenantId: tenant.id, name: 'Commemoration Day', date: '2026-12-01', year: 2026, isRecurring: true },
        { tenantId: tenant.id, name: 'National Day', date: '2026-12-02', year: 2026, isRecurring: true },
        { tenantId: tenant.id, name: 'National Day Holiday', date: '2026-12-03', year: 2026, isRecurring: true },
    ])
    console.log('✓ UAE public holidays 2026 seeded')

    // ── 8. Recruitment jobs ────────────────────────────────────
    const insertedJobs = await db.insert(recruitmentJobs).values([
        { tenantId: tenant.id, title: 'Senior Property Consultant', department: 'Sales', location: 'Dubai Marina', type: 'full_time', status: 'open', openings: 3, minSalary: '10000', maxSalary: '18000', industry: 'real_estate', description: 'Lead property sales and client acquisition.', requirements: ['RERA licensed', '3+ years UAE real estate', 'Arabic preferred'], closingDate: '2026-05-31', postedBy: hrManager.id },
        { tenantId: tenant.id, title: 'HR Manager', department: 'HR', location: 'Business Bay', type: 'full_time', status: 'open', openings: 1, minSalary: '14000', maxSalary: '20000', industry: 'real_estate', description: 'Oversee all HR functions and compliance.', requirements: ['UAE HR experience', 'CIPD preferred', 'WPS knowledge'], closingDate: '2026-04-30', postedBy: hrManager.id },
        { tenantId: tenant.id, title: 'Site Safety Officer', department: 'Operations', location: 'Various Sites', type: 'full_time', status: 'open', openings: 2, minSalary: '7000', maxSalary: '12000', industry: 'construction', description: 'Ensure site safety compliance per UAE standards.', requirements: ['NEBOSH certificate', '2+ years construction', 'First aid certified'], closingDate: '2026-05-15', postedBy: hrManager.id },
        { tenantId: tenant.id, title: 'Finance Controller', department: 'Finance', location: 'DIFC', type: 'full_time', status: 'open', openings: 1, minSalary: '20000', maxSalary: '30000', industry: 'real_estate', description: 'Lead all financial operations and reporting.', requirements: ['CPA/ACCA qualified', '8+ years finance', 'IFRS knowledge'], closingDate: '2026-06-30', postedBy: hrManager.id },
    ]).returning()

    await db.insert(jobApplications).values([
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Khalid Al Hamdan', email: 'khalid@email.com', phone: '+971 50 111 2222', nationality: 'Emirati', stage: 'interview', score: 85, experience: 5, expectedSalary: '16000' },
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Deepak Menon', email: 'deepak@email.com', phone: '+971 55 222 3333', nationality: 'Indian', stage: 'screening', score: 72, experience: 4, expectedSalary: '14000' },
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Anna Kowalski', email: 'anna@email.com', phone: '+971 52 333 4444', nationality: 'Polish', stage: 'offer', score: 91, experience: 7, expectedSalary: '17000' },
        { jobId: insertedJobs[1].id, tenantId: tenant.id, name: 'Zainab Al Qassimi', email: 'zainab@email.com', phone: '+971 56 444 5555', nationality: 'Emirati', stage: 'assessment', score: 88, experience: 6, expectedSalary: '19000' },
        { jobId: insertedJobs[3].id, tenantId: tenant.id, name: 'Omar Hassan', email: 'omar@email.com', phone: '+971 54 666 7777', nationality: 'Egyptian', stage: 'pre_boarding', score: 94, experience: 10, expectedSalary: '28000' },
    ])
    console.log(`✓ ${insertedJobs.length} jobs + 5 candidates created`)

    // ── 9. Visa applications ───────────────────────────────────
    const priya = insertedEmployees.find(e => e.firstName === 'Priya')!
    const maria = insertedEmployees.find(e => e.firstName === 'Maria')!

    await db.insert(visaApplications).values([
        { tenantId: tenant.id, employeeId: priya.id, visaType: 'employment_new', status: 'eid_pending', currentStep: 5, totalSteps: 8, mohreRef: 'MOHRE-2026-44521', startDate: '2026-03-01', urgencyLevel: 'normal' },
        { tenantId: tenant.id, employeeId: james.id, visaType: 'employment_renewal', status: 'entry_permit', currentStep: 1, totalSteps: 6, startDate: '2026-04-01', expiryDate: '2026-11-01', urgencyLevel: 'normal' },
        { tenantId: tenant.id, employeeId: maria.id, visaType: 'dependant', status: 'medical_pending', currentStep: 3, totalSteps: 7, mohreRef: 'MOHRE-2026-44890', startDate: '2026-03-10', urgencyLevel: 'urgent' },
    ])
    console.log('✓ Visa applications created')

    // ── 10. Payroll runs ───────────────────────────────────────
    await db.insert(payrollRuns).values([
        { tenantId: tenant.id, month: 2, year: 2026, status: 'paid', totalEmployees: 248, totalGross: '4820000', totalDeductions: '145000', totalNet: '4675000', wpsFileRef: 'WPS-2026-02-001', processedDate: '2026-02-27' },
        { tenantId: tenant.id, month: 3, year: 2026, status: 'wps_submitted', totalEmployees: 251, totalGross: '4890000', totalDeductions: '148000', totalNet: '4742000', wpsFileRef: 'WPS-2026-03-001', processedDate: '2026-03-25' },
        { tenantId: tenant.id, month: 4, year: 2026, status: 'draft', totalEmployees: 253, totalGross: '4920000', totalDeductions: '150000', totalNet: '4770000' },
    ])
    console.log('✓ Payroll runs created')

    // ── 11. Leave requests ─────────────────────────────────────
    const rahul = insertedEmployees.find(e => e.firstName === 'Rahul')!
    const fatima = insertedEmployees.find(e => e.firstName === 'Fatima')!

    await db.insert(leaveRequests).values([
        { tenantId: tenant.id, employeeId: ahmed.id, leaveType: 'annual', startDate: '2026-05-01', endDate: '2026-05-15', days: 15, status: 'approved', reason: 'Family vacation', approvedBy: hrManager.id, appliedDate: '2026-04-10' },
        { tenantId: tenant.id, employeeId: rahul.id, leaveType: 'sick', startDate: '2026-04-18', endDate: '2026-04-20', days: 3, status: 'pending', reason: 'Medical appointment', appliedDate: '2026-04-17' },
        { tenantId: tenant.id, employeeId: maria.id, leaveType: 'annual', startDate: '2026-06-01', endDate: '2026-06-07', days: 7, status: 'pending', reason: 'Home visit', appliedDate: '2026-04-15' },
        { tenantId: tenant.id, employeeId: fatima.id, leaveType: 'compassionate', startDate: '2026-04-12', endDate: '2026-04-14', days: 3, status: 'approved', reason: 'Family bereavement', approvedBy: hrManager.id, appliedDate: '2026-04-12' },
    ])
    console.log('✓ Leave requests created')

    // ── 12. Onboarding checklist for Priya ─────────────────────
    const [checklist] = await db.insert(onboardingChecklists).values({
        tenantId: tenant.id,
        employeeId: priya.id,
        progress: 50,
        startDate: '2026-03-01',
    }).returning()

    await db.insert(onboardingSteps).values([
        { checklistId: checklist.id, stepOrder: 1, title: 'Offer Acceptance', owner: 'HR Manager', slaDays: 3, status: 'completed', dueDate: '2026-03-04', completedDate: '2026-03-02' },
        { checklistId: checklist.id, stepOrder: 2, title: 'Medical Fitness Test', owner: 'PRO Officer', slaDays: 5, status: 'completed', dueDate: '2026-03-09', completedDate: '2026-03-10' },
        { checklistId: checklist.id, stepOrder: 3, title: 'Emirates ID Application', owner: 'PRO Officer', slaDays: 7, status: 'in_progress', dueDate: '2026-04-25' },
        { checklistId: checklist.id, stepOrder: 4, title: 'Labour Card Application', owner: 'PRO Officer', slaDays: 5, status: 'pending', dueDate: '2026-05-01' },
        { checklistId: checklist.id, stepOrder: 5, title: 'Bank Account Opening', owner: 'Employee', slaDays: 7, status: 'pending', dueDate: '2026-05-08' },
        { checklistId: checklist.id, stepOrder: 6, title: 'Health Insurance Enrolment', owner: 'HR Manager', slaDays: 3, status: 'pending', dueDate: '2026-05-05' },
        { checklistId: checklist.id, stepOrder: 7, title: 'IT Provisioning', owner: 'IT Admin', slaDays: 2, status: 'pending', dueDate: '2026-05-03' },
        { checklistId: checklist.id, stepOrder: 8, title: 'Orientation & Training', owner: 'Dept Head', slaDays: 5, status: 'pending', dueDate: '2026-05-10' },
    ])
    console.log('✓ Onboarding checklist created')

    // ── 13. Notifications ──────────────────────────────────────
    await db.insert(notifications).values([
        { tenantId: tenant.id, userId: hrManager.id, type: 'warning', title: 'Visa Expiring Soon', message: "James Williams' residence visa expires in 195 days. Renewal recommended.", actionUrl: '/visa', isRead: false },
        { tenantId: tenant.id, userId: hrManager.id, type: 'warning', title: 'Document Expiry Alert', message: "Ahmed Al Mansouri's RERA license expires in 10 days.", actionUrl: '/documents', isRead: false },
        { tenantId: tenant.id, userId: hrManager.id, type: 'info', title: 'Onboarding Update', message: 'Priya Nair has completed medical fitness test. Next step: Emirates ID biometrics.', actionUrl: '/onboarding', isRead: false },
        { tenantId: tenant.id, userId: hrManager.id, type: 'success', title: 'WPS Submission Confirmed', message: 'March 2026 payroll WPS submission accepted by bank. 251 employees paid.', isRead: true },
        { tenantId: tenant.id, userId: hrManager.id, type: 'error', title: 'Emiratisation Alert', message: 'Current Emiratisation ratio is 1.8%, below the 2% MOHRE requirement.', actionUrl: '/compliance', isRead: false },
        { tenantId: tenant.id, userId: superAdmin.id, type: 'info', title: 'New Tenant Registration', message: 'Al Noor Real Estate LLC has completed setup.', isRead: false },
    ])
    console.log('✓ Notifications created')

    // ── Second tenant (for org-switching demo) ─────────────────
    const [tenant2] = await db.insert(tenants).values({
        name: 'Al Noor Freezone LLC',
        tradeLicenseNo: 'DIFC-2021-98765',
        jurisdiction: 'freezone',
        industryType: 'technology',
        subscriptionPlan: 'starter',
        isActive: true,
    }).returning()

    // Add admin@hrhub.ae (hrManager) to second tenant as hr_manager
    await db.insert(tenantMemberships).values({
        tenantId: tenant2.id,
        userId: hrManager.id,
        role: 'hr_manager',
        inviteStatus: 'accepted',
        isActive: true,
        acceptedAt: new Date(),
    })
    console.log('✓ Second tenant created and admin@hrhub.ae assigned to both tenants')

    console.log('\n✅ Seed complete!')
    console.log('\n── Login Credentials (all use password: Admin@12345) ──')
    console.log('  Super Admin : superadmin@hrhub.ae  (1 org)')
    console.log('  HR Manager  : admin@hrhub.ae        (2 orgs — can test org switching)')
    console.log('  PRO Officer : pro@hrhub.ae')
    console.log('  Dept Head   : manager@hrhub.ae')
    console.log('  Employee    : employee@hrhub.ae')

    process.exit(0)
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
})
