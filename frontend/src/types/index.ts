// Auth & Tenant
export type UserRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
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
export type EmployeeStatus = 'active' | 'onboarding' | 'probation' | 'suspended' | 'terminated' | 'visa_expired'

export interface Employee {
  id: string
  tenantId: string
  entityId: string
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
  reportingTo?: string
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
  iban?: string
  visaStatus?: VisaStatus
  visaExpiry?: string
  visaNumber?: string
  visaIssueDate?: string
  visaType?: 'employment' | 'investor' | 'dependent' | 'mission'
  passportExpiry?: string
  emiratesIdExpiry?: string
  sponsoringEntity?: string
  avatar?: string
  avatarUrl?: string
  emiratisationCategory?: 'emirati' | 'expat'
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed'
  gradeLevel?: string
  managerName?: string
  labourCardNumber?: string
  emergencyContact?: string
  homeCountryAddress?: string
  contractType?: 'permanent' | 'contract' | 'part_time'
  workLocation?: string
  probationEndDate?: string
  contractEndDate?: string
}

// Recruitment
export type JobStatus = 'draft' | 'open' | 'closed' | 'on_hold'
export type ApplicationStage = 'received' | 'screening' | 'interview' | 'assessment' | 'offer' | 'pre_boarding' | 'rejected'

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
  fileSize: number
  uploadedAt: string
  uploadedBy: string
  expiryDate?: string
  status: DocStatus
  verified: boolean
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
  month: number
  year: number
  basicSalary: number
  housingAllowance: number
  transportAllowance: number
  otherAllowances: number
  overtime: number
  deductions: number
  grossSalary: number
  netSalary: number
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
