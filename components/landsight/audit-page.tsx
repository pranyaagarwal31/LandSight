'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  const [module, setModule] = useState('')
  const [role, setRole] = useState('')
  if (isLoading) return <LoadingState />
  if (error) return <ErrorState reset={() => void mutate()} />
  const rows = [...(logs ?? [])].filter(row =>
    (!source || row.source === source) && (!module || row.module === module) && (!role || row.role === role) &&
    `${row.user} ${row.role} ${row.action} ${row.module} ${row.project} ${row.details} ${row.result}`.toLowerCase().includes(search.trim().toLowerCase()),
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  function reset() { setSearch(''); setSource(''); setModule(''); setRole('') }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="ACCOUNTABILITY & TRACEABILITY" title="Audit logs" description="Review synthetic seed events and actions you take while exploring the prototype.">
        <Button variant="outline" disabled={!rows.length} onClick={() => {
          downloadText('landsight-demo-audit.json', JSON.stringify({ notice: 'Demo / synthetic and session-only events; not a tamper-proof audit log.', events: rows }, null, 2), 'application/json')
          addAudit('Exported demo audit trail', 'Filtered events', 'Success', { details: `Downloaded ${rows.length} events as JSON. The export event itself is recorded after download.` })
          toast.success('Audit trail downloaded')
        }}><Download data-icon="inline-start" />Export audit trail</Button>
      </PageHeader>
      <Panel title="Activity history" description="Session events reset on reload. No server-side or tamper-proof audit storage is connected." action={<Badge variant="secondary"><FileClock data-icon="inline-start" />{rows.length} events</Badge>} flush>
        <div className="flex flex-wrap gap-3 px-5 pb-4">
          <Input aria-label="Search audit logs" placeholder="Search user, role, action, project, or details…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          <select aria-label="Filter audit source" className="filter-select" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All event sources</option><option>Synthetic</option><option>This session</option>
          </select>
          <select aria-label="Filter audit module" className="filter-select" value={module} onChange={e => setModule(e.target.value)}>
            <option value="">All modules</option>{[...new Set(logs?.map(row => row.module))].sort().map(value => <option key={value}>{value}</option>)}
          </select>
          <select aria-label="Filter audit role" className="filter-select" value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All roles</option>{[...new Set(logs?.map(row => row.role))].sort().map(value => <option key={value}>{value}</option>)}
          </select>
          {(search || source || module || role) && <Button size="sm" variant="ghost" onClick={reset}>Clear filters</Button>}
        </div>
        {rows.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit events; scroll horizontally to view all columns">
          <table className="data-table">
            <caption className="sr-only">Synthetic and session activity, ordered by most recent timestamp.</caption>
            <thead><tr><th scope="col">Timestamp · IST</th><th scope="col">User / Role</th><th scope="col">Action / Details</th><th scope="col">Module / Project</th><th scope="col">Result</th><th scope="col">Source</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td className="whitespace-nowrap"><time dateTime={row.timestamp}>{formatDate(row.timestamp)}<span className="mt-1 block text-[10px] text-muted-foreground">{formatTime(row.timestamp)}</span></time></td>
              <td className="min-w-40 text-[11px]">{row.user}<p className="mt-1 text-[10px] text-muted-foreground">{row.role}</p></td>
              <td className="min-w-64 max-w-96"><p className="font-medium">{row.action}</p><p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{row.details}</p></td>
              <td className="min-w-36 text-[11px]">{row.module}<p className="mt-1 text-[10px] text-muted-foreground">{row.project.startsWith('LS-2026-') ? <Link href={`/projects/${row.project}`} className="hover:text-primary hover:underline">{row.project}</Link> : row.project}</p></td>
              <td><Badge variant={row.result === 'Failed' ? 'critical' : row.result === 'Needs correction' ? 'medium' : 'low'}>{row.result}</Badge></td>
              <td><Badge variant="outline">{row.source}</Badge></td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState title="No matching audit events" description="Adjust your search or filters, or take an action in the workspace." action={<Button variant="outline" onClick={reset}>Clear filters</Button>} />}
      </Panel>
    </div>
  )
}
