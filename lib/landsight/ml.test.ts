import assert from 'node:assert/strict'
import test from 'node:test'
import { MODEL_PERFORMANCE, PROJECTS } from './data'
import { landSightService } from './service'
import { validateModelPerformance } from './performance'
import performanceReport from '../../backend/artifacts/performance.json'
import { predictionInput, validateMLPrediction, type MLPrediction, type ShapContribution } from './ml'

function fixture(): MLPrediction {
  const contribution: ShapContribution = {
    id: 'legalCases', featureName: 'legalCases', name: 'Pending legal cases', inputValue: 3,
    contribution: 0.2, description: 'Pending legal cases (3) increased predicted risk relative to the model baseline.',
    transformedValues: { legalCases: 3 }, direction: 'increases risk', relativeImportance: 1,
  }
  return {
    score: 60, level: 'MEDIUM', delayDays: 100, confidence: null, factors: [contribution], model: 'test-only', isDemo: true,
    metadata: { status: 'trained', algorithm: 'Random Forest', version: 'test-only', explanationMethod: 'tree-shap', notice: 'Synthetic test fixture', trainedAt: '2026-09-13', featureSchemaVersion: 'test-only' },
    riskCategory: 'Medium', featureValues: { legalCases: 3 }, transformedFeatureValues: { legalCases: 3 },
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

test('service forwards each selected project and returns the exact trained prediction and SHAP', async t => {
  const requests: unknown[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/ml/predict')
    assert.equal(options.method, 'POST')
    requests.push(JSON.parse(options.body as string))
    return Response.json(fixture())
  })
  for (const project of PROJECTS.slice(0, 2)) {
    const prediction = await landSightService.predict(project)
    assert.deepEqual(prediction, fixture())
    assert.equal(prediction.fallbackReason, undefined)
  }
  assert.deepEqual(requests, PROJECTS.slice(0, 2).map(project => ({ project: predictionInput(project) })))
  t.mock.restoreAll()
})

test('unavailable, invalid, rejected and demo API responses retain explicitly labeled project-specific fallback', async t => {
  const cases = [
    { response: () => { throw new TypeError('Network failure') }, reason: /API unavailable/ },
    { response: () => Response.json({ error: { code: 'ML_UNAVAILABLE' } }, { status: 503 }), reason: /API unavailable/ },
    { response: () => Response.json({ error: {} }, { status: 422 }), reason: /Prediction error/ },
    { response: () => Response.json({ error: {} }, { status: 500 }), reason: /Prediction error/ },
    { response: () => new Response('not JSON'), reason: /Invalid response/ },
    { response: () => Response.json({ score: 101 }), reason: /Invalid response/ },
    { response: () => Response.json({ ...fixture(), metadata: { status: 'demo' } }), reason: /demo mode/ },
  ]
  for (const entry of cases) {
    t.mock.method(globalThis, 'fetch', async () => entry.response())
    for (const project of PROJECTS.slice(0, 2)) {
      const result = await landSightService.predict(project)
      assert.match(result.fallbackReason!, entry.reason)
      assert.equal(result.score, project.prediction.score)
      assert.deepEqual(result.factors, project.prediction.factors)
      assert.notEqual(result.metadata?.status, 'trained')
    }
    t.mock.restoreAll()
  }
})

test('SHAP unavailability retains trained score without substituting rule contributions', async t => {
  const prediction = fixture()
  prediction.explanation = {
    status: 'unavailable', method: 'tree-shap', modelVersion: 'test-only', algorithm: 'Random Forest', featureSchemaVersion: 'test-only',
    shapVersion: null, featurePerturbation: 'tree_path_dependent', target: 'Synthetic class 1', notice: 'Synthetic fixture',
    unavailableReason: 'SHAP failed. Prediction retained.', contributions: [], topRiskFactors: [], riskReducingFactors: [],
  }
  prediction.factors = []
  t.mock.method(globalThis, 'fetch', async () => Response.json(prediction))
  assert.deepEqual(await landSightService.predict(PROJECTS[0]), prediction)
  t.mock.restoreAll()
})

test('measured performance is returned without fabricating metrics, with honest fallback on failure', async t => {
  assert.deepEqual(validateModelPerformance(performanceReport), performanceReport)
  for (const invalid of [null, {}, MODEL_PERFORMANCE, { ...performanceReport, confusionMatrix: {} }, { ...performanceReport, metrics: [null] }, { ...performanceReport, trainingRecords: -1 }]) {
    assert.throws(() => validateModelPerformance(invalid))
  }
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/ml/model-performance')
    return Response.json(performanceReport)
  })
  assert.deepEqual(await landSightService.getModelPerformance(), performanceReport)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }))
  const fallback = await landSightService.getModelPerformance()
  assert.equal(fallback.evaluationScope, undefined)
  assert.match(fallback.fallbackReason!, /API unavailable/)
  assert.deepEqual(fallback.metrics, MODEL_PERFORMANCE.metrics)
  t.mock.restoreAll()
})
