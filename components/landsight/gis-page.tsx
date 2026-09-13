'use client'

import Link from 'next/link'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataBoundary, FilterEmpty, PageHeader, Panel, RiskBadge } from './shared'
import { ProjectFilters } from './filters'
import ProjectMap, { MapLegend } from './project-map'
import { useWorkspace } from './provider'
import { filterProjects } from '@/lib/landsight/service'

export function GISPage() {
  const { filters } = useWorkspace()
  return <DataBoundary>{all => { const projects = filterProjects(all, filters); return <div className="page-stack"><PageHeader eyebrow="GEOSPATIAL INTELLIGENCE" title="GIS risk map" description="Locate acquisition bottlenecks and inspect project-level risk across India."><Badge variant="secondary"><MapPin data-icon="inline-start"/>{projects.length} mapped projects</Badge></PageHeader><ProjectFilters projects={all} risk/>{projects.length ? <div className="grid items-start gap-5 xl:grid-cols-[1fr_300px]"><Panel title="National acquisition risk" description="Click a colored project marker to inspect its risk and open the analysis." flush footer={<div className="flex flex-col gap-2"><MapLegend/><p className="text-[9px] text-muted-foreground">Synthetic project points · Illustrative city/district coordinates, not cadastral boundaries. Basemap boundaries are supplied by OpenStreetMap.</p></div>}><div className="h-[560px]"><ProjectMap projects={projects}/></div></Panel><Panel title="Projects in this view" description="Accessible list · highest risk first" flush><div className="flex max-h-[595px] flex-col overflow-y-auto">{[...projects].sort((a, b) => b.riskScore - a.riskScore).map(p => <Link key={p.id} href={`/projects/${p.id}`} className="border-b p-4 transition-colors last:border-0 hover:bg-muted"><div className="flex items-center justify-between gap-2"><RiskBadge level={p.riskLevel}/><span className="text-xs font-semibold">{p.riskScore}<span className="text-[9px] font-normal text-muted-foreground"> /100</span></span></div><h3 className="mt-3 text-xs leading-relaxed font-medium">{p.name}</h3><p className="mt-1 text-[10px] text-muted-foreground">{p.district}, {p.state}</p><div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground"><span>{p.expectedDelay} days predicted delay</span><ArrowUpRight className="size-3 text-primary"/></div></Link>)}</div></Panel></div> : <FilterEmpty/>}</div> }}</DataBoundary>
}
