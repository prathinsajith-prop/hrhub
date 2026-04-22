import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePayrollTrend } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/utils'

export function ChartAreaInteractive() {
  const { data: trend, isLoading } = usePayrollTrend()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payroll Trend</CardTitle>
        <CardDescription>Net payroll disbursed over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="payrollGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                width={48}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Net Payroll']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#payrollGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
