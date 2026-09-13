import type { DashboardSummary, Project, ProjectStage, RiskFactor, RiskLevel, RiskPrediction, SimulationInput, SimulationResult } from './types'

export const RISK_THRESHOLDS = { low: 30, medium: 60, high: 80 } as const
export const RISK_COLORS: Record<RiskLevel, string> = { LOW: '#32886b', MEDIUM: '#d4a42c', HIGH: '#e17f42', CRITICAL: '#d45454' }
export const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n))
export function riskLevel(score: number): RiskLevel {
  return score <= RISK_THRESHOLDS.low ? 'LOW' : score <= RISK_THRESHOLDS.medium ? 'MEDIUM' : score <= RISK_THRESHOLDS.high ? 'HIGH' : 'CRITICAL'
}
type RiskInputs = Pick<Project, 'totalParcels' | 'acquiredParcels' | 'compensationPaid' | 'legalCases' | 'approvalDays' | 'complexity'>
export function predictRisk(p: RiskInputs): RiskPrediction {
  const progress = p.acquiredParcels / p.totalParcels
  const rounded = (n: number) => Math.round(n * 10) / 10
  const factors: RiskFactor[] = [
    { id: 'compensation', name: 'Compensation disputes', contribution: rounded((100 - p.compensationPaid) * .3), description: `${100 - p.compensationPaid}% of compensation is outstanding.` },
    { id: 'legal', name: 'Pending legal cases', contribution: rounded(Math.min(p.legalCases / 20, 1) * 25), description: `${p.legalCases} unresolved legal cases affect possession.` },
    { id: 'approval', name: 'Approval delays', contribution: rounded(Math.min(p.approvalDays / 120, 1) * 20), description: `${p.approvalDays} days estimated for pending clearances.` },
    { id: 'complexity', name: 'Land parcel complexity', contribution: rounded(p.complexity * 2), description: `Fragmentation index ${p.complexity}/5, based on the synthetic parcel profile.` },
    { id: 'pending', name: 'Pending land parcels', contribution: rounded((1 - progress) * 18), description: `${p.totalParcels - p.acquiredParcels} of ${p.totalParcels} parcels remain to be acquired.` },
    { id: 'progress', name: 'Acquisition progress', contribution: rounded(-progress * 12), description: `${Math.round(progress * 100)}% acquired; completed acquisition reduces risk.` },
  ]
  const score = Math.round(clamp(8 + factors.reduce((sum, f) => sum + f.contribution, 0)))
  return { score, level: riskLevel(score), delayDays: Math.round(score * .72 + p.approvalDays * .18 + p.legalCases * .6), confidence: 87, factors, model: 'LS-DEMO-1.0', isDemo: true }
}
export function simulateRisk(project: Project, input: SimulationInput): SimulationResult {
  if (!Object.values(input).every(Number.isFinite)) throw new Error('All simulation inputs must be valid numbers.')
  if (input.compensationPaid < 0 || input.compensationPaid > 100 || input.legalCases < 0 || input.legalCases > project.legalCases || input.approvalDays < 0 || input.approvalDays > 180 || !Number.isInteger(input.legalCases) || !Number.isInteger(input.acquiredParcels) || input.acquiredParcels < 0 || input.acquiredParcels > project.totalParcels) throw new Error('Simulation inputs are outside their allowed ranges.')
  const simulated = predictRisk({ ...project, ...input })
  return { projectId: project.id, current: project.prediction, simulated, riskReduction: project.riskScore - simulated.score, daysSaved: project.expectedDelay - simulated.delayDays, input, isDemo: true }
}
export function getStages(p: RiskInputs): ProjectStage[] {
  const progress = Math.round(p.acquiredParcels / p.totalParcels * 100)
  const rows: [string, number, number][] = [
    ['Land identification', 100, 0], ['Notification', Math.min(100, progress + 45), 5],
    ['Valuation', Math.min(100, p.compensationPaid + 20), 12], ['Compensation', p.compensationPaid, Math.round((100 - p.compensationPaid) * .6)],
    ['Possession', progress, Math.round((100 - progress) * .4)], ['Legal resolution', Math.max(0, 100 - p.legalCases * 4), p.legalCases * 2], ['Final acquisition', progress, Math.round(p.approvalDays * .3)],
  ]
  return rows.map(([name, completion, delayDays]) => ({ name, completion, delayDays: completion === 100 ? 0 : delayDays, risk: riskLevel(completion === 100 ? 10 : Math.min(100, 100 - completion + delayDays / 2)), status: completion === 100 ? 'Complete' : completion === 0 ? 'Not started' : completion < 45 ? 'Needs attention' : 'In progress' }))
}
export function summarize(projects: Project[]): DashboardSummary {
  const count = projects.length
  const highRisk = projects.filter(p => p.riskScore > RISK_THRESHOLDS.medium).length
  return { total: count, highRisk, critical: projects.filter(p => p.riskLevel === 'CRITICAL').length, progress: count ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / count) : 0, pending: projects.reduce((s, p) => s + p.pendingParcels, 0), atRiskPercent: count ? Math.round(highRisk / count * 100) : 0, averageDelay: count ? Math.round(projects.reduce((s, p) => s + p.expectedDelay, 0) / count) : 0, states: new Set(projects.map(p => p.state)).size }
}
