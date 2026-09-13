'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ModelPerformance, Project, RiskFactor } from '@/lib/landsight/types'
import { RISK_COLORS, RISK_LEVELS } from '@/lib/landsight/risk'
import { EmptyState } from './shared'

const config = { value: { label: 'Projects', color: 'var(--chart-1)' }, risk: { label: 'Average risk', color: 'var(--chart-3)' }, delay: { label: 'Average delay (days)', color: 'var(--chart-1)' }, progress: { label: 'Acquired (%)', color: 'var(--chart-1)' }, pending: { label: 'Pending (%)', color: 'var(--chart-5)' }, LOW: { label: 'Low risk', color: 'var(--chart-1)' }, MEDIUM: { label: 'Medium risk', color: 'var(--chart-2)' }, HIGH: { label: 'High risk', color: 'var(--chart-3)' }, CRITICAL: { label: 'Critical risk', color: 'var(--chart-4)' } }
export function RiskDistribution({ projects }: { projects: Project[] }) {
  if (!projects.length) return <EmptyState />
  const data = RISK_LEVELS.map(level => ({ name: level, value: projects.filter(p => p.riskLevel === level).length, fill: `var(--color-${level})` }))
  return <div><ChartContainer config={config} className="mx-auto h-[205px] w-full max-w-72 aspect-auto"><PieChart accessibilityLayer><ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} /><Pie data={data} dataKey="value" nameKey="name" innerRadius={63} outerRadius={84} strokeWidth={3} paddingAngle={2} cornerRadius={3} startAngle={90} endAngle={-270}><Label content={({ viewBox }) => { if (viewBox && 'cx' in viewBox && 'cy' in viewBox) return <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle"><tspan x={viewBox.cx} y={Number(viewBox.cy) - 5} className="fill-foreground text-[32px] font-semibold">{projects.length}</tspan><tspan x={viewBox.cx} y={Number(viewBox.cy) + 20} className="fill-muted-foreground text-[10px]">Total projects</tspan></text>; return null }} /></Pie></PieChart></ChartContainer><div className="grid grid-cols-2 gap-x-7 gap-y-3 px-1">{data.map(d => <div key={d.name} className="flex items-center gap-2 text-[11px]"><span className="size-2 rounded-sm" style={{ background: RISK_COLORS[d.name] }}/><span className="flex-1 text-muted-foreground">{d.name.charAt(0) + d.name.slice(1).toLowerCase()}</span><span className="font-semibold">{d.value}</span><span className="w-7 text-right text-[9px] text-muted-foreground">{Math.round(d.value / projects.length * 100)}%</span></div>)}</div></div>
}
export function groupProjects(projects: Project[], key: 'state' | 'district' | 'type') {
  return [...new Set(projects.map(p => p[key]))].map(name => { const group = projects.filter(p => p[key] === name); return { name, value: group.length, risk: Math.round(group.reduce((s, p) => s + p.riskScore, 0) / group.length), progress: Math.round(group.reduce((s, p) => s + p.progress, 0) / group.length), legal: group.reduce((s, p) => s + p.legalCases, 0), compensation: Math.round(group.reduce((s, p) => s + 100 - p.compensationPaid, 0) / group.length) } }).sort((a, b) => b.value - a.value || b.risk - a.risk)
}
export function StateChart({ projects, metric = 'value', groupBy = 'state' }: { projects: Project[]; metric?: 'value' | 'risk'; groupBy?: 'state' | 'district' | 'type' }) {
  const data = groupProjects(projects, groupBy).slice(0, 6)
  return <ChartContainer config={config} className="h-[220px] w-full aspect-auto"><BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }} accessibilityLayer><CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} domain={metric === 'risk' ? [0, 100] : undefined} fontSize={9}/><YAxis type="category" dataKey="name" width={95} axisLine={false} tickLine={false} fontSize={9} tickFormatter={v => v === 'Road infrastructure' ? 'Road' : v}/><ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'var(--muted)' }}/><Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[0, 3, 3, 0]} barSize={12}>{data.map((d, i) => <Cell key={d.name} fill={metric === 'risk' ? (d.risk > 80 ? 'var(--chart-4)' : d.risk > 60 ? 'var(--chart-3)' : d.risk > 30 ? 'var(--chart-2)' : 'var(--chart-1)') : i === 0 ? 'var(--chart-1)' : 'var(--chart-5)'} />)}</Bar></BarChart></ChartContainer>
}
export function DelayTrend({ projects }: { projects: Project[] }) {
  const offsets = [{ month: 'Apr', multiplier: -2 }, { month: 'May', multiplier: -1.4 }, { month: 'Jun', multiplier: -.5 }, { month: 'Jul', multiplier: -.8 }, { month: 'Aug', multiplier: -1 }, { month: 'Sep', multiplier: 0 }]
  const data = offsets.map(({ month, multiplier }) => ({ month, delay: projects.length ? Math.round(projects.reduce((sum, p) => sum + Math.max(0, p.expectedDelay + p.riskChange * multiplier), 0) / projects.length) : 0 }))
  return <div><ChartContainer config={config} className="h-[208px] w-full aspect-auto"><AreaChart data={data} margin={{ left: -22, right: 10, top: 12 }} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={10} tickMargin={12}/><YAxis axisLine={false} tickLine={false} fontSize={9} unit="d"/><ChartTooltip content={<ChartTooltipContent />} /><Area type="monotone" dataKey="delay" stroke="var(--color-delay)" strokeWidth={2} fill="var(--color-delay)" fillOpacity={.08} dot={{ r: 3, fill: 'var(--color-delay)', stroke: 'white', strokeWidth: 2 }} /></AreaChart></ChartContainer><p className="mt-2 text-[9px] text-muted-foreground">Illustrative monthly snapshots · not observed historical data</p></div>
}
export function ProgressChart({ projects }: { projects: Project[] }) {
  const data = groupProjects(projects, 'type').map(p => ({ ...p, name: p.name === 'Road infrastructure' ? 'Road' : p.name, pending: 100 - p.progress }))
  return <ChartContainer config={config} className="h-[230px] w-full aspect-auto"><BarChart data={data} margin={{ left: -25, right: 0 }} accessibilityLayer><CartesianGrid vertical={false} strokeDasharray="3 3"/><XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={9}/><YAxis axisLine={false} tickLine={false} fontSize={9} unit="%"/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="progress" stackId="a" fill="var(--color-progress)" barSize={22}/><Bar dataKey="pending" stackId="a" fill="var(--color-pending)" fillOpacity={.35} radius={[3, 3, 0, 0]}/></BarChart></ChartContainer>
}
export function ModelImportanceChart({ data }: { data: ModelPerformance['featureImportance'] }) {
  return <div>
    <ChartContainer config={{ importance: { label: 'Absolute contribution share (%)', color: 'var(--chart-1)' } }} className="h-[280px] w-full aspect-auto">
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 18 }} accessibilityLayer>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={value => `${value}%`} axisLine={false} tickLine={false} fontSize={10} />
        <YAxis type="category" dataKey="name" width={132} axisLine={false} tickLine={false} fontSize={9} />
        <ChartTooltip content={<ChartTooltipContent formatter={value => `${Number(value).toFixed(1)}%`} />} />
        <Bar dataKey="importance" fill="var(--color-importance)" radius={[0, 3, 3, 0]} barSize={16} />
      </BarChart>
    </ChartContainer>
    <ul className="sr-only">{data.map(item => <li key={item.name}>{item.name}: {item.importance.toFixed(1)} percent of absolute contributions.</li>)}</ul>
  </div>
}
export function FactorChart({ factors, contributionLabel = 'Risk contribution (points)' }: { factors: RiskFactor[]; contributionLabel?: string }) {
  const data = [...factors].sort((a, b) => b.contribution - a.contribution)
  return <ChartContainer config={{ contribution: { label: contributionLabel, color: 'var(--chart-3)' } }} className="h-[270px] w-full aspect-auto"><BarChart data={data} layout="vertical" margin={{ right: 20, left: 0 }} accessibilityLayer><CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" axisLine={false} tickLine={false} fontSize={10}/><YAxis type="category" dataKey="name" width={143} axisLine={false} tickLine={false} fontSize={10}/><ReferenceLine x={0} stroke="var(--border)"/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="contribution" radius={3} barSize={17}>{data.map(d => <Cell key={d.id} fill={d.contribution < 0 ? 'var(--chart-1)' : 'var(--chart-3)'}/>)}</Bar></BarChart></ChartContainer>
}
