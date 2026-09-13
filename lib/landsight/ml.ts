import type { Project, RiskFactor, RiskPrediction } from './types'

export interface ShapContribution extends RiskFactor {
  featureName: string
  inputValue: number | string | null
  transformedValues: Record<string, number>
  direction: 'increases risk' | 'decreases risk' | 'no contribution'
  relativeImportance: number
}

interface ExplanationMetadata {
  method: 'tree-shap'
  modelVersion: string
  algorithm: string
  featureSchemaVersion: string
  shapVersion: string | null
  featurePerturbation: 'tree_path_dependent'
  target: string
  notice: string
}

export interface AvailableExplanation extends ExplanationMetadata {
  status: 'available'
  outputSpace: 'log_odds' | 'probability'
  baseValue: number
  outputValue: number
  predictedProbability: number
  contributions: ShapContribution[]
  topRiskFactors: ShapContribution[]
  riskReducingFactors: ShapContribution[]
  transformedContributions: Record<string, number>
  unavailableReason: null
}

export interface UnavailableExplanation extends ExplanationMetadata {
  status: 'unavailable'
  unavailableReason: string
  contributions: []
  topRiskFactors: []
  riskReducingFactors: []
}

export interface MLPrediction extends Omit<RiskPrediction, 'confidence'> {
  confidence: null
  metadata: { status: 'trained'; algorithm: string; version: string; explanationMethod: string; notice: string }
  probability: { value: number; calibrated: false; notice: string }
  explanation: AvailableExplanation | UnavailableExplanation
  warnings: string[]
}

export function predictionInput(project: Project) {
  const { id, name, state, district, type, totalParcels, acquiredParcels, compensationPaid, legalCases,
    approvalDays, complexity, latitude, longitude, landowners, compensationBudgetCr, approvalsPending } = project
  return { id, name, state, district, type, totalParcels, acquiredParcels, compensationPaid, legalCases,
    approvalDays, complexity, latitude, longitude, landowners, compensationBudgetCr, approvalsPending }
}

export function validateMLPrediction(value: unknown): MLPrediction {
  const prediction = value as MLPrediction | undefined
  const explanation = prediction?.explanation
  if (!prediction || prediction.metadata?.status !== 'trained' || prediction.isDemo !== true
    || !Number.isInteger(prediction.score) || prediction.score < 0 || prediction.score > 100
    || !Number.isInteger(prediction.delayDays) || prediction.delayDays < 0
    || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(prediction.level)
    || !explanation || explanation.method !== 'tree-shap' || explanation.modelVersion !== prediction.model
    || !Array.isArray(prediction.warnings) || !prediction.warnings.every(w => typeof w === 'string')) {
    throw new Error('No verified trained-model explanation is available.')
  }
  if (explanation.status === 'unavailable') {
    if (typeof explanation.unavailableReason !== 'string' || !Array.isArray(explanation.contributions) || explanation.contributions.length
      || !Array.isArray(explanation.topRiskFactors) || explanation.topRiskFactors.length
      || !Array.isArray(explanation.riskReducingFactors) || explanation.riskReducingFactors.length) {
      throw new Error('Invalid unavailable explanation response.')
    }
    return prediction
  }
  if (explanation.status !== 'available' || !['probability', 'log_odds'].includes(explanation.outputSpace)
    || !Number.isFinite(explanation.baseValue) || !Number.isFinite(explanation.outputValue)
    || !Number.isFinite(explanation.predictedProbability) || explanation.predictedProbability < 0 || explanation.predictedProbability > 1
    || !Array.isArray(explanation.contributions) || !explanation.contributions.length
    || !Array.isArray(explanation.topRiskFactors) || !Array.isArray(explanation.riskReducingFactors)) {
    throw new Error('Invalid SHAP output metadata.')
  }
  for (const factor of explanation.contributions) {
    const direction = factor.contribution > 0 ? 'increases risk' : factor.contribution < 0 ? 'decreases risk' : 'no contribution'
    if (!Number.isFinite(factor.contribution) || factor.direction !== direction || !Number.isFinite(factor.relativeImportance)
      || factor.relativeImportance < 0 || factor.relativeImportance > 1 || typeof factor.description !== 'string'
      || typeof factor.name !== 'string' || typeof factor.id !== 'string') throw new Error('Invalid SHAP contribution.')
  }
  const total = explanation.baseValue + explanation.contributions.reduce((sum, f) => sum + f.contribution, 0)
  const probability = explanation.outputSpace === 'log_odds' ? 1 / (1 + Math.exp(-explanation.outputValue)) : explanation.outputValue
  if (Math.abs(total - explanation.outputValue) > 1e-4 || Math.abs(probability - explanation.predictedProbability) > 1e-5
    || Math.round(explanation.predictedProbability * 100) !== prediction.score) throw new Error('SHAP does not match the prediction.')
  for (const [factors, sign] of [[explanation.topRiskFactors, 1], [explanation.riskReducingFactors, -1]] as const) {
    if (factors.some(f => f.contribution * sign <= 0 || !explanation.contributions.some(c => c.id === f.id && c.contribution === f.contribution && c.description === f.description))) {
      throw new Error('Invalid ranked SHAP factors.')
    }
  }
  return prediction
}

export async function fetchMLPrediction(input: ReturnType<typeof predictionInput>): Promise<MLPrediction> {
  const response = await fetch('/api/ml/predict', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: input }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('The ML service is unavailable. Demo estimates are unchanged.')
  return validateMLPrediction(await response.json())
}
