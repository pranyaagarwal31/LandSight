'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Check, CheckCheck, Clock3, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAlerts, useWorkspace } from './provider'
import { DataBoundary, EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, RiskBadge } from './shared'
import { ProjectFilters } from './filters'
import { filterProjects } from '@/lib/landsight/service'
import { RISK_LEVELS } from '@/lib/landsight/risk'
import { formatDate } from '@/lib/landsight/format'
import type { Alert } from '@/lib/landsight/types'

function AlertCard({ alert: a, update }: { alert: Alert; update: (id: string, status: Alert['status']) => void }) {
  const { user } = useWorkspace()
  return <Card><CardHeader><CardTitle><span className="text-sm">{a.category}</span></CardTitle><CardDescription><Link className="text-[11px] hover:underline" href={`/projects/${a.projectId}`}>{a.projectName}</Link></CardDescription><CardAction><RiskBadge level={a.severity}/></CardAction></CardHeader><CardContent><p className="text-xs leading-relaxed">{a.reason}</p><div className="mt-4 rounded-md bg-muted p-3"><h3 className="text-[10px] font-semibold">RECOMMENDED ACTION</h3><p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{a.action}</p></div><p className="mt-4 text-[10px] text-muted-foreground">{formatDate(a.date)} · Synthetic alert</p></CardContent><CardFooter className="flex flex-wrap justify-between gap-2"><Badge variant={a.status === 'Resolved' ? 'low' : 'outline'}>{a.status}</Badge><div className="flex gap-2">{a.status === 'Open' && <Button size="sm" variant="outline" onClick={() => update(a.id, 'Acknowledged')}><Check data-icon="inline-start"/>Acknowledge</Button>}{a.status !== 'Resolved' && user.role === 'Admin' && <Button size="sm" variant="secondary" onClick={() => update(a.id, 'Resolved')}><CheckCheck data-icon="inline-start"/>Resolve</Button>}</div></CardFooter></Card>
}
export function AlertsPage() {
  const { data: alerts, error, isLoading, mutate } = useAlerts()
  const { filters, addAudit } = useWorkspace()
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [visible, setVisible] = useState(12)
  if (isLoading) return <LoadingState/>
  if (error) return <ErrorState reset={() => void mutate()}/>
  async function update(id: string, status: Alert['status']) {
    const a = alerts?.find(a => a.id === id)
    await mutate(current => current?.map(a => a.id === id ? { ...a, status } : a), { revalidate: false })
    addAudit(`${status} risk alert`, a?.projectId)
    toast.success(`Alert ${status.toLowerCase()} for this session`)
  }
  return <DataBoundary>{projects => { const ids = new Set(filterProjects(projects, filters).map(p => p.id)); const scoped = (alerts ?? []).filter(a => ids.has(a.projectId)); const filtered = scoped.filter(a => (!severity || a.severity === severity) && (!status || a.status === status) && (!category || a.category === category)); return <div className="page-stack"><PageHeader eyebrow="EARLY WARNING SYSTEM" title="Alert center" description="Prioritize emerging issues, coordinate a response, and track decisions in this demo session."/><div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><KpiCard title="Open alerts" value={scoped.filter(a => a.status === 'Open').length} detail="Awaiting review" icon={Bell} accent="high"/><KpiCard title="Critical alerts" value={scoped.filter(a => a.severity === 'CRITICAL' && a.status !== 'Resolved').length} detail="Not yet resolved" icon={ShieldAlert} accent="critical"/><KpiCard title="Acknowledged" value={scoped.filter(a => a.status === 'Acknowledged').length} detail="Response in progress" icon={Clock3}/><KpiCard title="Resolved" value={scoped.filter(a => a.status === 'Resolved').length} detail="Within this demo session" icon={CheckCheck}/></div><ProjectFilters projects={projects}/><div className="flex flex-wrap gap-2"><select className="filter-select" aria-label="Filter alert severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="">All severities</option>{RISK_LEVELS.map(s => <option key={s}>{s}</option>)}</select><select className="filter-select" aria-label="Filter alert status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option>Open</option><option>Acknowledged</option><option>Resolved</option></select><select className="filter-select" aria-label="Filter alert category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All alert categories</option>{[...new Set(alerts?.map(a => a.category))].map(c => <option key={c}>{c}</option>)}</select><span className="ml-auto self-center text-[10px] text-muted-foreground">{filtered.length} alerts · Changes reset on reload</span></div>{filtered.length ? <><div className="grid gap-4 xl:grid-cols-2">{filtered.slice(0, visible).map(a => <AlertCard key={a.id} alert={a} update={update}/>)}</div>{visible < filtered.length && <Button variant="outline" className="self-center" onClick={() => setVisible(v => v + 12)}>Show more alerts ({filtered.length - visible} remaining)</Button>}</> : <EmptyState title="No alerts in this view" description="There are no matching alerts. Try another status, severity, or project filter."/>}</div> }}</DataBoundary>
}
