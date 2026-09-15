'use client'

import { CalendarDays, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PROJECT_TYPES } from '@/lib/landsight/data'
import { RISK_LEVELS } from '@/lib/landsight/risk'
import type { Project } from '@/lib/landsight/types'
import { useWorkspace } from './provider'

export function ProjectFilters({ projects, extended = false, risk = false, date = false, defaultState = '' }: { projects: Project[]; extended?: boolean; risk?: boolean; date?: boolean; defaultState?: string }) {
  const { filters: workspaceFilters, setFilters, resetFilters } = useWorkspace()
  const filters = { ...workspaceFilters, state: workspaceFilters.state || defaultState }
  const states = [...new Set(projects.map(p => p.state))].sort()
  const districts = [...new Set(projects.filter(p => !filters.state || p.state === filters.state).map(p => p.district))].sort()
  const active = Object.values(filters).some(Boolean)
  return <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><SlidersHorizontal className="mr-1 hidden size-3.5 text-muted-foreground sm:block"/><select aria-label="Filter by state" className="filter-select" value={filters.state} onChange={e => setFilters({ state: e.target.value, district: '' })}><option value="">{defaultState ? 'Default demo region' : 'All states'}</option>{states.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filter by district" className="filter-select" value={filters.district} onChange={e => setFilters({ district: e.target.value })}><option value="">All districts</option>{districts.map(d => <option key={d}>{d}</option>)}</select><select aria-label="Filter by project type" className="filter-select" value={filters.type} onChange={e => setFilters({ type: e.target.value })}><option value="">All project types</option>{PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}</select>{(risk || extended) && <select aria-label="Filter by risk level" className="filter-select" value={filters.risk} onChange={e => setFilters({ risk: e.target.value })}><option value="">All risk levels</option>{RISK_LEVELS.map(l => <option key={l}>{l}</option>)}</select>}{extended && <><select aria-label="Filter by progress" className="filter-select" value={filters.progress} onChange={e => setFilters({ progress: e.target.value })}><option value="">All progress</option><option value="below50">Below 50%</option><option value="50to80">50–79%</option><option value="above80">80% and above</option></select><select aria-label="Filter by acquisition status" className="filter-select" value={filters.status} onChange={e => setFilters({ status: e.target.value })}><option value="">All statuses</option><option>On track</option><option>At risk</option><option>Delayed</option></select></>}{active && <Button variant="ghost" size="sm" onClick={resetFilters}><X data-icon="inline-start"/>Reset</Button>}</div>{date && <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground"><CalendarDays className="size-3.5"/>13 Sep 2026<span className="hidden text-[9px] md:inline">· Demo snapshot</span></div>}{filters.search && <p className="w-full text-xs text-muted-foreground">Global search: <strong className="font-medium text-foreground">{filters.search}</strong></p>}</div>
}
