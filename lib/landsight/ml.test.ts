import assert from 'node:assert/strict'
import test from 'node:test'
import { PROJECTS } from './data'
import { predictionInput, validateMLPrediction, type MLPrediction, type ShapContribution } from './ml'

function fixture(): MLPrediction {
  const contribution: ShapContribution = {
    id: 'legalCases', featureName: 'legalCases', name: 'Pending legal cases', inputValue: 3,
    contribution: 0.2, description: 'Pending legal cases (3) increased predicted risk relative to the model baseline.',
    transformedValues: { legalCases: 3 }, direction: 'increases risk', relativeImportance: 1,
  }
  return {
    score: 60, level: 'MEDIUM', delayDays: 100, confidence: null, factors: [contribution], model: 'test-only', isDemo: true,
    metadata: { status: 'trained', algorithm: 'Random Forest', version: 'test-only', explanationMethod: 'tree-shap', notice: 'Synthetic test fixture' },
    probability: { value: 0.6, calibrated: false, notice: 'Not confidence' }, warnings: [],
    explanation: {
      status: 'available', method: 'tree-shap', modelVersion: 'test-only', algorithm: 'Random Forest', featureSchemaVersion: 'test-only',
      shapVersion: 'test-only', featurePerturbation: 'tree_path_dependent', target: 'Synthetic class 1', notice: 'Synthetic test fixture',
      outputSpace: 'probability', baseValue: 0.4, outputValue: 0.6, predictedProbability: 0.6, contributions: [contribution],
      topRiskFactors: [contribution], riskReducingFactors: [], transformedContributions: { legalCases: 0.2 }, unavailableReason: null,
    },
  }
}

test('ML requests use supported raw project inputs, not demo outputs', () => {
  const input = predictionInput(PROJECTS[0])
  assert.equal(input.id, PROJECTS[0].id)
  assert.equal(input.legalCases, PROJECTS[0].legalCases)
  assert.equal(input.acquiredParcels, PROJECTS[0].acquiredParcels)
  for (const key of ['riskScore', 'prediction', 'stages', 'expectedDelay', 'riskLevel']) assert.equal(key in input, false)
  assert.notDeepEqual(input, predictionInput(PROJECTS[1]))
})

test('verified probability and log-odds responses remain correctly labeled', () => {
  assert.equal(validateMLPrediction(fixture()).explanation.status, 'available')
  const prediction = fixture()
  if (prediction.explanation.status !== 'available') throw new Error('Bad test fixture')
  const e = prediction.explanation
  e.outputSpace = 'log_odds'
  e.outputValue = Math.log(0.6 / 0.4)
  e.baseValue = e.outputValue - 0.2
  assert.equal(validateMLPrediction(prediction).score, 60)
})

test('unavailable SHAP is distinct from demo predictions and fake zero values', () => {
  const prediction = fixture()
  prediction.explanation = {
    status: 'unavailable', method: 'tree-shap', modelVersion: 'test-only', algorithm: 'Random Forest', featureSchemaVersion: 'test-only',
    shapVersion: null, featurePerturbation: 'tree_path_dependent', target: 'Synthetic class 1', notice: 'Synthetic fixture',
    unavailableReason: 'SHAP failed. Prediction retained.', contributions: [], topRiskFactors: [], riskReducingFactors: [],
  }
  assert.equal(validateMLPrediction(prediction).explanation.status, 'unavailable')
  assert.throws(() => validateMLPrediction({ ...prediction, metadata: { ...prediction.metadata, status: 'demo' } }))
  assert.throws(() => validateMLPrediction({ ...prediction, explanation: { ...prediction.explanation, contributions: fixture().factors } }))
  assert.throws(() => validateMLPrediction({ ...prediction, explanation: null }))
})

test('SHAP response validator rejects inconsistent directions, units, outputs and ranking', () => {
  const original = fixture()
  const e = original.explanation
  assert.throws(() => validateMLPrediction({ ...original, score: 90 }))
  for (const changes of [
    { baseValue: 0 }, { outputValue: Number.NaN }, { predictedProbability: 0.9 }, { outputSpace: 'points' },
    { modelVersion: 'another-model' }, { contributions: [] }, { riskReducingFactors: original.factors },
    { contributions: [{ ...original.factors[0], direction: 'decreases risk', relativeImportance: 1 }] },
  ]) assert.throws(() => validateMLPrediction({ ...original, explanation: { ...e, ...changes } }))
  for (const response of [null, {}, { score: 5 }, 'invalid']) assert.throws(() => validateMLPrediction(response))
})
