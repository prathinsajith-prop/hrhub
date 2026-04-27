import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Employee } from '@/types'

export interface MyPayslip {
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

export function useMyEmployee() {
    const employeeId = useAuthStore(s => s.user?.employeeId)
    return useQuery({
        queryKey: ['employees', 'me'],
        queryFn: () => api.get<{ data: Employee }>('/employees/me').then(r => r.data),
        enabled: !!employeeId,
    })
}

export function useUpdateMyProfile() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<Pick<Employee, 'phone' | 'mobileNo' | 'personalEmail' | 'emergencyContact' | 'homeCountryAddress'>>) =>
            api.patch<{ data: Employee }>('/employees/me', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', 'me'] }),
    })
}

export function useMyPayslips() {
    const employeeId = useAuthStore(s => s.user?.employeeId)
    return useQuery({
        queryKey: ['payroll', 'my-payslips'],
        queryFn: () => api.get<{ data: MyPayslip[] }>('/payroll/my-payslips').then(r => r.data ?? []),
        enabled: !!employeeId,
    })
}
