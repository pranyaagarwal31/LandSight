import type { Alert, Filters, Project, Role } from './types'
import { filterProjects } from './service'

export function demoRegion(projects: Project[]) {
  return projects.some(p => p.state === 'Maharashtra') ? 'Maharashtra' : [...new Set(projects.map(p => p.state))].sort()[0] ?? ''
}

export function dashboardScope(projects: Project[], role: Role, filters: Partial<Filters>, selectedId = '') {
  const ordered = [...projects].sort((a, b) => a.id.localeCompare(b.id))
  const state = role === 'State/District Officer' ? filters.state || demoRegion(projects) : ''
  const portfolio = role === 'Project Manager' ? ordered.slice(0, 3) : role === 'State/District Officer' ? ordered.filter(p => p.state === state) : projects
  const visible = filterProjects(portfolio, filters)
  const selected = role === 'Project Manager' ? visible.find(p => p.id === selectedId) ?? visible[0] : undefined
  return { state, portfolio, projects: visible, selected }
}

export function regionalPriorities(projects: Project[]) {
  return projects.filter(p => p.riskScore > 60 || p.legalCases > 10 || p.approvalDays > 60 || p.compensationPaid < 80 || p.progress < 60)
    .sort((a, b) => b.riskScore - a.riskScore || b.expectedDelay - a.expectedDelay || a.id.localeCompare(b.id))
}

export function dashboardAlerts(alerts: Alert[], projects: Project[]) {
  const ids = new Set(projects.map(p => p.id))
  const severity = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return alerts.filter(a => ids.has(a.projectId) && a.status !== 'Resolved')
    .sort((a, b) => severity[a.severity] - severity[b.severity] || a.id.localeCompare(b.id))
}
