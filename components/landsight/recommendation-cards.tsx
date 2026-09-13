'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Check, ClipboardCheck, Lightbulb, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
import { RiskBadge } from './shared'
import { useWorkspace } from './provider'
import type { Recommendation } from '@/lib/landsight/types'

export function RecommendationCard({ recommendation: r }: { recommendation: Recommendation }) {
  const { data: reviewed = [], mutate } = useSWR<string[]>('session:recommendations', null, { fallbackData: [] })
  const { addAudit } = useWorkspace()
  const done = reviewed.includes(r.id)
  return <Card><CardHeader><CardTitle><span className="flex max-w-[90%] items-start gap-2 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary"/>{r.title}</span></CardTitle><CardDescription><span className="text-[10px]">{r.projectId}</span></CardDescription><CardAction><RiskBadge level={r.priority}/></CardAction></CardHeader><CardContent><p className="text-[11px] leading-relaxed text-muted-foreground">{r.reason}</p><div className="mt-4 rounded-md bg-secondary/60 p-3"><p className="text-[10px] font-medium text-primary">EXPECTED IMPACT · DEMO ESTIMATE</p><p className="mt-1.5 text-[11px] leading-relaxed">{r.impact}</p></div><h4 className="mt-4 text-[11px] font-medium">Suggested action</h4><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{r.action}</p><p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground"><UserRound className="size-3"/>{r.owner}</p></CardContent><CardFooter className="flex flex-wrap justify-between gap-2"><Button size="sm" variant={done ? 'secondary' : 'outline'} disabled={done} onClick={() => { void mutate([...reviewed, r.id], { revalidate: false }); addAudit('Reviewed recommendation', r.projectId, 'Reviewed'); toast.success('Marked as reviewed for this session') }}>{done ? <Check data-icon="inline-start"/> : <ClipboardCheck data-icon="inline-start"/>}{done ? 'Reviewed' : 'Mark reviewed'}</Button><Link href={`/simulation?project=${r.projectId}`} className="small-link">Simulate impact<ArrowRight className="size-3"/></Link></CardFooter></Card>
}
