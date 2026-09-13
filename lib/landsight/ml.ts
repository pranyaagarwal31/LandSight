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
  metadata: { status: 'trained'; algorithm: string; version: string; explanationMethod: string; notice: string; trainedAt: string; featureSchemaVersion: string }
  probability: { value: number; calibrated: false; notice: string }
  riskCategory: string
  featureValues: Record<string, number | string | null>
  transformedFeatureValues: Record<string, number>
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
  if (prediction.confidence !== null || typeof prediction.model !== 'string' || prediction.metadata.version !== prediction.model
    || !['algorithm', 'notice', 'trainedAt', 'featureSchemaVersion'].every(key => typeof prediction.metadata[key as keyof typeof prediction.metadata] === 'string')
    || !prediction.probability || !Number.isFinite(prediction.probability.value) || prediction.probability.value < 0 || prediction.probability.value > 1
    || prediction.probability.calibrated !== false || typeof prediction.probability.notice !== 'string'
    || Math.round(prediction.probability.value * 100) !== prediction.score
    || prediction.riskCategory !== prediction.level[0] + prediction.level.slice(1).toLowerCase()
    || prediction.level !== (prediction.score <= 30 ? 'LOW' : prediction.score <= 60 ? 'MEDIUM' : prediction.score <= 80 ? 'HIGH' : 'CRITICAL')
    || !validRecord(prediction.featureValues, true) || !validRecord(prediction.transformedFeatureValues)
    || !Array.isArray(prediction.factors) || prediction.factors.some(f => !f || typeof f.id !== 'string' || typeof f.name !== 'string' || typeof f.description !== 'string' || !Number.isFinite(f.contribution))
    || explanation.algorithm !== prediction.metadata.algorithm
    || !['notice', 'target', 'featureSchemaVersion'].every(key => typeof explanation[key as keyof typeof explanation] === 'string')) {
    throw new Error('Invalid trained prediction response.')
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
    if (!factor || !validRecord(factor.transformedValues) || typeof factor.featureName !== 'string'
      || !(factor.inputValue === null || typeof factor.inputValue === 'string' || typeof factor.inputValue === 'number' && Number.isFinite(factor.inputValue))
      || !Number.isFinite(factor.contribution) || factor.direction !== direction || !Number.isFinite(factor.relativeImportance)
      || factor.relativeImportance < 0 || factor.relativeImportance > 1 || typeof factor.description !== 'string'
      || typeof factor.name !== 'string' || typeof factor.id !== 'string') throw new Error('Invalid SHAP contribution.')
  }
  const total = explanation.baseValue + explanation.contributions.reduce((sum, f) => sum + f.contribution, 0)
  const probability = explanation.outputSpace === 'log_odds' ? 1 / (1 + Math.exp(-explanation.outputValue)) : explanation.outputValue
  if (Math.abs(total - explanation.outputValue) > 1e-4 || Math.abs(probability - explanation.predictedProbability) > 1e-5
    || Math.abs(explanation.predictedProbability - prediction.probability.value) > 1e-5
    || typeof explanation.shapVersion !== 'string' || !validRecord(explanation.transformedContributions)
    || Math.round(explanation.predictedProbability * 100) !== prediction.score) throw new Error('SHAP does not match the prediction.')
  for (const [factors, sign] of [[explanation.topRiskFactors, 1], [explanation.riskReducingFactors, -1]] as const) {
    if (factors.some(f => f.contribution * sign <= 0 || !explanation.contributions.some(c => c.id === f.id && c.contribution === f.contribution && c.description === f.description))) {
      throw new Error('Invalid ranked SHAP factors.')
    }
  }
  return prediction
}

export function validRecord(value: unknown, allowRaw = false): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(v => typeof v === 'number' && Number.isFinite(v) || allowRaw && (v === null || typeof v === 'string'))
}

export class MLAPIError extends Error {
  constructor(public kind: 'unavailable' | 'invalid-response' | 'prediction-error', message: string) { super(message) }
}

export async function requestML(path: string, body?: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new MLAPIError('unavailable', 'API unavailable or timed out.')
  }
  let data: unknown
  try { data = await response.json() } catch { throw new MLAPIError('invalid-response', 'Invalid response from the ML API.') }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } } | null)?.error?.code
    if (code === 'INVALID_RESPONSE') throw new MLAPIError('invalid-response', 'Invalid response from the ML API.')
    if (response.status === 503 || code === 'ML_UNAVAILABLE') throw new MLAPIError('unavailable', 'API unavailable: the trained model could not be reached.')
    throw new MLAPIError('prediction-error', response.status === 422 ? 'Prediction error: the backend rejected these project inputs.' : 'Prediction error: the backend could not complete the request.')
  }
  return data
}

export async function fetchMLPrediction(input: ReturnType<typeof predictionInput>): Promise<MLPrediction> {
  const data = await requestML('/api/ml/predict', { project: input })
  if ((data as RiskPrediction | null)?.metadata?.status === 'demo') throw new MLAPIError('unavailable', 'The backend is running in demo mode; trained ML is unavailable.')
  try { return validateMLPrediction(data) } catch { throw new MLAPIError('invalid-response', 'Invalid response: the prediction or SHAP values could not be verified.') }
}
