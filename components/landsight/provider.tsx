'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import useSWR, { SWRConfig } from 'swr'
import { AUDIT_LOGS, ROLE_PERMISSIONS, ROLE_PROFILES } from '@/lib/landsight/data'
import { DEFAULT_FILTERS, landSightService } from '@/lib/landsight/service'
import { fetchProjectDataset } from '@/lib/landsight/project-data'
import type { Alert, AuditContext, AuditLog, Filters, ImportRecord, Role, User } from '@/lib/landsight/types'
import { Toaster } from '@/components/ui/sonner'

interface WorkspaceContext {
  filters: Filters
  setFilters: (filters: Partial<Filters>) => void
  resetFilters: () => void
  user: User
  setRole: (role: Role) => void
  permissions: (typeof ROLE_PERMISSIONS)[Role]
  selectedProjectId: string
  setSelectedProject: (id: string) => void
  addAudit: (action: string, project?: string, result?: AuditLog['result'], context?: AuditContext) => void
}
const moduleNames: Record<string, string> = {
  '': 'Dashboard', projects: 'Projects', 'risk-analysis': 'Risk Analysis', gis: 'GIS Map',
  recommendations: 'Recommendations', simulation: 'Impact Simulation', alerts: 'Alerts',
  analytics: 'Analytics', 'data-management': 'Data Management', 'model-performance': 'Model Performance',
  'audit-logs': 'Audit Logs', login: 'Role Preview',
}
const Context = createContext<WorkspaceContext | null>(null)
function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [filters, updateFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [role, setRole] = useState<Role>('Admin')
  const pathname = usePathname()
  const { data: selectedProjectId = '', mutate: mutateSelection } = useSWR<string>('session:project', null, { fallbackData: '' })
  const setSelectedProject = useCallback((id: string) => { void mutateSelection(id, { revalidate: false }) }, [mutateSelection])
  const { mutate } = useSWR<AuditLog[]>('session:audit', null, { fallbackData: AUDIT_LOGS })
  const user: User = { id: 'demo-viewer', name: ROLE_PROFILES[role].name, role, mode: 'role-preview' }
  const addAudit: WorkspaceContext['addAudit'] = (action, project = 'Workspace', result = 'Success', context = {}) => {
    const eventRole = context.role ?? role
    const row: AuditLog = {
      id: crypto.randomUUID(), user: ROLE_PROFILES[eventRole].name, role: eventRole,
      module: context.module ?? moduleNames[pathname.split('/')[1]] ?? 'Workspace',
      action, project, details: context.details ?? 'Performed in the demonstration interface; retained for this browser session only.',
      timestamp: new Date().toISOString(), result, source: 'This session',
    }
    void mutate(current => [row, ...(current ?? AUDIT_LOGS)], { revalidate: false })
  }
  return (
    <Context.Provider value={{ filters, setFilters: next => updateFilters(current => ({ ...current, ...next })), resetFilters: () => updateFilters(DEFAULT_FILTERS), user, setRole, permissions: ROLE_PERMISSIONS[role], selectedProjectId, setSelectedProject, addAudit }}>
      {children}
      <Toaster theme="light" position="bottom-right" richColors />
    </Context.Provider>
  )
}
export function Providers({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false }}><WorkspaceProvider>{children}</WorkspaceProvider></SWRConfig>
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Workspace provider is missing'); return value }
export function useProjects() {
  const result = useSWR('api:projects', () => fetchProjectDataset())
  return { ...result, data: result.data?.projects, storage: result.data?.storage, storageNotice: result.data?.notice }
}
export const useAlerts = () => useSWR<Alert[]>('demo:alerts', () => landSightService.getAlerts(), { revalidateIfStale: false, revalidateOnReconnect: false })
export const useAudit = () => useSWR<AuditLog[]>('session:audit', null, { fallbackData: AUDIT_LOGS })
export const useImports = () => useSWR<ImportRecord[]>('session:imports', null, { fallbackData: [] })
