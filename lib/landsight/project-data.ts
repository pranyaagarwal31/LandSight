import { PROJECTS } from './data'
import { validateMLPrediction } from './ml'
import type { Project } from './types'

export interface ProjectDataset { projects: Project[]; storage: 'postgres' | 'demo-memory'; notice: string }

export function validateProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) throw new Error('Invalid project API response.')
  const ids = new Set<string>()
  for (const row of value) {
    const p = row as Project | null
    if (!p || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.id) || ids.has(p.id)
      || p.source !== 'Synthetic'
      || !['name', 'state', 'district', 'agency', 'clearanceStatus', 'primaryRisk', 'expectedCompletion'].every(key => typeof p[key as keyof Project] === 'string')
      || !['Highway', 'Railway', 'Irrigation', 'Power', 'Industrial', 'Road infrastructure'].includes(p.type)
      || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p.riskLevel)
      || !['On track', 'At risk', 'Delayed'].includes(p.status)
      || !['totalParcels', 'acquiredParcels', 'pendingParcels', 'landowners', 'compensationPaid', 'compensationBudgetCr', 'legalCases', 'approvalDays', 'approvalsPending', 'complexity', 'progress', 'riskScore', 'expectedDelay', 'riskChange', 'latitude', 'longitude'].every(key => Number.isFinite(p[key as keyof Project]))
      || p.totalParcels <= 0 || p.acquiredParcels < 0 || p.acquiredParcels > p.totalParcels
      || p.pendingParcels !== p.totalParcels - p.acquiredParcels || Math.abs(p.progress - p.acquiredParcels / p.totalParcels * 100) > .500001
      || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180
      || !p.prediction || p.prediction.isDemo !== true || !Array.isArray(p.prediction.factors)
      || !Array.isArray(p.stages) || p.stages.some(s => !s || typeof s.name !== 'string' || !Number.isFinite(s.completion) || !Number.isFinite(s.delayDays))) {
      throw new Error('Invalid project API response; no demo data was substituted.')
    }
    if (p.prediction.metadata?.status === 'trained') validateMLPrediction(p.prediction)
    else if (p.prediction.metadata?.status !== 'demo') throw new Error('Missing prediction provenance.')
    ids.add(p.id)
  }
  return value as Project[]
}

export async function fetchProjectDataset(path = '/api/projects'): Promise<ProjectDataset> {
  const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(35_000) })
  const storage = response.headers.get('x-landsight-storage')
  if (storage === 'demo-fallback' || response.ok && storage === 'demo-memory') {
    return { projects: PROJECTS, storage: 'demo-memory', notice: 'Demo / in-memory synthetic projects — not persisted.' }
  }
  if (!response.ok || storage !== 'postgres') throw new Error('Persisted projects unavailable. Check the FastAPI service and database; no demo data was substituted.')
  return { projects: validateProjects(await response.json()), storage, notice: 'PostgreSQL / PostGIS · Persisted synthetic projects' }
}
