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
    department?: string | null
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
    iban?: string | null
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
}

export interface LeaveBalanceEntry {
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
    grossSalary: string
    deductions: string
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

export interface Team {
    id: string
    tenantId: string
    name: string
    description?: string | null
    departmentId?: string | null
    department?: string | null
    isActive: boolean
    memberRole?: string
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
