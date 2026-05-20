// Auth & Tenant
export type UserRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface User {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  role: UserRole
  roles?: string[]
  avatar?: string
  avatarUrl?: string
  tenantId: string
  entityId?: string
  department?: string
  employeeId?: string | null
}

export interface Tenant {
  id: string
  name: string
  tradeLicenseNo?: string
  jurisdiction: 'mainland' | 'freezone'
  industryType: IndustryType
  subscriptionPlan: 'starter' | 'growth' | 'enterprise'
  // Persisted or resolved URL for the tenant logo used when displaying stored data.
  logoUrl?: string
  // Raw/local logo value used during create/update flows before it is uploaded and exposed via `logoUrl`.
  logo?: string
}

export type IndustryType =
  | 'real_estate'
  | 'travel_tourism'
  | 'construction'
  | 'trading'
  | 'healthcare'
  | 'hospitality'
  | 'education'
  | 'retail'

// Employee
export type EmployeeStatus = 'active' | 'onboarding' | 'suspended' | 'terminated' | 'visa_expired'

export type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'

// Tenant-defined shift template; employees reference one via Employee.shiftId.
export interface Shift {
  id: string
  tenantId: string
  name: string
  startTime: string // 'HH:MM'
  endTime: string   // 'HH:MM'
  weeklyOffDays: WeekDay[]
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Employee {
  id: string
  tenantId: string
  entityId: string
  entityName?: string    // populated via entities JOIN in getEmployee / listEmployees
  employeeNo: string
  firstName: string
  lastName: string
  fullName: string          // computed by backend: firstName + ' ' + lastName
  email: string
  phone: string
  workEmail?: string
  personalEmail?: string
  mobileNo?: string
  nationality?: string
  passportNo?: string
  emiratesId?: string
  dateOfBirth?: string
  gender?: 'male' | 'female'
  department?: string
  designation?: string
  reportingTo?: string | null
  divisionId?: string
  departmentId?: string
  branchId?: string
  joinDate: string
  status: EmployeeStatus
  basicSalary?: number
  totalSalary?: number
  housingAllowance?: number
  transportAllowance?: number
  otherAllowances?: number
  paymentMethod?: 'bank_transfer' | 'cash' | 'cheque'
  bankName?: string
  accountName?: string
  accountNumber?: string
  swiftCode?: string
  bankBranch?: string
  iban?: string
  visaStatus?: VisaStatus
  visaExpiry?: string
  visaNumber?: string
  visaIssueDate?: string
  visaType?: 'employment' | 'investor' | 'dependent' | 'mission'
  passportExpiry?: string
  emiratesIdExpiry?: string
  sponsoringEntityId?: string
  sponsoringEntityName?: string
  avatar?: string
  avatarUrl?: string
  emiratisationCategory?: 'emirati' | 'expat'
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed'
  gradeLevelId?: string
  gradeLevelName?: string
  managerName?: string
  labourCardNumber?: string
  labourCardExpiry?: string
  emergencyContact?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  homeCountryAddress?: string
  contractType?: 'permanent' | 'contract' | 'part_time' | 'probation'
  workLocation?: string
  // FK to a tenant-defined shift template; null = use tenant default.
  shiftId?: string | null
  // Joined display fields populated by GET /employees and /employees/:id.
  shiftName?: string | null
  shiftStartTime?: string | null
  shiftEndTime?: string | null
  shiftWeeklyOffDays?: WeekDay[] | null
  probationEndDate?: string
  contractEndDate?: string
  createdAt?: string
  updatedAt?: string
}

// Recruitment
export type JobStatus = 'draft' | 'open' | 'closed' | 'on_hold'
/**
 * Stage keys are per-tenant - admins can add/rename them in Organization
 * Settings → Recruitment Stages. The seven names below are the system defaults
 * seeded for every new tenant; the union is widened to `string` so user-
 * defined keys are accepted. Code that branches on a specific key (e.g.
 * `pre_boarding` for the Convert button) still works because string-literal
 * comparison is well-defined against `string`.
 */
export type ApplicationStage = string

export interface Job {
  id: string
  title: string
  department: string
  location: string
  type: 'full_time' | 'part_time' | 'contract'
  status: JobStatus
  openings: number
  applications: number
  postedDate: string
  closingDate: string
  minSalary: number
  maxSalary: number
  industry: IndustryType
  description: string
  requirements: string[]
}

export interface Candidate {
  id: string
  jobId: string
  jobTitle?: string
  name: string
  email: string
  phone: string
  nationality: string
  stage: ApplicationStage
  score: number
  appliedDate: string
  avatar?: string
  experience: number
  currentSalary?: number
  expectedSalary?: number
  notes?: string
  resumeUrl?: string | null
}

// Visa
export type VisaType =
  | 'employment_new'
  | 'employment_renewal'
  | 'mission'
  | 'visit'
  | 'investor'
  | 'dependant'
  | 'golden'
  | 'freelancer'
  | 'cancellation'

export type VisaStatus =
  | 'not_started'
  | 'entry_permit'
  | 'medical_pending'
  | 'eid_pending'
  | 'stamping'
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'cancelled'

export interface VisaApplication {
  id: string
  employeeId: string
  employeeName: string
  employeeAvatarUrl?: string | null
  employeeDepartment?: string | null
  employeeNo?: string | null
  visaType: VisaType
  status: VisaStatus
  currentStep: number
  totalSteps: number
  mohreRef?: string
  gdfrRef?: string
  startDate: string
  expiryDate?: string
  urgencyLevel: 'normal' | 'urgent' | 'critical'
}

// Documents
export type DocCategory = 'identity' | 'visa' | 'company' | 'employment' | 'insurance' | 'qualification' | 'financial' | 'compliance'
export type DocStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_upload' | 'under_review' | 'rejected'

export interface Document {
  id: string
  employeeId?: string
  employeeName?: string
  employeeNo?: string
  employeeAvatarUrl?: string
  employeeDepartment?: string
  category: DocCategory
  docType: string
  fileName: string
  fileSize?: number | null
  /** The number printed on the document - visa number, Emirates ID, passport, etc. */
  docNumber?: string | null
  issueDate?: string | null
  expiryDate?: string | null
  notes?: string | null
  createdAt: string
  uploadedBy?: string | null
  uploadedByName?: string | null
  status: DocStatus
  verified: boolean
  verifiedAt?: string | null
  verifiedByName?: string | null
  s3Key?: string
}

// Payroll
export interface PayrollRun {
  id: string
  month: number
  year: number
  status: 'draft' | 'processing' | 'approved' | 'wps_submitted' | 'paid'
  totalEmployees: number
  totalGross: number
  totalDeductions: number
  totalNet: number
  wpsFileRef?: string
  processedDate?: string
}

export interface Payslip {
  id: string
  employeeId: string
  employeeName: string
  employeeNo?: string | null
  department?: string | null
  /**
   * `true` when this row came from the draft preview rather than a persisted
   * payslip. The PDF download button is hidden for previews — there's no
   * payslip row to PDF-ify until runPayroll is processed. The `id` will
   * look like `draft:<runId>:<employeeId>` instead of a UUID.
   */
  isDraft?: boolean
  month: number
  year: number
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  otherAllowances: number
  overtime: number
  commission?: number
  deductions: number
  // Itemised leave-driven deductions (LOP + sick-half-pay). Always present
  // on payslips generated after migration 0037; default to 0 otherwise so
  // the breakdown stays additive and never shows NaN.
  unpaidLeaveDays?: number | null
  unpaidLeaveDeduction?: number | string | null
  sickHalfPayDays?: number | null
  sickHalfPayDeduction?: number | string | null
  // Loan and "other manual" deduction buckets - populated by the adjustments
  // engine. Sum of all four itemised deductions equals the `deductions` field.
  loanDeduction?: number | string | null
  otherDeduction?: number | string | null
  grossSalary: number
  netSalary: number
  daysWorked?: number | null
}

// Payroll adjustments - see backend/src/db/schema/payroll_adjustments.ts.
export type PayrollAdjustmentKind = 'addition' | 'deduction'
export type PayrollAdjustmentCategory =
  | 'overtime' | 'commission' | 'bonus'
  | 'loan_repayment' | 'salary_advance'
  | 'unpaid_leave' | 'sick_half_pay'
  | 'manual'
export type PayrollAdjustmentSource = 'manual' | 'leave_engine' | 'loan_engine' | 'expense_engine'

export interface PayrollAdjustment {
  id: string
  employeeId: string
  periodYear: number
  periodMonth: number
  kind: PayrollAdjustmentKind
  category: PayrollAdjustmentCategory
  amount: string
  notes: string | null
  source: PayrollAdjustmentSource
  sourceRef: string | null
  createdAt: string
  // Joined fields from the list endpoint
  employeeNo: string | null
  firstName: string
  lastName: string
  department: string | null
  createdByName: string | null
}

// Salary Components (catalog)
export type SalaryComponentKind = 'earning' | 'deduction' | 'benefit' | 'correction'
export type SalaryComponentPayType = 'fixed' | 'variable'
export type SalaryComponentCalcType = 'flat' | 'percentage_of_basic'
export type SalaryComponentFrequency = 'one_time' | 'recurring'

/** GCC social-security schemes a tenant may opt earnings into. */
export const SOCIAL_SECURITY_SCHEMES = ['GPSSA', 'ADPF', 'GOSI', 'SIO', 'SPF', 'PIFSS', 'GRSIA'] as const
export type SocialSecurityScheme = typeof SOCIAL_SECURITY_SCHEMES[number]

export const EARNING_CATEGORIES = ['basic', 'housing', 'transport', 'cost_of_living', 'children_social', 'social', 'custom_allowance'] as const
export const DEDUCTION_CATEGORIES = ['withheld_salary', 'salary_advance', 'fines_damages', 'notice_pay', 'custom'] as const
export const BENEFIT_CATEGORIES = ['medical_insurance', 'custom'] as const
export const CORRECTION_CATEGORIES = ['bonus', 'commission', 'leave_encashment', 'notice_pay', 'annual_leave_salary', 'custom'] as const

export interface SalaryComponent {
  id: string
  tenantId: string
  kind: SalaryComponentKind
  category: string
  name: string
  nameInPayslip: string
  nameInPayslipAr: string | null
  // Earning-only
  payType: SalaryComponentPayType | null
  calculationType: SalaryComponentCalcType | null
  amount: string | null
  proRata: boolean
  applicableSocialSecurity: SocialSecurityScheme[]
  // Deduction / benefit
  frequency: SalaryComponentFrequency | null
  // Status
  isActive: boolean
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

// Leave
export type LeaveType = 'annual' | 'sick' | 'maternity' | 'paternity' | 'hajj' | 'compassionate' | 'unpaid'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: string
  employeeId: string
  employeeName: string
  employeeAvatarUrl?: string | null
  employeeDepartment?: string | null
  leaveType: LeaveType
  startDate: string
  endDate: string
  days: number
  status: LeaveStatus
  reason: string
  approvedBy?: string
  appliedDate: string
  handoverTo?: string | null
  handoverToName?: string | null
  handoverNotes?: string | null
}

// Onboarding
export interface OnboardingStep {
  id: string
  title: string
  owner: string
  sla: number
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  completedDate?: string
  dueDate: string
}

export interface OnboardingChecklist {
  employeeId: string
  employeeName: string
  startDate: string
  progress: number
  steps: OnboardingStep[]
}

// Dashboard KPIs
export interface DashboardKPI {
  label: string
  value: number | string
  change?: number
  changeLabel?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: string
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple'
}

export interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: string
  read: boolean
  actionUrl?: string
}
