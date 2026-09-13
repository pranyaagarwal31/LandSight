'use client'

import Link from 'next/link'
import { FlaskConical, MapPin, ScanLine } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { DataBoundary, DemoCallout, FilterEmpty, PageHeader, Panel, ProgressBar, ViewLink } from './shared'
import { ProjectSelector, RiskExplanation, StageTable, useProjectSelection } from './risk-components'
import { ProjectRiskScore } from './project-risk-score'
import { usePrediction } from '@/lib/landsight/use-prediction'
import type { Project } from '@/lib/landsight/types'

export function RiskPage() { return <DataBoundary>{projects => <RiskContent projects={projects}/>}</DataBoundary> }
function RiskContent({ projects }: { projects: Project[] }) {
  const { project: p, options, notice, selectProject } = useProjectSelection(projects)
  const { mlPrediction } = usePrediction(p)
  const primaryRisk = mlPrediction ? mlPrediction.explanation.status === 'available' ? mlPrediction.explanation.topRiskFactors[0]?.name ?? 'No risk-increasing factors' : 'SHAP unavailable' : p?.primaryRisk
  return <div className="page-stack">
<PageHeader eyebrow="PREDICTIVE INTELLIGENCE" title="AI risk analysis" description="Understand not just which projects may be delayed, but why—and where to intervene."/>
<ProjectSelector projects={options} value={p?.id} onChange={selectProject} notice={notice}/>{p ? <>
<div className="grid gap-5 lg:grid-cols-[1fr_1.8fr]">
<ProjectRiskScore project={p} title="Delay risk score"/>
<Panel title={p.name} description={`${p.id} · ${p.type}`} action={<ViewLink href={`/projects/${p.id}`}>Project details</ViewLink>}>
<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
<MapPin className="size-3"/>{p.district}, {p.state}</p>
<div className="my-6 grid grid-cols-3 gap-5">
<div>
<p className="text-2xl font-semibold">{p.pendingParcels}</p>
<p className="mt-2 text-[10px] text-muted-foreground">Pending parcels</p>
</div>
<div>
<p className="text-2xl font-semibold">{p.legalCases}</p>
<p className="mt-2 text-[10px] text-muted-foreground">Open legal cases</p>
</div>
<div>
<p className="text-2xl font-semibold">{p.approvalDays}<span className="text-sm">d</span>
</p>
<p className="mt-2 text-[10px] text-muted-foreground">Approval processing</p>
</div>
</div>
<p className="mb-2 text-xs">Acquisition progress</p>
<ProgressBar value={p.progress}/>
<div className="mt-6 border-t pt-5">
<p className="text-xs leading-relaxed text-muted-foreground">{mlPrediction ? 'Primary SHAP risk driver: ' : 'Demo rule driver: '}<strong className="font-medium text-foreground">{primaryRisk}</strong>. Review the explanation and its limitations before deciding on an intervention.</p>
<Link href={`/simulation?project=${p.id}`} className={buttonVariants({ className: 'mt-5', variant: 'outline' })}>
<FlaskConical data-icon="inline-start"/>Test an intervention</Link>
</div>
</Panel>
</div>
<RiskExplanation project={p}/>
<DemoCallout title="Explainability, with clear limits">Trained predictions and TreeSHAP use the existing synthetic-data model when available, not verified government outcomes. If the API fails, clearly labeled demo rules explain only the fallback score. Stage risks and simulations remain illustrative; SHAP does not establish causality or intervention effectiveness.</DemoCallout>
<StageTable project={p}/>
</> : <FilterEmpty/>}</div>
}
