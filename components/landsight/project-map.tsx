'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { RISK_COLORS, RISK_LEVELS } from '@/lib/landsight/risk'
const ProjectMap = dynamic(() => import('./leaflet-map'), { ssr: false, loading: () => <Skeleton className="h-full min-h-[300px] w-full rounded-none" /> })
export default ProjectMap
export function MapLegend() { return <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground"><span className="mr-1 font-medium">DELAY RISK</span>{RISK_LEVELS.map(l => <span key={l} className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: RISK_COLORS[l] }}/>{l.charAt(0) + l.slice(1).toLowerCase()}</span>)}</div> }
