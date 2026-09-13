'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DataBoundary, EmptyState, PageHeader } from './shared'
import { RecommendationCard } from './recommendation-cards'
import { ProjectFilters } from './filters'
import { useWorkspace } from './provider'
import { recommendationsFor } from '@/lib/landsight/data'
import { filterProjects, resolveProjectSelection } from '@/lib/landsight/service'

export function RecommendationsPage() {
  const params = useSearchParams()
  const router = useRouter()
  const selected = params.get('project') ?? ''
  const { filters, setSelectedProject, resetFilters } = useWorkspace()
  function selectProject(id: string) {
    setSelectedProject(id)
    const next = new URLSearchParams(params.toString())
    if (id) next.set('project', id); else next.delete('project')
    router.replace(`/recommendations${next.size ? `?${next}` : ''}`, { scroll: false })
  }
  return <DataBoundary>{projects => {
    const { options, notice } = resolveProjectSelection(projects, filters, selected)
    const requested = projects.find(p => p.id === selected)
    const scoped = selected ? requested ? [requested] : [] : filterProjects(projects, filters)
    const recommendations = [...scoped].sort((a, b) => b.riskScore - a.riskScore).flatMap(recommendationsFor)
    return <div className="page-stack">
      <PageHeader eyebrow="FROM INSIGHT TO ACTION" title="Recommendations" description="Practical, factor-driven actions to unblock acquisition and reduce potential delays."><Badge variant="secondary">{recommendations.length} recommended actions</Badge></PageHeader>
      <ProjectFilters projects={projects} risk/>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Filter recommendations by project" value={selected} onChange={e => selectProject(e.target.value)} className="filter-select max-w-full">
          <option value="">All selected projects</option>
          {selected && !requested && <option value={selected}>Unknown project · {selected}</option>}
          {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground">Reviewed actions are retained for this session only.</p>
      </div>
      {notice && <Alert><Info/><AlertDescription>{notice}<Button size="sm" variant="outline" onClick={() => selectProject('')}>Clear project link</Button></AlertDescription></Alert>}
      {recommendations.length ? <div className="grid items-start gap-4 xl:grid-cols-2">{recommendations.map(r => <RecommendationCard key={r.id} recommendation={r}/>)}</div> : <EmptyState title="No recommendations for this selection" description="Choose a different project or clear the global filters." action={<Button variant="outline" onClick={() => { resetFilters(); selectProject('') }}>Clear selection and filters</Button>}/>}
    </div>
  }}</DataBoundary>
}
