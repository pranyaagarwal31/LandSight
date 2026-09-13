'use client'

import Link from 'next/link'
import { ArrowDown, ArrowUpRight, CircleAlert, FolderSearch, Info, type LucideIcon } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Project, RiskLevel } from '@/lib/landsight/types'
import { RISK_COLORS } from '@/lib/landsight/risk'
import { useProjects, useWorkspace } from './provider'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, eyebrow, children }: { title: string; description: string; eyebrow?: string; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-4"><div>{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}<h1 className="text-[25px] leading-tight font-semibold tracking-[-.8px] sm:text-[27px]">{title}</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">{description}</p></div>{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}</div>
}
export function Panel({ title, description, action, children, footer, className, flush }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string; flush?: boolean }) {
  return <Card className={cn('[--card-spacing:--spacing(5)]', className)}><CardHeader><CardTitle><h2>{title}</h2></CardTitle>{description && <CardDescription><span className="text-[11px]">{description}</span></CardDescription>}{action && <CardAction>{action}</CardAction>}</CardHeader><CardContent className={cn(flush && 'px-0', 'min-w-0')}>{children}</CardContent>{footer && <CardFooter>{footer}</CardFooter>}</Card>
}
export function KpiCard({ title, value, detail, icon: Icon, accent = 'primary', trend }: { title: string; value: React.ReactNode; detail: string; icon: LucideIcon; accent?: 'primary' | 'critical' | 'high' | 'medium'; trend?: string }) {
  return <Card size="sm" className="min-w-0 [--card-spacing:--spacing(4)]"><CardHeader><CardTitle><span className="text-[10px] font-medium text-muted-foreground">{title}</span></CardTitle><CardAction><Icon className={cn('size-3.5', accent === 'primary' ? 'text-primary' : accent === 'critical' ? 'text-critical' : accent === 'high' ? 'text-high' : 'text-medium')} strokeWidth={1.7} /></CardAction></CardHeader><CardContent><p className="metric-value">{value}</p><div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">{trend && <span className="flex items-center text-primary"><ArrowDown className="size-2.5" />{trend}</span>}{detail}</div></CardContent></Card>
}
export function RiskBadge({ level }: { level: RiskLevel }) { return <Badge variant={level.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'}><span className="dot bg-current" /><span className="text-[9px] tracking-wide">{level}</span></Badge> }
export function ProgressBar({ value, risk, showLabel = true }: { value: number; risk?: RiskLevel; showLabel?: boolean }) {
  return <div className="flex items-center gap-2.5"><div role="progressbar" aria-label="Completion" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%`, ...(risk ? { background: RISK_COLORS[risk] } : {}) }} /></div>{showLabel && <span className="w-7 text-right text-[10px] tabular-nums">{value}%</span>}</div>
}
export function EmptyState({ title = 'No matching projects', description = 'Try adjusting your filters to see more projects.', action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return <Empty className="min-h-44"><EmptyHeader><EmptyMedia variant="icon"><FolderSearch /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty>
}
export function LoadingState() { return <div className="page-stack" aria-label="Loading workspace" role="status"><Skeleton className="h-9 w-60" /><Skeleton className="h-4 w-80 max-w-full" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80 w-full" /><span className="sr-only">Loading LandSight data…</span></div> }
export function ErrorState({ reset, message }: { reset?: () => void; message?: string }) { return <Alert variant="destructive"><CircleAlert /><AlertTitle>We couldn&apos;t load this view</AlertTitle><AlertDescription>{message ?? 'Please try again. Your demonstration dataset has not been changed.'}{reset && <div className="mt-3"><Button variant="outline" onClick={reset}>Try again</Button></div>}</AlertDescription></Alert> }
export function DataBoundary({ children }: { children: (projects: Project[]) => React.ReactNode }) {
  const { data, error, isLoading, mutate } = useProjects()
  if (isLoading) return <LoadingState />
  if (error) return <ErrorState reset={() => void mutate()} />
  if (!data?.length) return <EmptyState title="No project records" description="The project data source has no records available." />
  return children(data)
}
export function DemoCallout({ children, title = 'Demonstration model' }: { children: React.ReactNode; title?: string }) { return <Alert><Info /><AlertTitle>{title}</AlertTitle><AlertDescription>{children}</AlertDescription></Alert> }
export function ViewLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="small-link">{children}<ArrowUpRight className="size-3.5" /></Link> }
export function FilterEmpty() { const { resetFilters } = useWorkspace(); return <EmptyState action={<Button variant="outline" onClick={resetFilters}>Clear filters</Button>} /> }
