'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, CheckCircle2, Layers3, LockKeyhole, MapPinned, ScanLine, ShieldCheck, UserRoundCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useWorkspace } from './provider'
import type { Role } from '@/lib/landsight/types'
import { cn } from '@/lib/utils'

const roles: { name: Role; description: string; icon: typeof ShieldCheck }[] = [
  { name: 'Admin', description: 'National overview, CSV validation, and alert resolution.', icon: ShieldCheck },
  { name: 'State/District Officer', description: 'Regional acquisition monitoring and issue review.', icon: Building2 },
  { name: 'Project Manager', description: 'Project risks, recommendations, and intervention scenarios.', icon: UserRoundCog },
]
export function LoginPage() {
  const { user, setRole, addAudit } = useWorkspace()
  const [role, chooseRole] = useState<Role>(user.role)
  const router = useRouter()
  return <main className="grid min-h-screen lg:grid-cols-2"><section className="flex flex-col justify-between bg-primary p-7 text-primary-foreground sm:p-12 lg:p-16"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg border border-white/30"><Layers3 className="size-6"/></span><div><p className="text-2xl font-semibold tracking-tight">LandSight</p><p className="mt-0.5 text-[9px] tracking-[.15em] text-white/65">LAND ACQUISITION INTELLIGENCE</p></div></div><div className="py-12 lg:py-20"><p className="text-[10px] font-medium tracking-[.2em] text-white/60">FROM EARLY WARNING TO EARLY ACTION</p><h1 className="mt-5 max-w-lg text-4xl leading-tight font-medium tracking-tight sm:text-5xl">See the risks ahead.<br/>Move India forward.</h1><p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">A decision-support workspace to predict land acquisition delays, understand the drivers, and plan better interventions.</p><div className="mt-10 flex flex-col gap-5">{[{ icon: ScanLine, text: 'Transparent risk intelligence' }, { icon: MapPinned, text: 'Connected geospatial oversight' }, { icon: CheckCircle2, text: 'Practical, project-specific actions' }].map(item => <p className="flex items-center gap-3 text-xs text-white/80" key={item.text}><item.icon className="size-4 text-white/60"/>{item.text}</p>)}</div></div><p className="text-[10px] leading-relaxed text-white/55">SMART INDIA HACKATHON 2026 · SIH26017<br/>Smart Automation · Software prototype</p></section><section className="flex items-center justify-center bg-card px-6 py-12 sm:px-12"><div className="w-full max-w-md"><Badge variant="medium">DEMONSTRATION WORKSPACE</Badge><h2 className="mt-5 text-3xl font-semibold tracking-tight">Open your workspace</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Choose a role to explore the LandSight interface. No account or credentials are required.</p><form className="mt-8" onSubmit={e => { e.preventDefault(); setRole(role); addAudit(`Changed interface role preview to ${role}`); router.push(role === 'Admin' ? '/' : '/projects') }}><FieldGroup><FieldSet><FieldLegend>Preview as</FieldLegend>{roles.map(item => <Field key={item.name} orientation="horizontal" className={cn('rounded-lg border p-4', role === item.name && 'border-primary bg-secondary/50')}><input id={`role-${item.name}`} type="radio" name="role" value={item.name} checked={role === item.name} onChange={() => chooseRole(item.name)} className="size-4 accent-primary"/><FieldLabel htmlFor={`role-${item.name}`}><item.icon className="size-5 text-primary"/><span><span className="block text-sm font-medium">{item.name}</span><span className="mt-1 block text-[11px] leading-relaxed font-normal text-muted-foreground">{item.description}</span></span></FieldLabel></Field>)}</FieldSet><Button type="submit" size="lg">Enter demonstration<ArrowRight data-icon="inline-end"/></Button><FieldDescription>Role choices change interface affordances only. They do not authenticate you or enforce data access.</FieldDescription></FieldGroup></form><Alert className="mt-7"><LockKeyhole/><AlertTitle>Real authentication is not connected</AlertTitle><AlertDescription>FastAPI JWT authentication and server-enforced RBAC are planned. This role selector is an interface preview, not a login or security boundary.</AlertDescription></Alert><p className="mt-6 text-center text-[10px] text-muted-foreground">DEMO / SYNTHETIC DATA — For Demonstration Only</p></div></section></main>
}
