import type { Employee, Job, Candidate, VisaApplication, Document, PayrollRun, LeaveRequest, Notification, OnboardingChecklist } from '@/types'

export const mockEmployees: Employee[] = [
  { id: 'E001', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-001', firstName: 'Ahmed', lastName: 'Al Mansouri', fullName: 'Ahmed Al Mansouri', email: 'ahmed.mansouri@company.ae', phone: '+971 50 123 4567', nationality: 'Emirati', passportNo: 'AE12345678', emiratesId: '784-1985-1234567-1', dateOfBirth: '1985-03-15', gender: 'male', department: 'Sales', designation: 'Senior Property Consultant', joinDate: '2022-01-10', status: 'active', basicSalary: 12000, totalSalary: 18000, visaStatus: 'active', visaExpiry: '2026-01-10', passportExpiry: '2027-03-15', emiratisationCategory: 'emirati' },
  { id: 'E002', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-002', firstName: 'Sarah', lastName: 'Johnson', fullName: 'Sarah Johnson', email: 'sarah.j@company.ae', phone: '+971 55 234 5678', nationality: 'British', passportNo: 'GB87654321', emiratesId: '784-1990-2345678-2', dateOfBirth: '1990-07-22', gender: 'female', department: 'HR', designation: 'HR Manager', joinDate: '2021-06-01', status: 'active', basicSalary: 15000, totalSalary: 22000, visaStatus: 'expiring_soon', visaExpiry: '2025-05-15', passportExpiry: '2028-07-22', emiratisationCategory: 'expat' },
  { id: 'E003', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-003', firstName: 'Rahul', lastName: 'Sharma', fullName: 'Rahul Sharma', email: 'rahul.s@company.ae', phone: '+971 52 345 6789', nationality: 'Indian', passportNo: 'IN11223344', dateOfBirth: '1988-11-05', gender: 'male', department: 'Finance', designation: 'Senior Accountant', joinDate: '2020-03-15', status: 'active', basicSalary: 10000, totalSalary: 15000, visaStatus: 'active', visaExpiry: '2026-03-15', passportExpiry: '2026-11-05', emiratisationCategory: 'expat' },
  { id: 'E004', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-004', firstName: 'Maria', lastName: 'Santos', fullName: 'Maria Santos', email: 'maria.s@company.ae', phone: '+971 56 456 7890', nationality: 'Filipino', passportNo: 'PH55667788', dateOfBirth: '1993-04-18', gender: 'female', department: 'Admin', designation: 'Executive Assistant', joinDate: '2023-02-01', status: 'probation', basicSalary: 6000, totalSalary: 9000, visaStatus: 'active', visaExpiry: '2026-02-01', passportExpiry: '2027-04-18', emiratisationCategory: 'expat' },
  { id: 'E005', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-005', firstName: 'Mohammad', lastName: 'Al Rashidi', fullName: 'Mohammad Al Rashidi', email: 'mo.rashidi@company.ae', phone: '+971 50 567 8901', nationality: 'Emirati', passportNo: 'AE99887766', emiratesId: '784-1987-3456789-3', dateOfBirth: '1987-09-30', gender: 'male', department: 'Operations', designation: 'Operations Manager', joinDate: '2019-08-20', status: 'active', basicSalary: 18000, totalSalary: 26000, visaStatus: 'active', visaExpiry: '2026-08-20', passportExpiry: '2028-09-30', emiratisationCategory: 'emirati' },
  { id: 'E006', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-006', firstName: 'Priya', lastName: 'Nair', fullName: 'Priya Nair', email: 'priya.n@company.ae', phone: '+971 54 678 9012', nationality: 'Indian', passportNo: 'IN44556677', dateOfBirth: '1992-12-08', gender: 'female', department: 'Marketing', designation: 'Marketing Executive', joinDate: '2023-08-01', status: 'onboarding', basicSalary: 8000, totalSalary: 12000, visaStatus: 'entry_permit', passportExpiry: '2027-12-08', emiratisationCategory: 'expat' },
  { id: 'E007', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-007', firstName: 'James', lastName: 'Williams', fullName: 'James Williams', email: 'james.w@company.ae', phone: '+971 58 789 0123', nationality: 'American', passportNo: 'US33445566', dateOfBirth: '1980-06-14', gender: 'male', department: 'Legal', designation: 'Legal Counsel', joinDate: '2020-11-01', status: 'active', basicSalary: 22000, totalSalary: 32000, visaStatus: 'active', visaExpiry: '2026-11-01', passportExpiry: '2027-06-14', emiratisationCategory: 'expat' },
  { id: 'E008', tenantId: 't1', entityId: 'en1', employeeNo: 'HR-008', firstName: 'Fatima', lastName: 'Al Zaabi', fullName: 'Fatima Al Zaabi', email: 'fatima.z@company.ae', phone: '+971 55 890 1234', nationality: 'Emirati', passportNo: 'AE11334455', emiratesId: '784-1995-4567890-4', dateOfBirth: '1995-02-28', gender: 'female', department: 'Customer Service', designation: 'Customer Relations Manager', joinDate: '2022-09-15', status: 'active', basicSalary: 11000, totalSalary: 17000, visaStatus: 'active', visaExpiry: '2026-09-15', passportExpiry: '2028-02-28', emiratisationCategory: 'emirati' },
]

export const mockJobs: Job[] = [
  { id: 'J001', title: 'Senior Property Consultant', department: 'Sales', location: 'Dubai Marina', type: 'full_time', status: 'open', openings: 3, applications: 28, postedDate: '2025-03-01', closingDate: '2025-05-31', minSalary: 10000, maxSalary: 18000, industry: 'real_estate', description: 'Lead property sales and client acquisition.', requirements: ['RERA licensed', '3+ years UAE real estate', 'Arabic preferred'] },
  { id: 'J002', title: 'HR Manager', department: 'HR', location: 'Business Bay', type: 'full_time', status: 'open', openings: 1, applications: 14, postedDate: '2025-03-10', closingDate: '2025-04-30', minSalary: 14000, maxSalary: 20000, industry: 'real_estate', description: 'Oversee all HR functions and compliance.', requirements: ['UAE HR experience', 'CIPD preferred', 'WPS knowledge'] },
  { id: 'J003', title: 'Site Safety Officer', department: 'Operations', location: 'Various Sites', type: 'full_time', status: 'open', openings: 2, applications: 19, postedDate: '2025-02-20', closingDate: '2025-05-15', minSalary: 7000, maxSalary: 12000, industry: 'construction', description: 'Ensure site safety compliance per UAE standards.', requirements: ['NEBOSH certificate', '2+ years construction', 'First aid certified'] },
  { id: 'J004', title: 'Tour Operations Manager', department: 'Operations', location: 'Downtown Dubai', type: 'full_time', status: 'closed', openings: 1, applications: 31, postedDate: '2025-01-15', closingDate: '2025-03-01', minSalary: 12000, maxSalary: 16000, industry: 'travel_tourism', description: 'Manage inbound and outbound tour operations.', requirements: ['DTCM knowledge', '5+ years tourism', 'IATA certification'] },
  { id: 'J005', title: 'Registered Nurse', department: 'Clinical', location: 'Dubai Healthcare City', type: 'full_time', status: 'open', openings: 4, applications: 42, postedDate: '2025-03-15', closingDate: '2025-06-30', minSalary: 8000, maxSalary: 14000, industry: 'healthcare', description: 'Patient care in clinical setting.', requirements: ['DHA license required', 'BSN degree', '2+ years ICU preferred'] },
]

export const mockCandidates: Candidate[] = [
  { id: 'C001', jobId: 'J001', name: 'Khalid Al Hamdan', email: 'khalid@email.com', phone: '+971 50 111 2222', nationality: 'Emirati', stage: 'interview', score: 85, appliedDate: '2025-03-05', experience: 5, expectedSalary: 16000 },
  { id: 'C002', jobId: 'J001', name: 'Deepak Menon', email: 'deepak@email.com', phone: '+971 55 222 3333', nationality: 'Indian', stage: 'screening', score: 72, appliedDate: '2025-03-08', experience: 4, expectedSalary: 14000 },
  { id: 'C003', jobId: 'J001', name: 'Anna Kowalski', email: 'anna@email.com', phone: '+971 52 333 4444', nationality: 'Polish', stage: 'offer', score: 91, appliedDate: '2025-03-02', experience: 7, expectedSalary: 17000 },
  { id: 'C004', jobId: 'J002', name: 'Zainab Al Qassimi', email: 'zainab@email.com', phone: '+971 56 444 5555', nationality: 'Emirati', stage: 'assessment', score: 88, appliedDate: '2025-03-12', experience: 6, expectedSalary: 19000 },
  { id: 'C005', jobId: 'J002', name: 'Lisa Chen', email: 'lisa@email.com', phone: '+971 58 555 6666', nationality: 'Chinese', stage: 'received', score: 65, appliedDate: '2025-03-18', experience: 3, expectedSalary: 15000 },
  { id: 'C006', jobId: 'J005', name: 'Amara Diallo', email: 'amara@email.com', phone: '+971 54 666 7777', nationality: 'Guinean', stage: 'pre_boarding', score: 94, appliedDate: '2025-03-16', experience: 5, expectedSalary: 12000 },
]

export const mockVisaApplications: VisaApplication[] = [
  { id: 'V001', employeeId: 'E006', employeeName: 'Priya Nair', visaType: 'employment_new', status: 'eid_pending', currentStep: 5, totalSteps: 8, mohreRef: 'MOHRE-2025-44521', startDate: '2025-03-01', urgencyLevel: 'normal' },
  { id: 'V002', employeeId: 'E002', employeeName: 'Sarah Johnson', visaType: 'employment_renewal', status: 'expiring_soon', currentStep: 2, totalSteps: 6, mohreRef: 'MOHRE-2025-44612', gdfrRef: 'GDRFA-2025-89341', startDate: '2025-03-20', expiryDate: '2025-05-15', urgencyLevel: 'critical' },
  { id: 'V003', employeeId: 'E003', employeeName: 'Rahul Sharma', visaType: 'employment_renewal', status: 'stamping', currentStep: 6, totalSteps: 6, mohreRef: 'MOHRE-2025-44733', gdfrRef: 'GDRFA-2025-89422', startDate: '2025-02-15', expiryDate: '2026-03-15', urgencyLevel: 'normal' },
  { id: 'V004', employeeId: 'E007', employeeName: 'James Williams', visaType: 'employment_renewal', status: 'entry_permit', currentStep: 1, totalSteps: 6, startDate: '2025-04-01', expiryDate: '2026-11-01', urgencyLevel: 'normal' },
  { id: 'V005', employeeId: 'E004', employeeName: 'Maria Santos', visaType: 'dependant', status: 'medical_pending', currentStep: 3, totalSteps: 7, mohreRef: 'MOHRE-2025-44890', startDate: '2025-03-10', urgencyLevel: 'urgent' },
]

export const mockDocuments: Document[] = [
  { id: 'D001', employeeId: 'E001', employeeName: 'Ahmed Al Mansouri', category: 'identity', docType: 'Passport', fileName: 'passport_ahmed.pdf', fileSize: 1240000, uploadedAt: '2024-01-10', uploadedBy: 'Sarah Johnson', expiryDate: '2027-03-15', status: 'valid', verified: true },
  { id: 'D002', employeeId: 'E002', employeeName: 'Sarah Johnson', category: 'visa', docType: 'Residence Visa', fileName: 'visa_sarah.pdf', fileSize: 980000, uploadedAt: '2024-06-01', uploadedBy: 'PRO Officer', expiryDate: '2025-05-15', status: 'expiring_soon', verified: true },
  { id: 'D003', employeeId: 'E003', employeeName: 'Rahul Sharma', category: 'identity', docType: 'Emirates ID', fileName: 'eid_rahul.pdf', fileSize: 560000, uploadedAt: '2024-03-15', uploadedBy: 'PRO Officer', expiryDate: '2026-03-15', status: 'valid', verified: true },
  { id: 'D004', employeeId: 'E001', employeeName: 'Ahmed Al Mansouri', category: 'qualification', docType: 'RERA License', fileName: 'rera_ahmed.pdf', fileSize: 720000, uploadedAt: '2024-01-10', uploadedBy: 'HR Manager', expiryDate: '2025-04-30', status: 'expiring_soon', verified: true },
  { id: 'D005', employeeId: 'E007', employeeName: 'James Williams', category: 'employment', docType: 'Employment Contract', fileName: 'contract_james.pdf', fileSize: 1850000, uploadedAt: '2020-11-01', uploadedBy: 'HR Manager', status: 'valid', verified: true },
  { id: 'D006', employeeId: 'E005', employeeName: 'Mohammad Al Rashidi', category: 'identity', docType: 'Passport', fileName: 'passport_mo.pdf', fileSize: 1120000, uploadedAt: '2023-08-20', uploadedBy: 'PRO Officer', expiryDate: '2028-09-30', status: 'valid', verified: true },
  { id: 'D007', employeeId: 'E006', employeeName: 'Priya Nair', category: 'visa', docType: 'Entry Permit', fileName: 'ep_priya.pdf', fileSize: 430000, uploadedAt: '2025-03-05', uploadedBy: 'PRO Officer', status: 'under_review', verified: false },
]

export const mockPayrollRuns: PayrollRun[] = [
  { id: 'PR001', month: 3, year: 2025, status: 'paid', totalEmployees: 248, totalGross: 4820000, totalDeductions: 145000, totalNet: 4675000, wpsFileRef: 'WPS-2025-03-001', processedDate: '2025-03-27' },
  { id: 'PR002', month: 4, year: 2025, status: 'wps_submitted', totalEmployees: 251, totalGross: 4890000, totalDeductions: 148000, totalNet: 4742000, wpsFileRef: 'WPS-2025-04-001', processedDate: '2025-04-25' },
  { id: 'PR003', month: 5, year: 2025, status: 'draft', totalEmployees: 253, totalGross: 4920000, totalDeductions: 150000, totalNet: 4770000 },
]

export const mockLeaveRequests: LeaveRequest[] = [
  { id: 'L001', employeeId: 'E001', employeeName: 'Ahmed Al Mansouri', leaveType: 'annual', startDate: '2025-05-01', endDate: '2025-05-15', days: 15, status: 'approved', reason: 'Family vacation', approvedBy: 'Sarah Johnson', appliedDate: '2025-04-10' },
  { id: 'L002', employeeId: 'E003', employeeName: 'Rahul Sharma', leaveType: 'sick', startDate: '2025-04-18', endDate: '2025-04-20', days: 3, status: 'pending', reason: 'Medical appointment', appliedDate: '2025-04-17' },
  { id: 'L003', employeeId: 'E004', employeeName: 'Maria Santos', leaveType: 'annual', startDate: '2025-06-01', endDate: '2025-06-07', days: 7, status: 'pending', reason: 'Home visit', appliedDate: '2025-04-15' },
  { id: 'L004', employeeId: 'E008', employeeName: 'Fatima Al Zaabi', leaveType: 'compassionate', startDate: '2025-04-12', endDate: '2025-04-14', days: 3, status: 'approved', reason: 'Family bereavement', approvedBy: 'Sarah Johnson', appliedDate: '2025-04-12' },
]

export const mockNotifications: Notification[] = [
  { id: 'N001', type: 'warning', title: 'Visa Expiring Soon', message: "Sarah Johnson's residence visa expires in 25 days. Renewal required immediately.", timestamp: '2025-04-19T09:00:00Z', read: false, actionUrl: '/visa' },
  { id: 'N002', type: 'warning', title: 'Document Expiry Alert', message: "Ahmed Al Mansouri's RERA license expires in 10 days.", timestamp: '2025-04-19T08:30:00Z', read: false, actionUrl: '/documents' },
  { id: 'N003', type: 'info', title: 'Onboarding Update', message: 'Priya Nair has completed medical fitness test. Next step: Emirates ID biometrics.', timestamp: '2025-04-18T14:22:00Z', read: false, actionUrl: '/onboarding' },
  { id: 'N004', type: 'success', title: 'WPS Submission Confirmed', message: 'April 2025 payroll WPS submission accepted by bank. 251 employees paid.', timestamp: '2025-04-18T11:00:00Z', read: true },
  { id: 'N005', type: 'error', title: 'Emiratisation Alert', message: 'Current Emiratisation ratio is 1.8%, below the 2% MOHRE requirement. Action required.', timestamp: '2025-04-17T09:00:00Z', read: false, actionUrl: '/compliance' },
  { id: 'N006', type: 'info', title: 'New Job Application', message: '6 new applications received for Senior Property Consultant position.', timestamp: '2025-04-17T16:45:00Z', read: true, actionUrl: '/recruitment/pipeline' },
]

export const mockOnboarding: OnboardingChecklist[] = [
  {
    employeeId: 'E006',
    employeeName: 'Priya Nair',
    startDate: '2025-08-01',
    progress: 50,
    steps: [
      { id: 's1', title: 'Offer Acceptance', owner: 'HR Manager', sla: 3, status: 'completed', completedDate: '2025-03-02', dueDate: '2025-03-04' },
      { id: 's2', title: 'Medical Fitness Test', owner: 'PRO Officer', sla: 5, status: 'completed', completedDate: '2025-03-10', dueDate: '2025-03-09' },
      { id: 's3', title: 'Emirates ID Application', owner: 'PRO Officer', sla: 7, status: 'in_progress', dueDate: '2025-04-25' },
      { id: 's4', title: 'Labour Card Application', owner: 'PRO Officer', sla: 5, status: 'pending', dueDate: '2025-04-30' },
      { id: 's5', title: 'Bank Account Opening', owner: 'Employee', sla: 7, status: 'pending', dueDate: '2025-05-07' },
      { id: 's6', title: 'Insurance Enrolment', owner: 'HR Manager', sla: 3, status: 'pending', dueDate: '2025-05-05' },
      { id: 's7', title: 'IT Provisioning', owner: 'IT Admin', sla: 2, status: 'pending', dueDate: '2025-04-27' },
      { id: 's8', title: 'Orientation & Training', owner: 'Dept Head', sla: 5, status: 'pending', dueDate: '2025-05-12' },
    ]
  }
]
