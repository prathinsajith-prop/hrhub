import 'dotenv/config'
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const counts = await sql`
  SELECT 'tenants' AS t, count(*)::int n FROM tenants UNION ALL
  SELECT 'users', count(*)::int FROM users UNION ALL
  SELECT 'employees', count(*)::int FROM employees UNION ALL
  SELECT 'recruitment_jobs', count(*) FROM recruitment_jobs UNION ALL
  SELECT 'job_applications', count(*) FROM job_applications UNION ALL
  SELECT 'leave_requests', count(*) FROM leave_requests UNION ALL
  SELECT 'payroll_runs', count(*) FROM payroll_runs UNION ALL
  SELECT 'visa_applications', count(*) FROM visa_applications UNION ALL
  SELECT 'notifications', count(*) FROM notifications UNION ALL
  SELECT 'onboarding_steps', count(*) FROM onboarding_steps
`
console.table(counts)
await sql.end()
