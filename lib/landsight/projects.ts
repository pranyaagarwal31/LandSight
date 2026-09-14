import { PROJECTS, PROJECT_TYPES } from './data'
import { validateMLPrediction } from './ml'
import type { Project } from './types'

export interface ProjectCollection {
  projects: Project[]
  source: 'postgresql' | 'demo-fallback'
  notice: string
  predictionsPersisted: boolean
}

const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const fallbackNotice = 'Demo fallback — backend or database unavailable. Showing bundled synthetic projects.'

function invalid(): never {
  throw new Error('The project API returned invalid data. Retry after checking the backend; no demo data was substituted.')
}

export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') return invalid()
  const p = value as Project
  for (const key of ['id', 'name', 'state', 'district', 'clearanceStatus', 'expectedCompletion', 'agency', 'primaryRisk'] as const) {
    if (typeof p[key] !== 'string' || !p[key].trim()) return invalid()
  }
  for (const key of ['totalParcels', 'acquiredParcels', 'pendingParcels', 'landowners', 'legalCases', 'approvalDays', 'approvalsPending', 'complexity', 'riskScore', 'expectedDelay'] as const) {
    if (!Number.isSafeInteger(p[key]) || p[key] < 0) return invalid()
  }
  for (const key of ['compensationPaid', 'compensationBudgetCr', 'progress', 'latitude', 'longitude', 'riskChange'] as const) {
    if (!Number.isFinite(p[key])) return invalid()
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(p.id) || !PROJECT_TYPES.includes(p.type) || p.source !== 'Synthetic'
    || !levels.includes(p.riskLevel) || !['On track', 'At risk', 'Delayed'].includes(p.status)
    || !Number.isFinite(Date.parse(p.expectedCompletion)) || p.totalParcels <= 0 || p.acquiredParcels > p.totalParcels
    || p.pendingParcels !== p.totalParcels - p.acquiredParcels || p.compensationPaid < 0 || p.compensationPaid > 100
    || p.compensationBudgetCr < 0 || p.complexity < 1 || p.complexity > 5 || p.approvalDays > 180
    || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180 || p.riskScore > 100
    || Math.abs(p.progress - p.acquiredParcels / p.totalParcels * 100) > 0.500001) return invalid()
  const prediction = p.prediction
  if (!prediction || prediction.score !== p.riskScore || prediction.level !== p.riskLevel
    || prediction.delayDays !== p.expectedDelay || prediction.isDemo !== true || !Array.isArray(prediction.factors)
    || typeof prediction.model !== 'string' || (prediction.metadata?.status !== undefined && !['trained', 'demo'].includes(prediction.metadata.status))) return invalid()
  if (prediction.metadata?.status === 'trained') validateMLPrediction(prediction)
  if (!prediction.factors.every(f => f && typeof f.id === 'string' && typeof f.name === 'string'
    && typeof f.description === 'string' && Number.isFinite(f.contribution))) return invalid()
  if (!Array.isArray(p.stages) || p.stages.length !== 7 || !p.stages.every(s => s && typeof s.name === 'string'
    && Number.isFinite(s.completion) && s.completion >= 0 && s.completion <= 100 && levels.includes(s.risk)
    && Number.isInteger(s.delayDays) && s.delayDays >= 0
    && ['Complete', 'In progress', 'Needs attention', 'Not started'].includes(s.status))) return invalid()
  return p
}

async function requestProjects(path: string): Promise<Response | null> {
  let response: Response
  try {
    response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  } catch {
    return null
  }
  if (response.ok || response.status === 404) return response
  const error = await response.json().catch(() => null)
  if (response.status === 503 && error?.error?.code === 'BACKEND_UNAVAILABLE') return null
  throw new Error(error?.error?.code === 'PROJECT_SOURCE_UNAVAILABLE'
    ? 'The project database is unavailable and backend demo fallback is disabled.'
    : 'The project API could not load this view. No demo data was substituted for a backend error.')
}

export async function fetchProjectCollection(): Promise<ProjectCollection> {
  const response = await requestProjects('/api/projects')
  if (!response) return { projects: PROJECTS, source: 'demo-fallback', notice: fallbackNotice, predictionsPersisted: false }
  if (!response.ok) return invalid()
  const source = response.headers.get('X-LandSight-Data-Source')
  if (source !== 'postgresql' && source !== 'demo-fallback') return invalid()
  const value: unknown = await response.json().catch(() => invalid())
  if (!Array.isArray(value)) return invalid()
  const projects = value.map(validateProject)
  if (new Set(projects.map(p => p.id)).size !== projects.length) return invalid()
  return {
    projects, source, notice: source === 'postgresql' ? 'PostgreSQL / PostGIS — persisted synthetic data, not government records.' : fallbackNotice,
    predictionsPersisted: response.headers.get('X-LandSight-Predictions-Persisted') === 'true',
  }
}

export async function fetchProject(id: string): Promise<Project | undefined> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return undefined
  const response = await requestProjects(`/api/projects/${encodeURIComponent(id)}`)
  if (!response) return PROJECTS.find(p => p.id === id)
  if (response.status === 404) return undefined
  const project = validateProject(await response.json().catch(() => invalid()))
  if (project.id !== id) return invalid()
  return project
}
