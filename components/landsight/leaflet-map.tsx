'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import type { Project } from '@/lib/landsight/types'
import { RISK_COLORS } from '@/lib/landsight/risk'
import { RiskBadge } from './shared'

function FitProjects({ projects }: { projects: Project[] }) {
  const map = useMap()
  useEffect(() => {
    if (projects.length) map.fitBounds(latLngBounds(projects.map(p => [p.latitude, p.longitude])), { padding: [38, 24], maxZoom: 8, animate: false })
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(map.getContainer())
    return () => resize.disconnect()
  }, [projects, map])
  return null
}
export default function LeafletMap({ projects, compact = false }: { projects: Project[]; compact?: boolean }) {
  const [tileError, setTileError] = useState(false)
  return <div className="relative h-full min-h-[300px] w-full overflow-hidden bg-muted"><MapContainer center={[23.2, 79.5]} zoom={4} minZoom={3} maxZoom={14} zoomSnap={.25} scrollWheelZoom={!compact} style={{ height: '100%', width: '100%', minHeight: 300 }} attributionControl><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true) }} /><FitProjects projects={projects}/>{projects.map(p => <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={compact ? 6 : 9} pathOptions={{ fillColor: RISK_COLORS[p.riskLevel], color: '#ffffff', weight: 2, fillOpacity: .95 }}><Tooltip direction="top" offset={[0, -6]}>{p.district} · {p.riskScore}/100</Tooltip><Popup><div className="min-w-[190px]"><span className="text-[9px] text-muted-foreground">{p.id} · Synthetic project</span><h3 className="my-2 text-sm font-semibold">{p.name}</h3><RiskBadge level={p.riskLevel}/><p className="text-xs text-muted-foreground">{p.district}, {p.state}</p><div className="my-3 flex gap-6"><div><strong className="text-lg">{p.riskScore}</strong><p className="text-[10px]">Risk score /100</p></div><div><strong className="text-lg">{p.expectedDelay}d</strong><p className="text-[10px]">Predicted delay</p></div></div><Link href={`/projects/${p.id}`} className="text-xs font-medium underline">View project analysis →</Link></div></Popup></CircleMarker>)}</MapContainer>{tileError && <p role="status" className="absolute right-3 bottom-7 left-3 rounded border bg-card p-2 text-[10px]">Basemap tiles could not load. Project coordinates remain available in the list.</p>}</div>
}
