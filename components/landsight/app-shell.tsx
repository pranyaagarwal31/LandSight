'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Activity, ArrowUpRight, Bell, BrainCircuit, ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, Database, FileClock, FolderKanban, Globe2, Layers3, LayoutDashboard, Lightbulb, MapPinned, Menu, ScanLine, Search, ShieldCheck, Sparkles, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'
import { DEMO_NOTICE } from '@/lib/landsight/data'
import { useAlerts, useProjects, useWorkspace } from './provider'

const groups = [
  { label: 'WORKSPACE', links: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard }, { label: 'Projects', href: '/projects', icon: FolderKanban }, { label: 'Risk Analysis', href: '/risk-analysis', icon: ScanLine }, { label: 'GIS Map', href: '/gis', icon: MapPinned }] },
  { label: 'DECISION INTELLIGENCE', links: [{ label: 'Recommendations', href: '/recommendations', icon: Lightbulb }, { label: 'Impact Simulation', href: '/simulation', icon: FlaskConical }, { label: 'Alerts', href: '/alerts', icon: Bell }, { label: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined }] },
  { label: 'SYSTEM', links: [{ label: 'Data Management', href: '/data-management', icon: Database }, { label: 'Model Performance', href: '/model-performance', icon: BrainCircuit }, { label: 'Audit Logs', href: '/audit-logs', icon: FileClock }] },
]
export function Brand() { return <Link href="/" className="flex items-center gap-2.5" aria-label="LandSight home">
<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
<Layers3 className="size-5" strokeWidth={1.6} />
</span>
<div>
<span className="text-[22px] font-semibold tracking-[-1px]">Land<span className="text-primary">Sight</span>
</span>
<p className="text-[8px] font-medium tracking-[.13em] text-muted-foreground">LAND ACQUISITION INTELLIGENCE</p>
</div>
</Link> }
function Sidebar({ close }: { close?: () => void }) {
  const pathname = usePathname()
  const { user, selectedProjectId } = useWorkspace()
  const projectId = pathname.startsWith('/projects/') ? pathname.split('/')[2] : selectedProjectId
  const hrefFor = (href: string) => projectId && ['/risk-analysis', '/simulation', '/recommendations'].includes(href) ? `${href}?project=${encodeURIComponent(projectId)}` : href
  const { data: alerts } = useAlerts()
  const count = alerts?.filter(a => a.status === 'Open').length ?? 0
  return <div className="flex h-full flex-col bg-card">
<div className="flex h-[78px] shrink-0 items-center px-6">
<Brand />
</div>
<div className="mx-4 mb-5 flex items-center gap-2 rounded-md border bg-background px-3 py-2.5">
<Globe2 className="size-3.5 text-primary" />
<span className="text-[11px] font-medium">{user.role === 'Admin' ? 'National command center' : user.role === 'State/District Officer' ? 'Regional officer workspace' : 'Project delivery workspace'}</span>
</div>
<nav aria-label="Main navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3">{groups.map(group => <div key={group.label}>
<p className="mb-2 px-3 text-[9px] font-medium tracking-[.12em] text-muted-foreground">{group.label}</p>
<div className="flex flex-col gap-1">{group.links.map(item => <Link key={item.href} href={hrefFor(item.href)} onClick={close} className="nav-link" data-active={pathname === item.href || (item.href === '/projects' && pathname.startsWith('/projects/'))} aria-current={pathname === item.href || (item.href === '/projects' && pathname.startsWith('/projects/')) ? 'page' : undefined}>
<item.icon className="size-[16px]" strokeWidth={1.65} />
<span className="flex-1">{item.label}</span>{item.label === 'Alerts' && count > 0 && <Badge variant="critical">{count}</Badge>}{item.label === 'Risk Analysis' && <span className="text-[9px] font-semibold text-primary">AI</span>}</Link>)}</div>
</div>)}</nav>
<div className="m-4 mt-7 rounded-lg border border-primary/10 bg-secondary/60 p-3">
<div className="mb-2 flex items-center gap-2 text-primary">
<Sparkles className="size-3.5" />
<span className="text-xs font-medium">Foresight. Not hindsight.</span>
</div>
<p className="text-[10px] leading-relaxed text-muted-foreground">Early intelligence for better land acquisition decisions.</p>
<Link href="/model-performance" onClick={close} className="mt-3 flex items-center justify-between border-t border-primary/10 pt-2.5 text-[10px] text-primary">
<span className="flex items-center gap-1.5">
<span className="dot bg-low" />Demo engine · v1.0</span>
<ArrowUpRight className="size-3" />
</Link>
</div>
<div className="flex items-center gap-2 border-t px-5 py-4 text-[10px] text-muted-foreground">
<ShieldCheck className="size-4" />
<span>SIH 2026 <span className="mx-1.5">/</span> SIH26017</span>
</div>
</div>
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { filters, setFilters, resetFilters, user } = useWorkspace()
  const { data: projects = [], source, notice, error: projectError } = useProjects()
  const { data: alerts = [] } = useAlerts()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  if (pathname === '/login') return children
  const active = groups.flatMap(g => g.links).find(l => pathname === l.href || (l.href === '/projects' && pathname.startsWith('/projects/')))?.label ?? 'Workspace'
  const states = [...new Set(projects.map(p => p.state))].sort()
  return <>
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-card focus:p-3">Skip to content</a>
<aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] border-r lg:block">
<Sidebar />
</aside>
<div className="workspace-body min-w-0 lg:ml-[224px]">
<header className="flex h-[68px] items-center justify-between gap-3 border-b bg-card px-4 sm:px-7">
<div className="flex items-center gap-3">
<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
<SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" />}>
<Menu />
</SheetTrigger>
<SheetContent side="left" className="w-[280px] gap-0">
<SheetHeader className="sr-only">
<SheetTitle>LandSight navigation</SheetTitle>
<SheetDescription>Navigate the decision-support workspace.</SheetDescription>
</SheetHeader>
<Sidebar close={() => setMenuOpen(false)} />
</SheetContent>
</Sheet>
<div className="hidden items-center gap-2 text-[11px] text-muted-foreground xl:flex">
<Globe2 className="size-3.5" />
<span>Workspace</span>
<ChevronRight className="size-3" />
<span className="font-medium text-foreground">{active}</span>
</div>
<span className="text-sm font-semibold lg:hidden">LandSight</span>
</div>
<div className="flex min-w-0 items-center gap-3 sm:gap-5">
<form className="hidden items-center gap-2 sm:flex" role="search" onSubmit={e => { e.preventDefault(); resetFilters(); setFilters({ search: search.trim() }); router.push('/projects') }}>
<button type="submit" aria-label="Search all projects" className="text-muted-foreground">
<Search className="size-4" />
</button>
<input aria-label="Global project search" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault() }} placeholder="Search projects, districts…" className="w-40 bg-transparent py-2 text-[11px] outline-none lg:w-44"/>
<kbd className="hidden rounded border px-1 text-[9px] text-muted-foreground xl:block">↵</kbd>
</form>
<div className="hidden items-center gap-1.5 border-l pl-4 md:flex">
<Globe2 className="size-3.5 text-muted-foreground"/>
<select aria-label="Global state filter" className="max-w-36 bg-transparent text-[11px] outline-none" value={filters.state} onChange={e => setFilters({ state: e.target.value, district: '' })}>
<option value="">All India</option>{states.map(s => <option key={s}>{s}</option>)}</select>
</div>
<Link href="/alerts" aria-label={`${alerts.filter(a => a.status === 'Open').length} open notifications`} className="relative border-l pl-4 text-muted-foreground">
<Bell className="size-4" />{alerts.some(a => a.status === 'Open') && <span className="absolute -top-1 -right-0.5 size-1.5 rounded-full bg-critical ring-2 ring-card" />}</Link>
<Link href="/login" className="flex items-center gap-2" aria-label="Change demo role">
<span className="flex size-8 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary">{user.name.split(' ').map(n => n[0]).join('')}</span>
<div className="hidden md:block">
<p className="text-[11px] font-medium">{user.name}</p>
<p className="mt-0.5 text-[9px] text-muted-foreground">{user.role} · Role preview</p>
</div>
<ChevronDown className="hidden size-3 text-muted-foreground xl:block" />
</Link>
</div>
</header>
<div className="demo-strip">
<div className="flex items-center gap-2">
<FlaskConical className="size-3" />
<span className="font-medium tracking-[.035em]">{DEMO_NOTICE}</span>
</div>
<span className="flex items-center gap-1.5" title={notice} role="status">
<span className="dot bg-medium" />{projectError ? 'Project source error' : source === 'postgresql' ? 'PostgreSQL / PostGIS' : source === 'demo-fallback' ? 'Demo fallback · Database unavailable' : 'Connecting to project database…'}</span>
</div>
<main id="main-content" className="mx-auto min-h-[calc(100vh-155px)] max-w-[1640px] p-4 sm:p-6 xl:p-7">{children}</main>
<footer className="flex flex-wrap items-center justify-between gap-2 px-7 pb-5 text-[9px] text-muted-foreground">
<span>LandSight · Smart India Hackathon 2026 · Smart Automation</span>
<span className="flex items-center gap-1.5">
<Activity className="size-3" />Decision support, not a substitute for official review.</span>
</footer>
</div>
</>
}
