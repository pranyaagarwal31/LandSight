'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { DataBoundary, EmptyState, PageHeader } from './shared'
import { RecommendationCard } from './recommendation-cards'
import { ProjectFilters } from './filters'
import { useWorkspace } from './provider'
import { recommendationsFor } from '@/lib/landsight/data'
import { filterProjects } from '@/lib/landsight/service'

export function RecommendationsPage() {
  const params = useSearchParams()
  const [selected, setSelected] = useState(params.get('project') ?? '')
  const { filters } = useWorkspace()
  return <DataBoundary>{projects => { const filtered = filterProjects(projects, filters); const recommendations = [...filtered].filter(p => !selected || p.id === selected).sort((a, b) => b.riskScore - a.riskScore).flatMap(recommendationsFor); return <div className="page-stack"><PageHeader eyebrow="FROM INSIGHT TO ACTION" title="Recommendations" description="Practical, factor-driven actions to unblock acquisition and reduce potential delays."><Badge variant="secondary">{recommendations.length} recommended actions</Badge></PageHeader><ProjectFilters projects={projects} risk/><div className="flex flex-wrap items-center justify-between gap-3"><select aria-label="Filter recommendations by project" value={selected} onChange={e => setSelected(e.target.value)} className="filter-select max-w-full"><option value="">All selected projects</option>{filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="text-[10px] text-muted-foreground">Reviewed actions are retained for this session only.</p></div>{recommendations.length ? <div className="grid items-start gap-4 xl:grid-cols-2">{recommendations.map(r => <RecommendationCard key={r.id} recommendation={r}/>)}</div> : <EmptyState title="No recommendations for this selection" description="Choose a different project or clear the global filters."/>}</div> }}</DataBoundary>
}
