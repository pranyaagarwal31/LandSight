'use client'

import { useState } from 'react'
import { Download, FileClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel } from './shared'
import { useAudit, useWorkspace } from './provider'
import { downloadText, formatDate, formatTime } from '@/lib/landsight/format'
import { toast } from 'sonner'

export function AuditPage() {
  const { data: logs, error, isLoading, mutate } = useAudit()
  const { addAudit } = useWorkspace()
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  if (isLoading) return <LoadingState/>
  if (error) return <ErrorState reset={() => void mutate()}/>
  const rows = [...(logs ?? [])].filter(row => (!source || row.source === source) && `${row.user} ${row.action} ${row.project}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return <div className="page-stack"><PageHeader eyebrow="ACCOUNTABILITY & TRACEABILITY" title="Audit logs" description="Review synthetic seed events and actions you take while exploring the prototype."><Button variant="outline" disabled={!rows.length} onClick={() => { downloadText('landsight-demo-audit.json', JSON.stringify({ notice: 'Demo / synthetic and session-only events; not a tamper-proof audit log.', events: rows }, null, 2), 'application/json'); addAudit('Exported demo audit trail'); toast.success('Audit trail downloaded') }}><Download data-icon="inline-start"/>Export audit trail</Button></PageHeader><Panel title="Activity history" description="Session events reset on reload. No server-side or tamper-proof audit storage is connected." action={<Badge variant="secondary"><FileClock data-icon="inline-start"/>{rows.length} events</Badge>} flush><div className="flex flex-wrap gap-3 px-5 pb-4"><Input aria-label="Search audit logs" placeholder="Search by user, action, or project…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md"/><select aria-label="Filter audit source" className="filter-select" value={source} onChange={e => setSource(e.target.value)}><option value="">All event sources</option><option>Synthetic</option><option>This session</option></select></div>{rows.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Action</th><th>Project</th><th>Timestamp · IST</th><th>Result</th><th>Source</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="min-w-40 text-[11px]">{row.user}</td><td className="min-w-48 font-medium">{row.action}</td><td className="text-[11px]">{row.project}</td><td className="whitespace-nowrap"><p>{formatDate(row.timestamp)}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatTime(row.timestamp)}</p></td><td><Badge variant="low">{row.result}</Badge></td><td><Badge variant="outline">{row.source}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No matching audit events" description="Adjust the search, or run a simulation, review a recommendation, or validate a CSV to create a session event."/>}</Panel></div>
}
