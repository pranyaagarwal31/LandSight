import { ALERTS, MODEL_PERFORMANCE, PROJECTS, recommendationsFor } from './data'
import { predictRisk, simulateRisk, summarize } from './risk'
import { fetchMLPrediction, MLAPIError, predictionInput } from './ml'
import { fetchModelPerformance } from './performance'
import type { Filters, ImportRecord, LandSightService, Project } from './types'

export const API_CONTRACT = {
  dashboard: 'GET /api/dashboard', projects: 'GET /api/projects', project: 'GET /api/projects/:id', predict: 'POST /api/predict', explanation: 'GET /api/projects/:id/explanation', recommendations: 'GET /api/projects/:id/recommendations', simulation: 'POST /api/simulation', gis: 'GET /api/gis/projects', alerts: 'GET /api/alerts', upload: 'POST /api/data/upload', performance: 'GET /api/model-performance',
} as const
export const DEFAULT_FILTERS: Filters = { state: '', district: '', type: '', risk: '', search: '', progress: '', status: '' }
export function filterProjects(projects: Project[], filters: Partial<Filters>) {
  return projects.filter(p => (!filters.state || p.state === filters.state) && (!filters.district || p.district === filters.district) && (!filters.type || p.type === filters.type) && (!filters.risk || p.riskLevel === filters.risk) && (!filters.status || p.status === filters.status) && (!filters.progress || (filters.progress === 'below50' ? p.progress < 50 : filters.progress === '50to80' ? p.progress >= 50 && p.progress < 80 : p.progress >= 80)) && (!filters.search || `${p.name} ${p.id} ${p.state} ${p.district} ${p.type}`.toLowerCase().includes(filters.search.trim().toLowerCase())))
}
export function resolveProjectSelection(projects: Project[], filters: Partial<Filters>, requestedId: string | null, rememberedId = '') {
  const filtered = filterProjects(projects, filters)
  const requested = projects.find(p => p.id === requestedId)
  const outsideFilters = !!requested && !filtered.some(p => p.id === requested.id)
  const options = outsideFilters ? [requested!, ...filtered] : filtered
  const project = requested ?? options.find(p => p.id === rememberedId) ?? options[0]
  const notice = requestedId && !requested
    ? 'The linked project does not exist. Select an available project below or clear the project link.'
    : outsideFilters ? 'This linked project is outside the current portfolio filters. The linked project is shown without changing your filters.' : ''
  return { project, options, notice }
}
export const CSV_COLUMNS = ['id', 'name', 'state', 'district', 'type', 'totalParcels', 'acquiredParcels', 'compensationPaid', 'legalCases', 'approvalDays', 'complexity', 'latitude', 'longitude'] as const
export async function validateCSV(file: File): Promise<ImportRecord> {
  if (file.size > 2 * 1024 * 1024) throw new Error('The maximum CSV file size is 2 MB.')
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Please select a .csv file.')
  const Papa = (await import('papaparse')).default
  const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy', transformHeader: value => value.trim(), transform: value => value.trim() })
  if (parsed.data.length > 5000) throw new Error('Limit uploads to 5,000 rows per file.')
  const errors = parsed.errors.map(e => `CSV parsing: ${e.message}`)
  const missing = CSV_COLUMNS.filter(col => !parsed.meta.fields?.includes(col))
  if (missing.length) errors.push(`Missing columns: ${missing.join(', ')}`)
  if (!parsed.data.length) errors.push('The CSV contains no project records.')
  const ids = new Set<string>()
  let valid = 0
  parsed.data.forEach((row, i) => {
    const issues: string[] = []
    CSV_COLUMNS.forEach(key => { if (!row[key]) issues.push(`${key} is required`) })
    if (ids.has(row.id)) issues.push('duplicate project ID')
    ids.add(row.id)
    if (PROJECTS.some(p => p.id === row.id)) issues.push('project ID already exists in the demo dataset')
    if (!['Highway', 'Railway', 'Irrigation', 'Power', 'Industrial', 'Road infrastructure'].includes(row.type)) issues.push('unknown project type')
    const n = (key: string) => Number(row[key])
    for (const key of ['totalParcels', 'acquiredParcels', 'legalCases', 'approvalDays', 'complexity']) if (!Number.isInteger(n(key)) || n(key) < 0) issues.push(`${key} must be a non-negative integer`)
    if (!(n('totalParcels') > 0) || n('acquiredParcels') > n('totalParcels')) issues.push('parcel totals are inconsistent')
    if (!Number.isFinite(n('compensationPaid')) || n('compensationPaid') < 0 || n('compensationPaid') > 100) issues.push('compensationPaid must be 0–100')
    if (n('complexity') < 1 || n('complexity') > 5) issues.push('complexity must be 1–5')
    if (n('approvalDays') > 180) issues.push('approvalDays must be 0–180')
    if (!Number.isFinite(n('latitude')) || !Number.isFinite(n('longitude')) || n('latitude') < 6 || n('latitude') > 38 || n('longitude') < 68 || n('longitude') > 98) issues.push('coordinates must be within the India-focused demo bounds')
    if (issues.length) errors.push(`Row ${i + 2}: ${issues.join('; ')}`)
    else valid++
  })
  return { id: crypto.randomUUID(), name: file.name, rows: parsed.data.length, valid: missing.length || parsed.errors.length ? 0 : valid, errors, date: new Date().toISOString(), source: 'Uploaded — validation only' }
}

export const landSightService: LandSightService = {
  getProjects: async () => PROJECTS,
  getProject: async id => PROJECTS.find(p => p.id === id),
  getDashboard: async projects => summarize(projects),
  predict: async project => {
    try { return await fetchMLPrediction(predictionInput(project)) }
    catch (error) { return { ...predictRisk(project), fallbackReason: error instanceof MLAPIError ? error.message : 'Prediction error. The ML result could not be loaded.' } }
  },
  getExplanation: async id => {
    const project = PROJECTS.find(p => p.id === id)
    return project ? (await landSightService.predict(project)).factors : []
  },
  getRecommendations: async id => PROJECTS.filter(p => !id || p.id === id).flatMap(recommendationsFor),
  simulate: async (project, input) => simulateRisk(project, input),
  getGISProjects: async () => PROJECTS,
  getAlerts: async () => ALERTS.map(a => ({ ...a })),
  validateUpload: validateCSV,
  getModelPerformance: async () => {
    try { return await fetchModelPerformance() }
    catch (error) { return { ...MODEL_PERFORMANCE, fallbackReason: error instanceof MLAPIError ? error.message : 'Invalid model-performance response.' } }
  },
}
