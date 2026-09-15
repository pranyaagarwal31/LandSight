'use client'

import { CircleAlert, FolderKanban, MapPinned } from 'lucide-react'
import { dashboardScope, demoRegion, regionalPriorities } from '@/lib/landsight/dashboard-scope'
import { summarize } from '@/lib/landsight/risk'
import { ROLE_PROFILES } from '@/lib/landsight/data'
import type { Project } from '@/lib/landsight/types'
import { useWorkspace } from './provider'
import { DemoCallout, FilterEmpty, KpiCard, PageHeader, Panel, ProgressBar, ViewLink } from './shared'
import { ProjectFilters } from './filters'
import { ProjectTable } from './project-table'
import { groupProjects, StateChart } from './charts'
import { DashboardAlerts, DashboardExport, DeliveryMetrics } from './dashboard-panels'

export function OfficerDashboard({ allProjects }: { allProjects: Project[] }) {
  const { filters } = useWorkspace()
  const { state, projects } = dashboardScope(allProjects, 'State/District Officer', filters)
  const stats = summarize(projects)
  const districts = groupProjects(projects, 'district')
  const profile = ROLE_PROFILES['State/District Officer']
  return <div className="page-stack">
    <PageHeader eyebrow={profile.eyebrow} title={profile.title} description={`${state}${filters.district ? ` · ${filters.district}` : ''} · Acquisition monitoring and regional intervention priorities.`}><DashboardExport projects={projects}/></PageHeader>
    <DemoCallout title="Demonstration regional scope">{demoRegion(allProjects)} is the default demo region, not a real officer assignment. Choose another state or district to preview its synthetic records. Dashboard totals, comparisons, and alerts follow this scope; other demo routes remain available.</DemoCallout>
    <ProjectFilters projects={allProjects} defaultState={demoRegion(allProjects)} extended/>
    {!projects.length ? <FilterEmpty/> : <>
      <section aria-label="Regional portfolio indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard title="Regional projects" value={stats.total} detail={state} icon={FolderKanban}/>
        <KpiCard title="High / critical risk" value={stats.highRisk} detail={`${stats.critical} require urgent regional review`} icon={CircleAlert} accent="critical"/>
        <KpiCard title="Districts represented" value={districts.length} detail="Within the selected state" icon={MapPinned}/>
      </section>
      <DeliveryMetrics projects={projects}/>
      <DashboardAlerts projects={projects}/>
      <Panel title="Regional bottlenecks requiring review" description="High risk, unsettled compensation, legal or approval bottlenecks, or acquisition below 60%; ordered by risk." flush>
        <ProjectTable key={JSON.stringify(filters)} projects={regionalPriorities(projects)} pageSize={5}/>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="District risk comparison" description="Average synthetic risk score in each represented district."><StateChart projects={projects} groupBy="district" metric="risk"/></Panel>
        <Panel title="District acquisition and bottlenecks" description="Project averages for progress and compensation; totals for parcels, cases, and clearances." flush>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>District</th><th>Projects</th><th>Acquisition</th><th>Pending parcels</th><th>Compensation pending</th><th>Legal cases</th><th>Clearances</th></tr></thead><tbody>{districts.map(d => {
            const local = projects.filter(p => p.district === d.name)
            return <tr key={d.name}><td>{d.name}</td><td>{d.value}</td><td className="min-w-32"><ProgressBar value={d.progress}/></td><td>{local.reduce((sum, p) => sum + p.pendingParcels, 0).toLocaleString('en-IN')}</td><td>{d.compensation}%</td><td>{d.legal}</td><td>{local.reduce((sum, p) => sum + p.approvalsPending, 0)}</td></tr>
          })}</tbody></table></div>
          {districts.length < 2 && <p className="px-5 pt-3 text-[11px] text-muted-foreground">Only one district is represented in this selection; no cross-district comparison is available.</p>}
        </Panel>
      </div>
      <Panel title="Regional risk review" description="Continue to existing project risk explanations and intervention tools."><div className="flex flex-col gap-4">{projects.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs">{p.name}</span><ViewLink href={`/risk-analysis?project=${p.id}`}>Explain project risk</ViewLink></div>)}</div></Panel>
    </>}
  </div>
}
