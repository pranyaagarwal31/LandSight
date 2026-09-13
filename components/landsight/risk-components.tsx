'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, Clock3, Info, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Panel, ProgressBar, RiskBadge } from './shared'
import { FactorChart } from './charts'
import type { Project, RiskPrediction } from '@/lib/landsight/types'
import { RISK_COLORS } from '@/lib/landsight/risk'
import { filterProjects } from '@/lib/landsight/service'
import { useWorkspace } from './provider'

export function useProjectSelection(projects: Project[]) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { filters } = useWorkspace()
  const options = filterProjects(projects, filters)
  const id = params.get('project')
  const project = id ? options.find(p => p.id === id) : options[0]
  const selectProject = (id: string) => router.replace(`${pathname}?project=${encodeURIComponent(id)}`, { scroll: false })
  return { project, options, selectProject }
}
export function ProjectSelector({ projects, value, onChange }: { projects: Project[]; value?: string; onChange: (id: string) => void }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4"><span className="text-xs font-medium text-muted-foreground">Selected project</span><select aria-label="Select project for analysis" value={value ?? ''} onChange={e => onChange(e.target.value)} className="filter-select max-w-full flex-1 sm:max-w-[540px]">{!value && <option value="">Select an available project</option>}{projects.map(p => <option value={p.id} key={p.id}>{p.name} · {p.id}</option>)}</select><Badge variant="outline">SYNTHETIC PROJECT</Badge></div>
}
export function RiskScore({ prediction }: { prediction: RiskPrediction }) {
  const color = RISK_COLORS[prediction.level]
  return <div className="flex flex-col items-center"><div role="img" aria-label={`Delay risk ${prediction.score} out of 100, ${prediction.level}`} className="relative my-3 size-40 rounded-full p-[11px]" style={{ background: `conic-gradient(${color} 0 ${prediction.score}%, var(--muted) ${prediction.score}% 100%)`, transform: 'rotate(-110deg)' }}><div className="flex size-full flex-col items-center justify-center rounded-full bg-card" style={{ transform: 'rotate(110deg)' }}><span className="text-[46px] leading-none font-semibold tracking-tight">{prediction.score}</span><span className="mt-2 text-[10px] text-muted-foreground">DELAY RISK / 100</span></div></div><RiskBadge level={prediction.level}/><div className="mt-6 grid w-full grid-cols-2 gap-4 border-t pt-5"><div className="text-center"><p className="text-2xl font-semibold">{prediction.delayDays}<span className="ml-1 text-xs font-normal text-muted-foreground">days</span></p><p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3"/>Expected delay</p></div><div className="border-l text-center"><p className="text-2xl font-semibold">{prediction.confidence}<span className="text-sm">%</span></p><p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground"><Info className="size-3"/>Demo confidence</p></div></div></div>
}
export function RiskExplanation({ project }: { project: Project }) {
  const total = project.prediction.factors.reduce((sum, f) => sum + f.contribution, 8)
  return <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.25fr]"><Panel title="Explainable AI" description="SHAP-style feature contribution · demonstration"><FactorChart factors={project.prediction.factors}/><div className="flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground"><span>Base score: 8 points</span><span>Rounded and capped total: {Math.round(Math.max(0, Math.min(100, total)))}</span></div><p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Deterministic feature weights illustrate the planned SHAP explainability layer. No SHAP or trained ML model runs in this prototype.</p></Panel><Panel title="What is driving this prediction?" description="Trace each contribution back to the project record"><div className="flex flex-col divide-y">{[...project.prediction.factors].sort((a, b) => b.contribution - a.contribution).map(f => <div key={f.id} className="flex gap-3 py-3 first:pt-0"><span className="mt-0.5">{f.contribution >= 0 ? <ArrowUpRight className="size-4 text-high"/> : <ArrowDownRight className="size-4 text-low"/>}</span><div className="flex-1"><h3 className="text-xs font-medium">{f.name}</h3><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{f.description}</p></div><span className={f.contribution < 0 ? 'text-xs font-semibold text-low' : 'text-xs font-semibold text-high'}>{f.contribution > 0 ? '+' : ''}{f.contribution}</span></div>)}</div></Panel></div>
}
export function StageTable({ project }: { project: Project }) {
  return <Panel title="Stage-wise acquisition risk" description="Follow the bottlenecks through the acquisition lifecycle. Stage delays overlap and are not additive." flush><div className="table-wrap"><table className="data-table"><thead><tr><th>Acquisition stage</th><th>Completion</th><th>Stage risk</th><th>Status</th><th>Delay possibility</th></tr></thead><tbody>{project.stages.map((stage, index) => <tr key={stage.name}><td><span className="mr-3 text-[10px] text-muted-foreground">0{index + 1}</span><span className="font-medium">{stage.name}</span></td><td className="min-w-32"><ProgressBar value={stage.completion}/></td><td><RiskBadge level={stage.risk}/></td><td className="whitespace-nowrap text-[11px] text-muted-foreground">{stage.status === 'Complete' && <ShieldCheck className="mr-1 inline size-3 text-low"/>}{stage.status}</td><td>{stage.delayDays ? `Up to ${stage.delayDays} days` : 'No delay indicated'}</td></tr>)}</tbody></table></div></Panel>
}
