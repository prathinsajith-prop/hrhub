import { pgTable, uuid, text, boolean, timestamp, numeric, date, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { tenants, entities } from './tenants'

export const employees = pgTable('employees', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull().references(() => entities.id),
    employeeNo: text('employee_no').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    nationality: text('nationality'),
    passportNo: text('passport_no'),
    emiratesId: text('emirates_id'),
    dateOfBirth: date('date_of_birth'),
    gender: text('gender').$type<'male' | 'female'>(),
    department: text('department'),
    designation: text('designation'),
    reportingTo: uuid('reporting_to'),
    joinDate: date('join_date').notNull(),
    status: text('status').notNull().default('onboarding')
        .$type<'active' | 'onboarding' | 'probation' | 'suspended' | 'terminated' | 'visa_expired'>(),
    basicSalary: numeric('basic_salary', { precision: 12, scale: 2 }),
    totalSalary: numeric('total_salary', { precision: 12, scale: 2 }),
    visaStatus: text('visa_status')
        .$type<'not_started' | 'entry_permit' | 'medical_pending' | 'eid_pending' | 'stamping' | 'active' | 'expiring_soon' | 'expired' | 'cancelled'>(),
    visaExpiry: date('visa_expiry'),
    passportExpiry: date('passport_expiry'),
    emiratisationCategory: text('emiratisation_category').$type<'emirati' | 'expat'>(),
    avatarUrl: text('avatar_url'),
    // Extended fields
    workEmail: text('work_email'),
    personalEmail: text('personal_email'),
    mobileNo: text('mobile_no'),
    maritalStatus: text('marital_status').$type<'single' | 'married' | 'divorced' | 'widowed'>(),
    gradeLevel: text('grade_level'),
    managerName: text('manager_name'),
    labourCardNumber: text('labour_card_number'),
    bankName: text('bank_name'),
    iban: text('iban'),
    housingAllowance: numeric('housing_allowance', { precision: 12, scale: 2 }),
    transportAllowance: numeric('transport_allowance', { precision: 12, scale: 2 }),
    otherAllowances: numeric('other_allowances', { precision: 12, scale: 2 }),
    paymentMethod: text('payment_method').$type<'bank_transfer' | 'cash' | 'cheque'>(),
    emergencyContact: text('emergency_contact'),
    homeCountryAddress: text('home_country_address'),
    visaNumber: text('visa_number'),
    visaIssueDate: date('visa_issue_date'),
    visaType: text('visa_type').$type<'employment' | 'investor' | 'dependent' | 'mission'>(),
    emiratesIdExpiry: date('emirates_id_expiry'),
    sponsoringEntity: text('sponsoring_entity'),
    contractType: text('contract_type').$type<'permanent' | 'contract' | 'part_time'>(),
    workLocation: text('work_location'),
    probationEndDate: date('probation_end_date'),
    contractEndDate: date('contract_end_date'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // Lookup indexes
    index('idx_employees_tenant').on(t.tenantId),
    index('idx_employees_entity').on(t.entityId),
    index('idx_employees_status').on(t.status),
    index('idx_employees_visa_expiry').on(t.visaExpiry),
    // Composite indexes for common query patterns
    index('idx_employees_tenant_status').on(t.tenantId, t.status),
    index('idx_employees_tenant_dept').on(t.tenantId, t.department),
    index('idx_employees_passport_expiry').on(t.tenantId, t.passportExpiry),
    index('idx_employees_eid_expiry').on(t.tenantId, t.emiratesIdExpiry),
    // Partial index: active (non-archived) employees — most common query
    index('idx_employees_active').on(t.tenantId).where(sql`${t.isArchived} = false`),
    // Unique employee number per tenant
    uniqueIndex('idx_employees_no_tenant').on(t.tenantId, t.employeeNo),
    // Unique email per tenant (where email is provided)
    uniqueIndex('idx_employees_email_tenant').on(t.tenantId, t.email).where(sql`${t.email} IS NOT NULL`),
    // Data integrity checks
    check('chk_employees_salary_positive', sql`${t.basicSalary} IS NULL OR ${t.basicSalary} >= 0`),
    check('chk_employees_total_gte_basic', sql`${t.totalSalary} IS NULL OR ${t.basicSalary} IS NULL OR ${t.totalSalary} >= ${t.basicSalary}`),
    check('chk_employees_gender', sql`${t.gender} IN ('male', 'female')`),
    check('chk_employees_contract_after_join', sql`${t.contractEndDate} IS NULL OR ${t.contractEndDate} >= ${t.joinDate}`),
    check('chk_employees_probation_after_join', sql`${t.probationEndDate} IS NULL OR ${t.probationEndDate} >= ${t.joinDate}`),
])

export const employeesRelations = relations(employees, ({ one }) => ({
    tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
    entity: one(entities, { fields: [employees.entityId], references: [entities.id] }),
}))
