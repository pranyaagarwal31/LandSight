'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowDownUp, ArrowUpRight, Building2, ChevronLeft, ChevronRight, Route, TrainFront, Waves, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project, ProjectType } from '@/lib/landsight/types'
import { ProgressBar, RiskBadge, EmptyState } from './shared'

const typeIcons = { Highway: Route, Railway: TrainFront, Irrigation: Waves, Power: Zap, Industrial: Building2, 'Road infrastructure': Route }
export function TypeIcon({ type }: { type: ProjectType }) { const Icon = typeIcons[type]; return <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} /> }
export function ProjectTable({ projects, pageSize = 8, compact = false }: { projects: Project[]; pageSize?: number; compact?: boolean }) {
  const [page, setPage] = useState(0)
  const [descending, setDescending] = useState(true)
  const sorted = [...projects].sort((a, b) => descending ? b.riskScore - a.riskScore : a.riskScore - b.riskScore)
  const pages = Math.ceil(sorted.length / pageSize)
  const current = Math.min(page, Math.max(0, pages - 1))
  const displayed = sorted.slice(current * pageSize, (current + 1) * pageSize)
  if (!projects.length) return <EmptyState />
  return <><div className="table-wrap"><table className="data-table"><thead><tr><th>Project name</th><th>Location</th><th>Type</th><th>Progress</th><th><button className="flex items-center gap-1.5" onClick={() => setDescending(!descending)} aria-label="Toggle risk score sort">Risk score<ArrowDownUp className="size-3"/></button></th><th>Risk level</th><th>Est. delay</th>{!compact && <th>Primary risk factor</th>}<th><span className="sr-only">Action</span></th></tr></thead><tbody>{displayed.map(p => <tr key={p.id}><td className="min-w-48 max-w-64"><Link href={`/projects/${p.id}`} className="font-medium leading-relaxed hover:text-primary hover:underline">{p.name}</Link><p className="mt-1 text-[9px] text-muted-foreground">{p.id}</p></td><td className="whitespace-nowrap"><span className="text-[11px]">{p.state}</span><p className="mt-1 text-[9px] text-muted-foreground">{p.district}</p></td><td><span className="flex items-center gap-1.5 whitespace-nowrap text-[10px]"><TypeIcon type={p.type} />{p.type === 'Road infrastructure' ? 'Road' : p.type}</span></td><td className="min-w-28"><ProgressBar value={p.progress} /></td><td><span className="font-semibold tabular-nums">{p.riskScore}</span><span className="text-[9px] text-muted-foreground"> /100</span></td><td><RiskBadge level={p.riskLevel} /></td><td className="whitespace-nowrap text-[11px]">{p.expectedDelay} <span className="text-muted-foreground">days</span></td>{!compact && <td className="min-w-28 text-[10px] text-muted-foreground">{p.primaryRisk}</td>}<td><Link href={`/projects/${p.id}`} aria-label={`View ${p.name}`} className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary"><ArrowUpRight className="size-3.5" /></Link></td></tr>)}</tbody></table></div>{sorted.length > pageSize && <div className="flex items-center justify-between gap-3 border-t px-5 pt-4 text-[10px] text-muted-foreground"><span>Showing {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of {sorted.length} projects</span><div className="flex items-center gap-2"><Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><span>{current + 1} / {pages}</span><Button variant="outline" size="icon-sm" aria-label="Next page" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight /></Button></div></div>}</>
}
