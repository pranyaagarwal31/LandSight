'use client'

import { Download, FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataBoundary, PageHeader, Panel } from './shared'
import { ProjectFilters } from './filters'
import { ProjectTable } from './project-table'
import { useWorkspace } from './provider'
import { filterProjects } from '@/lib/landsight/service'
import { exportProjects } from '@/lib/landsight/format'
import { toast } from 'sonner'

export function ProjectsPage() {
  const { filters, setFilters, addAudit } = useWorkspace()
  return <DataBoundary>{all => { const projects = filterProjects(all, filters); return <div className="page-stack"><PageHeader eyebrow="PROJECT REGISTRY" title="Projects" description="One place to track acquisition progress, emerging risks, and the next best action."><Button variant="outline" disabled={!projects.length} onClick={() => { exportProjects(projects); addAudit('Exported project registry'); toast.success('Synthetic project registry downloaded') }}><Download data-icon="inline-start"/>Export projects</Button></PageHeader><ProjectFilters projects={all} extended/><Panel title="Acquisition project registry" description="All records in this workspace are synthetic demonstration projects." action={<Badge variant="secondary"><FolderKanban data-icon="inline-start"/>{projects.length} projects</Badge>} flush><div className="px-5 pb-4"><Input aria-label="Search project registry" placeholder="Search by project name, ID, state, or district…" value={filters.search} onChange={e => setFilters({ search: e.target.value })} className="max-w-md" /></div><ProjectTable projects={projects}/></Panel></div> }}</DataBoundary>
}
