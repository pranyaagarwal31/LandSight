'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { FlaskConical, ScanLine } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { dashboardScope } from '@/lib/landsight/dashboard-scope'
import { recommendationsFor, ROLE_PROFILES } from '@/lib/landsight/data'
import type { Project } from '@/lib/landsight/types'
import { useWorkspace } from './provider'
import { DemoCallout, FilterEmpty, PageHeader, Panel, ProgressBar, RiskBadge, ViewLink } from './shared'
import { ProjectFilters } from './filters'
import { ProjectSelector, StageTable } from './risk-components'
import { RecommendationCard } from './recommendation-cards'
import { DashboardExport, DeliveryMetrics } from './dashboard-panels'

export function ManagerDashboard({ allProjects }: { allProjects: Project[] }) {
  const { filters, selectedProjectId, setSelectedProject } = useWorkspace()
  const { portfolio, projects, selected } = dashboardScope(allProjects, 'Project Manager', filters, selectedProjectId)
  const profile = ROLE_PROFILES['Project Manager']
  useEffect(() => { setSelectedProject(selected?.id ?? '') }, [selected?.id, setSelectedProject])
  return <div className="page-stack">
    <PageHeader eyebrow={profile.eyebrow} title={profile.title} description="Your demonstration portfolio, selected-project blockers, and delivery actions."><DashboardExport projects={projects}/></PageHeader>
    <DemoCallout title="Demonstration project assignment">This portfolio contains the first {portfolio.length} synthetic projects ordered by project ID. It is a deterministic demo assignment, not real user access. Select a project to update every delivery metric, stage, recommendation, and action below. Other demo routes remain available.</DemoCallout>
    <ProjectFilters projects={portfolio} extended/>
    {!projects.length || !selected ? <FilterEmpty/> : <>
      <Panel title="Demo assigned portfolio" description={`${projects.length} of ${portfolio.length} demo-assigned projects match the current filters. Choose the project to review.`}>
        <ProjectSelector projects={projects} value={selected.id} onChange={setSelectedProject}/>
        <div className="mt-5 grid gap-4 md:grid-cols-3">{projects.map(p => <div key={p.id} className="flex flex-col gap-3 rounded-lg border p-4"><p className="text-[10px] text-muted-foreground">{p.id} · {p.district}</p><h3 className="text-xs font-medium">{p.name}</h3><div className="flex flex-wrap items-center justify-between gap-2"><RiskBadge level={p.riskLevel}/><span className="text-[11px]">{p.expectedDelay} days delay</span></div><ProgressBar value={p.progress}/></div>)}</div>
      </Panel>
      <section aria-label="Selected project" className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="eyebrow mb-2">SELECTED PROJECT · {selected.id}</p><h2 className="text-lg font-semibold">{selected.name}</h2><p className="mt-2 text-xs text-muted-foreground">{selected.state} · {selected.district} · {selected.type}</p></div>
        <div className="flex items-center gap-3"><span className="text-2xl font-semibold">{selected.riskScore}<span className="text-xs font-normal text-muted-foreground"> / 100 risk</span></span><RiskBadge level={selected.riskLevel}/></div>
      </section>
      <DeliveryMetrics projects={[selected]} selected/>
      <Panel title="Project intervention priorities" description={`Primary synthetic risk driver: ${selected.primaryRisk}. ${selected.clearanceStatus}; ${selected.approvalDays} approval days.`}>
        <div className="flex flex-wrap gap-3"><Link href={`/simulation?project=${selected.id}`} className={buttonVariants()}><FlaskConical data-icon="inline-start"/>Test an intervention</Link><Link href={`/risk-analysis?project=${selected.id}`} className={buttonVariants({ variant: 'outline' })}><ScanLine data-icon="inline-start"/>Explain project risk</Link><ViewLink href={`/projects/${selected.id}`}>Project details</ViewLink></div>
      </Panel>
      <section aria-label="Selected project recommendations" className="flex flex-col gap-4"><div><h2 className="text-sm font-semibold">Project-specific recommendations</h2><p className="mt-1 text-[11px] text-muted-foreground">Existing demonstration guidance for {selected.id}; simulations do not change project records.</p></div><div className="grid gap-5 md:grid-cols-2">{recommendationsFor(selected).map(r => <RecommendationCard key={r.id} recommendation={r}/>)}</div></section>
      <StageTable key={selected.id} project={selected}/>
    </>}
  </div>
}
