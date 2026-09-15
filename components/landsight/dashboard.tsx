'use client'

import Link from 'next/link'
import { ArrowRight, ArrowUpRight, CircleAlert, Clock3, Download, FolderKanban, Layers3, MapPinned, ScanLine, Sparkles, Target, TrendingUp } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWorkspace } from './provider'
import { DataBoundary, FilterEmpty, KpiCard, PageHeader, Panel, ViewLink } from './shared'
import { ProjectFilters } from './filters'
import { ProjectTable } from './project-table'
import ProjectMap, { MapLegend } from './project-map'
import { DelayTrend, ProgressChart, RiskDistribution, StateChart } from './charts'
import { filterProjects } from '@/lib/landsight/service'
import { summarize } from '@/lib/landsight/risk'
import { ROLE_PROFILES } from '@/lib/landsight/data'
import { exportProjects, number } from '@/lib/landsight/format'
import { toast } from 'sonner'
import type { Project } from '@/lib/landsight/types'

import { OfficerDashboard } from './officer-dashboard'
import { ManagerDashboard } from './manager-dashboard'

export function Dashboard() {
  const { user } = useWorkspace()
  return <DataBoundary>{projects => user.role === 'State/District Officer'
    ? <OfficerDashboard key={user.role} allProjects={projects}/>
    : user.role === 'Project Manager'
      ? <ManagerDashboard key={user.role} allProjects={projects}/>
      : <DashboardContent key={user.role} allProjects={projects}/>}</DataBoundary>
}
function DashboardContent({ allProjects }: { allProjects: Project[] }) {
  const { filters, addAudit, user, permissions } = useWorkspace()
  const profile = ROLE_PROFILES[user.role]
  const projects = filterProjects(allProjects, filters)
  const stats = summarize(projects)
  const attention = projects.filter(p => p.riskScore > 60)
  const highRisk = [...projects].filter(p => p.riskScore > 60).sort((a, b) => b.riskScore - a.riskScore)
  const factors = projects[0]?.prediction.factors.map(f => ({ name: f.name, count: projects.filter(p => p.primaryRisk === f.name).length })).filter(f => f.count).sort((a, b) => b.count - a.count) ?? []
  return <div className="page-stack">
<PageHeader eyebrow={profile.eyebrow} title={profile.title} description={user.role === 'Admin' ? 'See the risks ahead. Keep infrastructure moving forward.' : `${user.role} UI preview · All figures follow the current filters.`}>
<Button variant="outline" size="lg" disabled={!projects.length} onClick={() => { exportProjects(projects); addAudit('Exported synthetic dashboard report', 'Filtered projects', 'Success', { details: `Downloaded ${projects.length} synthetic projects as CSV from the ${user.role} dashboard. Filters: ${JSON.stringify(filters)}.` }); toast.success('Synthetic project report downloaded') }}>
<Download data-icon="inline-start"/>Export report</Button>
<Link href={profile.href} className={buttonVariants({ size: 'lg' })}>
<ScanLine data-icon="inline-start"/>{profile.action}</Link>
</PageHeader>
<ProjectFilters projects={allProjects} date />{!projects.length ? <FilterEmpty/> : <>
<section aria-label="Executive key performance indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6 xl:grid-cols-6">
<KpiCard title="Active projects" value={stats.total} detail={`Across ${stats.states} states`} icon={FolderKanban}/>
<KpiCard title="High / critical risk" value={stats.highRisk} detail={`${stats.critical} require urgent review`} icon={CircleAlert} accent="critical"/>
<KpiCard title="Avg. acquisition progress" value={<>{stats.progress}<span className="text-lg">%</span>
</>} detail="Average across projects" icon={TrendingUp}/>
<KpiCard title="Pending land parcels" value={number(stats.pending)} detail="Awaiting acquisition" icon={Layers3} accent="medium"/>
<KpiCard title="Projects at risk" value={<>{stats.atRiskPercent}<span className="text-lg">%</span></>} detail="Share with risk above 60" icon={Target} accent="high"/>
<KpiCard title="Avg. predicted delay" value={<>{stats.averageDelay}<span className="ml-1 text-base font-medium text-muted-foreground">days</span></>} detail="Demonstration prediction" icon={Clock3} accent="medium"/>
</section>
<div className="flex flex-wrap items-center gap-4 rounded-lg border border-primary/15 bg-secondary/55 px-4 py-3.5">
<span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-card text-primary">
<Sparkles className="size-4"/>
</span>
<div className="flex-1">
<div className="flex flex-wrap items-center gap-2">
<h2 className="text-xs font-semibold">{stats.critical > 0 ? `${stats.critical} projects need your attention` : 'Your selected portfolio is below critical risk'}</h2>
<Badge variant="outline">{user.role === 'Admin' ? 'DEMO INSIGHT' : 'ROLE PREVIEW'}</Badge>
</div>
<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{user.role !== 'Admin' ? `${profile.focus} ${permissions.summary} These are demo UI permissions, not server-enforced access controls.` : highRisk.length ? 'Unresolved legal cases and compensation bottlenecks are driving acquisition delays. Early action can make a difference.' : 'Continue monitoring clearances, compensation, and parcel possession to maintain progress.'}</p>
</div>
<Link href="/recommendations" className="small-link shrink-0">Review recommendations<ArrowRight className="size-3.5"/>
</Link>
</div>
<div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
<Panel title="Geographic risk overview" description="Project-level acquisition risk across India" action={<ViewLink href="/gis">Open GIS map</ViewLink>} flush footer={<div className="flex w-full flex-wrap items-center justify-between gap-3">
<MapLegend/>
<span className="text-[9px] text-muted-foreground">{projects.length} project locations</span>
</div>}>
<div className="relative h-[301px]">
<ProjectMap projects={projects} compact/>
<div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-md border bg-card/95 px-2.5 py-1.5 text-[10px] shadow-sm">
<MapPinned className="size-3 text-primary"/>India · National view</div>
</div>
</Panel>
<Panel title="Risk distribution" description="A clear view of your acquisition portfolio" action={<Badge variant="outline">{projects.length} projects</Badge>} footer={<Link href="/projects" className="flex w-full items-center justify-between text-[11px] text-primary">
<span>
<strong>{stats.highRisk}</strong> projects above the high-risk threshold</span>
<ArrowUpRight className="size-3.5"/>
</Link>}>
<RiskDistribution projects={projects}/>
</Panel>
</div>
<Panel title="Projects requiring attention" description="High and critical-risk projects, prioritized by delay risk score" action={<ViewLink href="/projects">View all projects</ViewLink>} flush>
<ProjectTable projects={attention} pageSize={5}/>
</Panel>
<div className="grid gap-5 xl:grid-cols-3">
<Panel title="Projects by state" description="Top states by number of active projects">
<StateChart projects={projects} groupBy="state"/>
</Panel>
<Panel title="Predicted delay trend" description="Average expected delay · Apr–Sep 2026">
<DelayTrend projects={projects}/>
</Panel>
<Panel title="Leading delay factors" description="Primary drivers across the selected portfolio">
<div className="flex flex-col gap-5 pt-5">{factors.map((f, i) => <div key={f.name}>
<div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
<span className="flex items-center gap-2">
<span className="text-[10px] text-muted-foreground">0{i + 1}</span>{f.name}</span>
<span className="font-medium">{f.count}<span className="ml-1 text-[9px] font-normal text-muted-foreground">projects</span>
</span>
</div>
<div className="h-1.5 rounded-full bg-muted">
<div className="h-full rounded-full bg-primary/70" style={{ width: `${f.count / projects.length * 100}%` }}/>
</div>
</div>)}<Link href="/risk-analysis" className="small-link mt-3">Understand the risk drivers<ArrowUpRight className="size-3.5"/>
</Link>
</div>
</Panel>
</div>
<div className="grid gap-5 lg:grid-cols-2">
<Panel title="Acquisition progress" description="Acquired vs. pending land by project type">
<ProgressChart projects={projects}/>
</Panel>
<Panel title="State-wise risk comparison" description="Average demonstration score by state on a 0–100 scale">
<StateChart projects={projects} groupBy="state" metric="risk"/>
</Panel>
</div>
</>}</div>
}
