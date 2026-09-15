'use client'

import Link from 'next/link'
import { CircleDollarSign, Clock3, Download, Gavel, Layers3, TrendingUp, CircleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dashboardAlerts } from '@/lib/landsight/dashboard-scope'
import { exportProjects, number } from '@/lib/landsight/format'
import { summarize } from '@/lib/landsight/risk'
import type { Project } from '@/lib/landsight/types'
import { useAlerts, useWorkspace } from './provider'
import { EmptyState, ErrorState, KpiCard, Panel, RiskBadge, ViewLink } from './shared'

export function DashboardExport({ projects }: { projects: Project[] }) {
  const { user, filters, addAudit } = useWorkspace()
  return <Button variant="outline" size="lg" disabled={!projects.length} onClick={() => {
    exportProjects(projects)
    addAudit('Exported synthetic dashboard report', 'Scoped projects', 'Success', { details: `Downloaded ${projects.length} synthetic projects from the ${user.role} dashboard. Project IDs: ${projects.map(p => p.id).join(', ')}. Filters: ${JSON.stringify(filters)}.` })
    toast.success('Synthetic project report downloaded')
  }}><Download data-icon="inline-start"/>Export report</Button>
}

export function DeliveryMetrics({ projects, selected = false }: { projects: Project[]; selected?: boolean }) {
  const stats = summarize(projects)
  const legal = projects.reduce((sum, p) => sum + p.legalCases, 0)
  const approvals = projects.reduce((sum, p) => sum + p.approvalsPending, 0)
  const compensation = projects.length ? Math.round(projects.reduce((sum, p) => sum + 100 - p.compensationPaid, 0) / projects.length) : 0
  const approvalDays = projects.length ? Math.round(projects.reduce((sum, p) => sum + p.approvalDays, 0) / projects.length) : 0
  return <section aria-label={selected ? 'Selected project delivery indicators' : 'Regional delivery indicators'} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    <KpiCard title={selected ? 'Acquisition progress' : 'Avg. acquisition progress'} value={`${stats.progress}%`} detail={selected ? `${number(projects[0].acquiredParcels)} parcels acquired` : 'Unweighted project average'} icon={TrendingUp}/>
    <KpiCard title="Pending land parcels" value={number(stats.pending)} detail="Awaiting acquisition" icon={Layers3} accent="medium"/>
    <KpiCard title="Compensation pending" value={`${compensation}%`} detail={selected ? 'Share of project budget' : 'Unweighted project average'} icon={CircleDollarSign} accent="medium"/>
    <KpiCard title="Unresolved legal cases" value={number(legal)} detail="Legal review required" icon={Gavel} accent="high"/>
    <KpiCard title="Pending clearances" value={approvals} detail={`${approvalDays} approval days${selected ? '' : ' on average'}`} icon={CircleAlert} accent="high"/>
    <KpiCard title={selected ? 'Predicted delay' : 'Avg. predicted delay'} value={`${stats.averageDelay} days`} detail="Synthetic demonstration estimate" icon={Clock3} accent="medium"/>
  </section>
}

export function DashboardAlerts({ projects }: { projects: Project[] }) {
  const { data, error, isLoading, mutate } = useAlerts()
  const alerts = dashboardAlerts(data ?? [], projects)
  return <Panel title="Regional action alerts" description="Open and acknowledged issues in the current region, highest severity first." action={<ViewLink href="/alerts">Alert workspace</ViewLink>}>
    {error ? <ErrorState reset={() => void mutate()}/> : isLoading ? <p role="status" className="text-xs text-muted-foreground">Loading regional alerts…</p> : !alerts.length ? <EmptyState title="No outstanding regional alerts" description="No open or acknowledged alerts match the current regional filters."/> : <ul className="flex flex-col divide-y">{alerts.slice(0, 5).map(a => <li key={a.id} className="flex flex-wrap items-start gap-3 py-4 first:pt-0">
      <RiskBadge level={a.severity}/><div className="min-w-0 flex-1"><h3 className="text-xs font-medium">{a.category}</h3><Link href={`/projects/${a.projectId}`} className="mt-1 block text-[11px] text-primary">{a.projectName}</Link><p className="mt-2 text-[11px] text-muted-foreground">{a.reason}</p><p className="mt-2 text-[11px]">{a.action}</p><p className="mt-2 text-[10px] text-muted-foreground">{a.status} · Synthetic alert</p></div>
      <ViewLink href={`/recommendations?project=${a.projectId}`}>Review action</ViewLink>
    </li>)}</ul>}
    {alerts.length > 5 && <p className="mt-3 text-[10px] text-muted-foreground">Showing 5 of {alerts.length} outstanding regional alerts.</p>}
  </Panel>
}
