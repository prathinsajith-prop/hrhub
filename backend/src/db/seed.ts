// @ts-nocheck
/**
 * Seed database with demo data matching the frontend mock data.
 * Run: npm run db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { db } from './index.js'
import {
    tenants, entities, users, employees,
    recruitmentJobs, jobApplications,
    visaApplications, documents,
    onboardingChecklists, onboardingSteps,
    payrollRuns, leaveRequests, notifications,
} from './schema/index.js'

async function seed() {
    console.log('🌱 Seeding database...')

    // ── Tenant ──────────────────────────────────────────────
    const [tenant] = await db.insert(tenants).values({
        name: 'Al Noor Real Estate LLC',
        tradeLicenseNo: 'DED-2019-12345',
        jurisdiction: 'mainland',
        industryType: 'real_estate',
        subscriptionPlan: 'growth',
        isActive: true,
    }).returning()

    console.log('✓ Tenant created:', tenant.id)

    // ── Entity ───────────────────────────────────────────────
    const [entity] = await db.insert(entities).values({
        tenantId: tenant.id,
        entityName: 'Al Noor Real Estate LLC — Dubai',
        licenseType: 'LLC',
        isActive: true,
    }).returning()

    // ── Admin user ───────────────────────────────────────────
    const passwordHash = await bcrypt.hash('Admin@12345', 12)
    const [adminUser] = await db.insert(users).values({
        tenantId: tenant.id,
        entityId: entity.id,
        email: 'admin@hrhub.ae',
        passwordHash,
        name: 'Sarah Johnson',
        role: 'hr_manager',
        department: 'HR',
    }).returning()

    console.log('✓ Admin user: admin@hrhub.ae / Admin@12345')

    // ── Employees ────────────────────────────────────────────
    const employeeRows = [
        { firstName: 'Ahmed', lastName: 'Al Mansouri', email: 'ahmed.mansouri@company.ae', phone: '+971 50 123 4567', nationality: 'Emirati', passportNo: 'AE12345678', emiratesId: '784-1985-1234567-1', dateOfBirth: '1985-03-15', gender: 'male' as const, department: 'Sales', designation: 'Senior Property Consultant', joinDate: '2022-01-10', status: 'active' as const, basicSalary: '12000', totalSalary: '18000', visaStatus: 'active' as const, visaExpiry: '2026-01-10', passportExpiry: '2027-03-15', emiratisationCategory: 'emirati' as const },
        { firstName: 'Rahul', lastName: 'Sharma', email: 'rahul.s@company.ae', phone: '+971 52 345 6789', nationality: 'Indian', passportNo: 'IN11223344', dateOfBirth: '1988-11-05', gender: 'male' as const, department: 'Finance', designation: 'Senior Accountant', joinDate: '2020-03-15', status: 'active' as const, basicSalary: '10000', totalSalary: '15000', visaStatus: 'active' as const, visaExpiry: '2026-03-15', passportExpiry: '2026-11-05', emiratisationCategory: 'expat' as const },
        { firstName: 'Maria', lastName: 'Santos', email: 'maria.s@company.ae', phone: '+971 56 456 7890', nationality: 'Filipino', passportNo: 'PH55667788', dateOfBirth: '1993-04-18', gender: 'female' as const, department: 'Admin', designation: 'Executive Assistant', joinDate: '2023-02-01', status: 'probation' as const, basicSalary: '6000', totalSalary: '9000', visaStatus: 'active' as const, visaExpiry: '2026-02-01', passportExpiry: '2027-04-18', emiratisationCategory: 'expat' as const },
        { firstName: 'Mohammad', lastName: 'Al Rashidi', email: 'mo.rashidi@company.ae', phone: '+971 50 567 8901', nationality: 'Emirati', passportNo: 'AE99887766', emiratesId: '784-1987-3456789-3', dateOfBirth: '1987-09-30', gender: 'male' as const, department: 'Operations', designation: 'Operations Manager', joinDate: '2019-08-20', status: 'active' as const, basicSalary: '18000', totalSalary: '26000', visaStatus: 'active' as const, visaExpiry: '2026-08-20', passportExpiry: '2028-09-30', emiratisationCategory: 'emirati' as const },
        { firstName: 'Priya', lastName: 'Nair', email: 'priya.n@company.ae', phone: '+971 54 678 9012', nationality: 'Indian', passportNo: 'IN44556677', dateOfBirth: '1992-12-08', gender: 'female' as const, department: 'Marketing', designation: 'Marketing Executive', joinDate: '2023-08-01', status: 'onboarding' as const, basicSalary: '8000', totalSalary: '12000', visaStatus: 'entry_permit' as const, passportExpiry: '2027-12-08', emiratisationCategory: 'expat' as const },
        { firstName: 'James', lastName: 'Williams', email: 'james.w@company.ae', phone: '+971 58 789 0123', nationality: 'American', passportNo: 'US33445566', dateOfBirth: '1980-06-14', gender: 'male' as const, department: 'Legal', designation: 'Legal Counsel', joinDate: '2020-11-01', status: 'active' as const, basicSalary: '22000', totalSalary: '32000', visaStatus: 'active' as const, visaExpiry: '2026-11-01', passportExpiry: '2027-06-14', emiratisationCategory: 'expat' as const },
        { firstName: 'Fatima', lastName: 'Al Zaabi', email: 'fatima.z@company.ae', phone: '+971 55 890 1234', nationality: 'Emirati', passportNo: 'AE11334455', emiratesId: '784-1995-4567890-4', dateOfBirth: '1995-02-28', gender: 'female' as const, department: 'Customer Service', designation: 'Customer Relations Manager', joinDate: '2022-09-15', status: 'active' as const, basicSalary: '11000', totalSalary: '17000', visaStatus: 'active' as const, visaExpiry: '2026-09-15', passportExpiry: '2028-02-28', emiratisationCategory: 'emirati' as const },
    ]

    const insertedEmployees = await db.insert(employees).values(
        employeeRows.map((e, i) => ({
            ...e,
            tenantId: tenant.id,
            entityId: entity.id,
            employeeNo: `HR-00${i + 1}`,
        }))
    ).returning()

    console.log(`✓ ${insertedEmployees.length} employees created`)

    // ── Jobs ─────────────────────────────────────────────────
    const insertedJobs = await db.insert(recruitmentJobs).values([
        { tenantId: tenant.id, title: 'Senior Property Consultant', department: 'Sales', location: 'Dubai Marina', type: 'full_time', status: 'open', openings: 3, minSalary: '10000', maxSalary: '18000', industry: 'real_estate', description: 'Lead property sales and client acquisition.', requirements: ['RERA licensed', '3+ years UAE real estate', 'Arabic preferred'], closingDate: '2026-05-31', postedBy: adminUser.id },
        { tenantId: tenant.id, title: 'HR Manager', department: 'HR', location: 'Business Bay', type: 'full_time', status: 'open', openings: 1, minSalary: '14000', maxSalary: '20000', industry: 'real_estate', description: 'Oversee all HR functions and compliance.', requirements: ['UAE HR experience', 'CIPD preferred', 'WPS knowledge'], closingDate: '2026-04-30', postedBy: adminUser.id },
        { tenantId: tenant.id, title: 'Site Safety Officer', department: 'Operations', location: 'Various Sites', type: 'full_time', status: 'open', openings: 2, minSalary: '7000', maxSalary: '12000', industry: 'construction', description: 'Ensure site safety compliance per UAE standards.', requirements: ['NEBOSH certificate', '2+ years construction', 'First aid certified'], closingDate: '2026-05-15', postedBy: adminUser.id },
        { tenantId: tenant.id, title: 'Registered Nurse', department: 'Clinical', location: 'Dubai Healthcare City', type: 'full_time', status: 'open', openings: 4, minSalary: '8000', maxSalary: '14000', industry: 'healthcare', description: 'Patient care in clinical setting.', requirements: ['DHA license required', 'BSN degree', '2+ years ICU preferred'], closingDate: '2026-06-30', postedBy: adminUser.id },
    ]).returning()

    console.log(`✓ ${insertedJobs.length} jobs created`)

    // ── Candidates ───────────────────────────────────────────
    await db.insert(jobApplications).values([
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Khalid Al Hamdan', email: 'khalid@email.com', phone: '+971 50 111 2222', nationality: 'Emirati', stage: 'interview', score: 85, experience: 5, expectedSalary: '16000' },
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Deepak Menon', email: 'deepak@email.com', phone: '+971 55 222 3333', nationality: 'Indian', stage: 'screening', score: 72, experience: 4, expectedSalary: '14000' },
        { jobId: insertedJobs[0].id, tenantId: tenant.id, name: 'Anna Kowalski', email: 'anna@email.com', phone: '+971 52 333 4444', nationality: 'Polish', stage: 'offer', score: 91, experience: 7, expectedSalary: '17000' },
        { jobId: insertedJobs[1].id, tenantId: tenant.id, name: 'Zainab Al Qassimi', email: 'zainab@email.com', phone: '+971 56 444 5555', nationality: 'Emirati', stage: 'assessment', score: 88, experience: 6, expectedSalary: '19000' },
        { jobId: insertedJobs[3].id, tenantId: tenant.id, name: 'Amara Diallo', email: 'amara@email.com', phone: '+971 54 666 7777', nationality: 'Guinean', stage: 'pre_boarding', score: 94, experience: 5, expectedSalary: '12000' },
    ])

    console.log('✓ Candidates created')

    // ── Visa applications ─────────────────────────────────────
    const priya = insertedEmployees.find(e => e.firstName === 'Priya')!
    const james = insertedEmployees.find(e => e.firstName === 'James')!
    const maria = insertedEmployees.find(e => e.firstName === 'Maria')!

    await db.insert(visaApplications).values([
        { tenantId: tenant.id, employeeId: priya.id, visaType: 'employment_new', status: 'eid_pending', currentStep: 5, totalSteps: 8, mohreRef: 'MOHRE-2026-44521', startDate: '2026-03-01', urgencyLevel: 'normal' },
        { tenantId: tenant.id, employeeId: james.id, visaType: 'employment_renewal', status: 'entry_permit', currentStep: 1, totalSteps: 6, startDate: '2026-04-01', expiryDate: '2026-11-01', urgencyLevel: 'normal' },
        { tenantId: tenant.id, employeeId: maria.id, visaType: 'dependant', status: 'medical_pending', currentStep: 3, totalSteps: 7, mohreRef: 'MOHRE-2026-44890', startDate: '2026-03-10', urgencyLevel: 'urgent' },
    ])

    console.log('✓ Visa applications created')

    // ── Payroll runs ──────────────────────────────────────────
    await db.insert(payrollRuns).values([
        { tenantId: tenant.id, month: 2, year: 2026, status: 'paid', totalEmployees: 248, totalGross: '4820000', totalDeductions: '145000', totalNet: '4675000', wpsFileRef: 'WPS-2026-02-001', processedDate: '2026-02-27' },
        { tenantId: tenant.id, month: 3, year: 2026, status: 'wps_submitted', totalEmployees: 251, totalGross: '4890000', totalDeductions: '148000', totalNet: '4742000', wpsFileRef: 'WPS-2026-03-001', processedDate: '2026-03-25' },
        { tenantId: tenant.id, month: 4, year: 2026, status: 'draft', totalEmployees: 253, totalGross: '4920000', totalDeductions: '150000', totalNet: '4770000' },
    ])

    console.log('✓ Payroll runs created')

    // ── Leave requests ────────────────────────────────────────
    const ahmed = insertedEmployees.find(e => e.firstName === 'Ahmed')!
    const rahul = insertedEmployees.find(e => e.firstName === 'Rahul')!
    const fatima = insertedEmployees.find(e => e.firstName === 'Fatima')!

    await db.insert(leaveRequests).values([
        { tenantId: tenant.id, employeeId: ahmed.id, leaveType: 'annual', startDate: '2026-05-01', endDate: '2026-05-15', days: 15, status: 'approved', reason: 'Family vacation', approvedBy: adminUser.id, appliedDate: '2026-04-10' },
        { tenantId: tenant.id, employeeId: rahul.id, leaveType: 'sick', startDate: '2026-04-18', endDate: '2026-04-20', days: 3, status: 'pending', reason: 'Medical appointment', appliedDate: '2026-04-17' },
        { tenantId: tenant.id, employeeId: maria.id, leaveType: 'annual', startDate: '2026-06-01', endDate: '2026-06-07', days: 7, status: 'pending', reason: 'Home visit', appliedDate: '2026-04-15' },
        { tenantId: tenant.id, employeeId: fatima.id, leaveType: 'compassionate', startDate: '2026-04-12', endDate: '2026-04-14', days: 3, status: 'approved', reason: 'Family bereavement', approvedBy: adminUser.id, appliedDate: '2026-04-12' },
    ])

    console.log('✓ Leave requests created')

    // ── Notifications ─────────────────────────────────────────
    await db.insert(notifications).values([
        { tenantId: tenant.id, userId: adminUser.id, type: 'warning', title: 'Visa Expiring Soon', message: "James Williams' residence visa expires in 195 days. Renewal recommended.", actionUrl: '/visa', isRead: false },
        { tenantId: tenant.id, userId: adminUser.id, type: 'warning', title: 'Document Expiry Alert', message: "Ahmed Al Mansouri's RERA license expires in 10 days.", actionUrl: '/documents', isRead: false },
        { tenantId: tenant.id, userId: adminUser.id, type: 'info', title: 'Onboarding Update', message: 'Priya Nair has completed medical fitness test. Next step: Emirates ID biometrics.', actionUrl: '/onboarding', isRead: false },
        { tenantId: tenant.id, userId: adminUser.id, type: 'success', title: 'WPS Submission Confirmed', message: 'March 2026 payroll WPS submission accepted by bank. 251 employees paid.', isRead: true },
        { tenantId: tenant.id, userId: adminUser.id, type: 'error', title: 'Emiratisation Alert', message: 'Current Emiratisation ratio is 1.8%, below the 2% MOHRE requirement.', actionUrl: '/compliance', isRead: false },
    ])

    // ── Onboarding checklist for Priya ───────────────────────
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
        { checklistId: checklist.id, stepOrder: 6, title: 'Insurance Enrolment', owner: 'HR Manager', slaDays: 3, status: 'pending', dueDate: '2026-05-05' },
        { checklistId: checklist.id, stepOrder: 7, title: 'IT Provisioning', owner: 'IT Admin', slaDays: 2, status: 'pending', dueDate: '2026-05-03' },
        { checklistId: checklist.id, stepOrder: 8, title: 'Orientation & Training', owner: 'Dept Head', slaDays: 5, status: 'pending', dueDate: '2026-05-10' },
    ])

    console.log('✓ Onboarding checklist created')
    console.log('\n✅ Seed complete!')
    console.log('\nLogin credentials:')
    console.log('  Email:    admin@hrhub.ae')
    console.log('  Password: Admin@12345')

    process.exit(0)
}

seed().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
})
