import { MLAPIError, requestML } from './ml'
import type { ModelPerformance } from './types'

export function validateModelPerformance(value: unknown): ModelPerformance {
  const model = value as ModelPerformance | null
  const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!model || model.evaluationScope !== 'synthetic-held-out-test' || model.isDemo !== true
    || !['version', 'lastTrained', 'algorithm', 'notice', 'featureImportanceMethod', 'featureSchemaVersion', 'target', 'probabilityNotice'].every(key => typeof model[key as keyof ModelPerformance] === 'string')
    || !Number.isFinite(Date.parse(model.lastTrained)) || !count(model.trainingRecords) || !count(model.features)
    || !Array.isArray(model.metrics) || !model.metrics.length || model.metrics.some(m => !m || typeof m.name !== 'string' || typeof m.value !== 'string' || typeof m.description !== 'string')
    || !model.confusionMatrix || !['truePositive', 'falsePositive', 'trueNegative', 'falseNegative'].every(k => count(model.confusionMatrix[k as keyof typeof model.confusionMatrix]))
    || !Array.isArray(model.featureImportance) || !model.featureImportance.length || model.featureImportance.some(f => !f || typeof f.name !== 'string' || !Number.isFinite(f.importance) || f.importance < 0 || f.importance > 100)
    || !model.split || ![model.split.train, model.split.validation, model.split.test].every(count) || typeof model.split.strategy !== 'string'
    || model.trainingRecords !== model.split.train
    || Object.values(model.confusionMatrix).reduce((sum, n) => sum + n, 0) !== model.split.test) {
    throw new MLAPIError('invalid-response', 'Invalid measured model-performance response.')
  }
  return model
}

export async function fetchModelPerformance() {
  return validateModelPerformance(await requestML('/api/ml/model-performance'))
}
