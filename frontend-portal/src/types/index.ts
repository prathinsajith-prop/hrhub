export type UserRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface User {
    id: string
    firstName: string
    lastName: string
    name: string
    email: string
    role: UserRole
    roles?: string[]
    avatarUrl?: string | null
    tenantId: string
    department?: string | null
    employeeId?: string | null
}

export interface Tenant {
    id: string
    name: string
    tradeLicenseNo?: string
    jurisdiction?: 'mainland' | 'freezone'
    industryType?: string
    subscriptionPlan?: string
    logoUrl?: string | null
}

export interface Employee {
    id: string
    tenantId: string
    employeeNo: string
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    mobileNo?: string | null
    personalEmail?: string | null
    nationality?: string | null
    /**
     * Resolved department name. Server prefers the org_units.name joined via
     * `departmentId` FK; falls back to the legacy `department` text column.
     * That fallback exists so older tenants whose data never migrated to the
     * org-units model still see something — but new code should never write
     * to the text column.
     */
    department?: string | null
    /** Org-unit joined names — populated by /employees/me + /employees/:id. */
    branchName?: string | null
    divisionName?: string | null
    departmentName?: string | null
    designation?: string | null
    reportingTo?: string | null
    /** Joined from the manager's record on the /:id endpoint (see backend `getEmployeeWithReportingTo`). */
    reportingToName?: string | null
    reportingToEmployeeNo?: string | null
    reportingToDesignation?: string | null
    reportingToDepartment?: string | null
    joinDate: string
    status: 'active' | 'onboarding' | 'suspended' | 'terminated' | 'visa_expired'
    basicSalary?: string | null
    housingAllowance?: string | null
    transportAllowance?: string | null
    otherAllowances?: string | null
    bankName?: string | null
    accountName?: string | null
    accountNumber?: string | null
    iban?: string | null
    swiftCode?: string | null
    bankBranch?: string | null
    avatarUrl?: string | null
    emergencyContact?: string | null
    emergencyContactName?: string | null
    emergencyContactPhone?: string | null
    homeCountryAddress?: string | null
    visaExpiry?: string | null
    passportExpiry?: string | null
    emiratesIdExpiry?: string | null
    contractEndDate?: string | null
    probationEndDate?: string | null
    // Shift schedule joined from the `shifts` table via employees.shift_id.
    // null = tenant default working week applies. Times are 'HH:MM' 24-hour strings.
    shift?: {
        name: string
        startTime: string
        endTime: string
        weeklyOffDays: string[]
    } | null
}

export type LeaveType = 'annual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'compassionate' | 'emergency' | 'bereavement' | 'hajj'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
    id: string
    tenantId: string
    employeeId: string
    leaveType: LeaveType
    startDate: string
    endDate: string
    days: number
    status: LeaveStatus
    reason?: string | null
    handoverTo?: string | null
    handoverNotes?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    appliedDate?: string
    createdAt: string
    updatedAt: string
    employeeName?: string
    employeeNo?: string
    employeeDepartment?: string | null
    /** Resolved on the list response via a left-join in /leave (backend-portal). */
    handoverToName?: string | null
    handoverToDesignation?: string | null
}

interface LeaveBalanceEntry {
    entitled: number
    accrued: number
    carriedForward: number
    carryExpiresOn: string | null
    taken: number
    adjustment: number
    available: number
    unlimited: boolean
}

export interface LeaveBalance {
    employeeId: string
    year: number
    balance: Record<string, LeaveBalanceEntry>
}

export interface Payslip {
    id: string
    payrollRunId: string
    month: number
    year: number
    runStatus: string
    basicSalary: string
    housingAllowance: string
    transportAllowance: string
    otherAllowances: string
    // Catalog-driven per-component breakdown captured at run time
    // (migration 0048). Empty array for legacy payslips — the dialog falls
    // back to the four named columns above.
    earningsBreakdown?: Array<{ componentId: string; category: string; name: string; amount: number | string }>
    overtime?: string
    commission?: string
    grossSalary: string
    deductions: string
    // Itemised leave-driven deductions — see migration 0037 and the
    // PayslipBreakdown component on the admin frontend for the same fields.
    unpaidLeaveDays?: number | null
    unpaidLeaveDeduction?: string | null
    sickHalfPayDays?: number | null
    sickHalfPayDeduction?: string | null
    loanDeduction?: string | null
    otherDeduction?: string | null
    netSalary: string
    daysWorked: number | null
}

export interface PayslipDetail extends Payslip {
    employeeId: string
    tenantId: string
    employeeFirstName: string
    employeeLastName: string
    employeeNo: string
    department: string | null
    designation: string | null
    bankName: string | null
    iban: string | null
    tenantName: string
    tradeLicenseNo: string | null
}

export interface AttendanceRecord {
    id: string
    tenantId: string
    employeeId: string
    date: string
    checkIn?: string | null
    checkOut?: string | null
    hoursWorked?: string | null
    overtimeHours?: string | null
    status: 'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave'
    notes?: string | null
    employeeName?: string
    employeeNo?: string
    employeeDepartment?: string | null
}

export interface PaginatedResponse<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

export interface Notification {
    id: string
    tenantId: string
    userId: string | null
    type: 'info' | 'warning' | 'error' | 'success'
    title: string
    message: string
    actionUrl: string | null
    isRead: boolean
    createdAt: string
}

export interface PublicHoliday {
    id: string
    tenantId: string
    name: string
    date: string
    year: number
    isRecurring: boolean
    country: string
    notes: string | null
}
