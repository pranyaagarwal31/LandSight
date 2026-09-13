import assert from 'node:assert/strict'
import test from 'node:test'
import { ALERTS, PROJECTS, recommendationsFor } from './data'
import { predictRisk, riskLevel, simulateRisk, summarize } from './risk'
import { CSV_COLUMNS, filterProjects, validateCSV } from './service'

test('risk thresholds include their specified boundaries', () => {
  assert.equal(riskLevel(0), 'LOW'); assert.equal(riskLevel(30), 'LOW')
  assert.equal(riskLevel(31), 'MEDIUM'); assert.equal(riskLevel(60), 'MEDIUM')
  assert.equal(riskLevel(61), 'HIGH'); assert.equal(riskLevel(80), 'HIGH')
  assert.equal(riskLevel(81), 'CRITICAL'); assert.equal(riskLevel(100), 'CRITICAL')
})
test('all project records have consistent derived values and unique IDs', () => {
  assert.equal(PROJECTS.length, 24)
  assert.equal(new Set(PROJECTS.map(p => p.id)).size, 24)
  PROJECTS.forEach(p => {
    assert.equal(p.pendingParcels + p.acquiredParcels, p.totalParcels)
    assert.equal(p.riskScore, predictRisk(p).score)
    assert.equal(p.expectedDelay, predictRisk(p).delayDays)
    assert.equal(p.riskLevel, riskLevel(p.riskScore))
    assert.equal(p.stages.length, 7)
    assert.ok(p.riskScore >= 0 && p.riskScore <= 100)
    assert.ok(recommendationsFor(p).every(r => r.projectId === p.id))
  })
  assert.ok(ALERTS.every(a => PROJECTS.some(p => p.id === a.projectId)))
})
test('unchanged simulations are idempotent; interventions reduce risk', () => {
  PROJECTS.forEach(p => {
    const baseline = simulateRisk(p, { compensationPaid: p.compensationPaid, legalCases: p.legalCases, approvalDays: p.approvalDays, acquiredParcels: p.acquiredParcels })
    assert.equal(baseline.riskReduction, 0); assert.equal(baseline.daysSaved, 0)
    const improved = simulateRisk(p, { compensationPaid: 100, legalCases: 0, approvalDays: 0, acquiredParcels: p.totalParcels })
    assert.ok(improved.simulated.score <= p.riskScore)
    assert.ok(improved.simulated.delayDays <= p.expectedDelay)
    assert.equal(p.riskScore, predictRisk(p).score)
  })
})
test('invalid simulation inputs cannot enter the model', () => {
  const p = PROJECTS[0]
  const valid = { compensationPaid: 100, legalCases: 0, approvalDays: 0, acquiredParcels: p.totalParcels }
  assert.throws(() => simulateRisk(p, { ...valid, compensationPaid: 101 }))
  assert.throws(() => simulateRisk(p, { ...valid, acquiredParcels: p.totalParcels + 1 }))
  assert.throws(() => simulateRisk(p, { ...valid, legalCases: NaN }))
})
test('filters and summary handle geographic selections and empty datasets', () => {
  const selected = filterProjects(PROJECTS, { state: 'Maharashtra', district: 'Pune' })
  assert.equal(selected.length, 1)
  assert.equal(selected[0].district, 'Pune')
  assert.equal(summarize([]).progress, 0)
  assert.equal(summarize(PROJECTS).pending, PROJECTS.reduce((s, p) => s + p.pendingParcels, 0))
})
test('CSV validation distinguishes valid rows, duplicates, and missing columns', async () => {
  const row = 'LS-UPLOAD-001,Sample district road,Maharashtra,Pune,Road infrastructure,100,50,60,3,30,2,18.5204,73.8567'
  const csv = `${CSV_COLUMNS.join(',')}\n${row}`
  const good = await validateCSV(new File([csv], 'sample.csv'))
  assert.equal(good.valid, 1); assert.equal(good.errors.length, 0)
  const duplicate = await validateCSV(new File([`${csv}\n${row}`], 'duplicate.csv'))
  assert.equal(duplicate.valid, 1); assert.ok(duplicate.errors.some(e => e.includes('duplicate')))
  const missing = await validateCSV(new File(['name\nExample'], 'missing.csv'))
  assert.equal(missing.valid, 0); assert.ok(missing.errors.some(e => e.includes('Missing columns')))
  await assert.rejects(validateCSV(new File(['invalid'], 'sample.txt')))
})
