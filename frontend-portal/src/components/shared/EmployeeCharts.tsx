import { PieChart, TrendingUp } from 'lucide-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart as RPieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

import { ChartCard } from '@/components/shared/ChartCard'
import { formatCurrency, monthName } from '@/lib/utils'
import type { Payslip } from '@/types'

const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: '1px solid hsl(var(--border))',
    fontSize: 12,
    background: 'hsl(var(--card) / 0.95)',
    backdropFilter: 'blur(8px)',
} as const

/**
 * Donut showing leave used vs. remaining for the current year. Center label
 * is the remaining count. Shows a neutral ring when no data is available.
 */
export function LeaveUsageChart({
    balance,
}: {
    balance: { available: number; taken: number; entitled: number; accrued: number } | undefined
}) {
    const available = balance ? Math.max(0, Math.round(balance.available)) : 0
    const taken = balance ? Math.max(0, Math.round(balance.taken)) : 0
    const total = available + taken

    const data =
        total === 0
            ? [{ name: 'No data', value: 1 }]
            : [
                  { name: 'Available', value: available },
                  { name: 'Taken', value: taken },
              ]
    const COLORS = total === 0 ? ['#e2e8f0'] : ['#6366f1', '#0ea5e9']

    return (
        <ChartCard
            title="Leave usage"
            subtitle={total > 0 ? `${taken} taken of ${total} days` : 'No leave records yet'}
            icon={<PieChart className="size-4 text-indigo-500" />}
            height={220}
        >
            <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                    <Pie
                        data={data}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={total > 0 ? 4 : 0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                    >
                        {data.map((slice, i) => (
                            <Cell key={slice.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                        <foreignObject x="35%" y="35%" width="30%" height="30%">
                            <div className="flex size-full flex-col items-center justify-center">
                                <div className="font-display text-3xl font-bold tabular-figures">{available}</div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {total > 0 ? 'days left' : '—'}
                                </div>
                            </div>
                        </foreignObject>
                    </Pie>
                    {total > 0 ? (
                        <Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={((value: unknown, name: unknown) => [`${value} days`, String(name)]) as any}
                            contentStyle={TOOLTIP_STYLE}
                        />
                    ) : null}
                </RPieChart>
            </ResponsiveContainer>
            {total > 0 ? (
                <div className="-mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Legend swatch="#6366f1" label="Available" value={available} />
                    <Legend swatch="#0ea5e9" label="Taken" value={taken} />
                </div>
            ) : null}
        </ChartCard>
    )
}

/**
 * Area chart of the user's last 6 months of net pay. Newest first in the
 * response — we reverse to get chronological order on the X axis.
 */
export function PayslipTrendChart({ payslips }: { payslips: Payslip[] }) {
    const last6 = payslips.slice(0, 6).reverse()
    const data = last6.map((p) => ({
        label: monthName(p.month).slice(0, 3),
        net: Number(p.netSalary),
        gross: Number(p.grossSalary),
    }))

    return (
        <ChartCard
            title="Net pay trend"
            subtitle={data.length ? `Last ${data.length} payslip${data.length === 1 ? '' : 's'}` : 'No payslips yet'}
            icon={<TrendingUp className="size-4 text-emerald-500" />}
            height={220}
        >
            {data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Your first payslip will show up here.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                            width={36}
                        />
                        <Tooltip
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={((value: unknown) => formatCurrency(value as number)) as any}
                            labelFormatter={(label) => `${label}`}
                            contentStyle={TOOLTIP_STYLE}
                        />
                        <Area
                            type="monotone"
                            dataKey="net"
                            name="Net pay"
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#netGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </ChartCard>
    )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: swatch }} />
            {label} <span className="font-semibold tabular-figures text-foreground">{value}</span>
        </span>
    )
}
