'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import useSWR, { SWRConfig } from 'swr'
import { AUDIT_LOGS } from '@/lib/landsight/data'
import { DEFAULT_FILTERS, landSightService } from '@/lib/landsight/service'
import type { Alert, AuditLog, Filters, ImportRecord, Role, User } from '@/lib/landsight/types'
import { Toaster } from '@/components/ui/sonner'

interface WorkspaceContext {
  filters: Filters; setFilters: (filters: Partial<Filters>) => void; resetFilters: () => void
  user: User; setRole: (role: Role) => void
  addAudit: (action: string, project?: string, result?: AuditLog['result']) => void
}
const Context = createContext<WorkspaceContext | null>(null)
function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [filters, updateFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [role, setRole] = useState<Role>('Admin')
  const { mutate } = useSWR<AuditLog[]>('session:audit', null, { fallbackData: AUDIT_LOGS })
  const user: User = { id: 'demo-viewer', name: role === 'Admin' ? 'Aarav Sharma' : role === 'State/District Officer' ? 'Priya Verma' : 'Arjun Mehta', role, mode: 'role-preview' }
  const addAudit = (action: string, project = 'Workspace', result: AuditLog['result'] = 'Success') => {
    const row: AuditLog = { id: crypto.randomUUID(), user: `${user.name} (role preview)`, action, project, timestamp: new Date().toISOString(), result, source: 'This session' }
    void mutate(current => [row, ...(current ?? AUDIT_LOGS)], { revalidate: false })
  }
  return <Context.Provider value={{ filters, setFilters: next => updateFilters(current => ({ ...current, ...next })), resetFilters: () => updateFilters(DEFAULT_FILTERS), user, setRole, addAudit }}>{children}<Toaster theme="light" position="bottom-right" richColors /></Context.Provider>
}
export function Providers({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}><WorkspaceProvider>{children}</WorkspaceProvider></SWRConfig>
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Workspace provider is missing'); return value }
export const useProjects = () => useSWR('demo:projects', () => landSightService.getProjects())
export const useAlerts = () => useSWR<Alert[]>('demo:alerts', () => landSightService.getAlerts())
export const useAudit = () => useSWR<AuditLog[]>('session:audit', null, { fallbackData: AUDIT_LOGS })
export const useImports = () => useSWR<ImportRecord[]>('session:imports', null, { fallbackData: [] })
