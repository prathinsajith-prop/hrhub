import { useAuthStore } from '@/store/authStore'
import { HRDashboard } from './HRDashboard'
import { ManagerDashboard } from './ManagerDashboard'
import { ProDashboard } from './ProDashboard'
import { EmployeeDashboard } from './EmployeeDashboard'

export function DashboardPage() {
  const role = useAuthStore(s => s.user?.role)
  if (role === 'employee')    return <EmployeeDashboard />
  if (role === 'dept_head')   return <ManagerDashboard />
  if (role === 'pro_officer') return <ProDashboard />
  return <HRDashboard />
}
