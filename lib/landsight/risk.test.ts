import assert from 'node:assert/strict'
import test from 'node:test'
import { ALERTS, AUDIT_LOGS, MODEL_PERFORMANCE, PROJECTS, ROLE_PERMISSIONS, recommendationsFor } from './data'
import { predictRisk, riskLevel, simulateRisk, summarize } from './risk'
import { CSV_COLUMNS, filterProjects, resolveProjectSelection, validateCSV } from './service'

test('linked projects survive conflicting filters and invalid links recover', () => {
  const linked = PROJECTS[0]
  const filters = { state: 'Maharashtra' }
  const selection = resolveProjectSelection(PROJECTS, filters, linked.id)
  assert.equal(selection.project?.id, linked.id)
  assert.ok(selection.options.some(p => p.id === linked.id))
  assert.match(selection.notice, /outside/)
  const remembered = resolveProjectSelection(PROJECTS, {}, null, PROJECTS[8].id)
  assert.equal(remembered.project?.id, PROJECTS[8].id)
  const unknown = resolveProjectSelection(PROJECTS, filters, 'missing')
  assert.equal(unknown.project?.state, 'Maharashtra')
  assert.match(unknown.notice, /does not exist/)
  assert.equal(resolveProjectSelection(PROJECTS, { search: 'no such project' }, null).project, undefined)
})
test('preview capabilities keep administrative mutations restricted', () => {
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    assert.equal(permissions.validateCSV, role === 'Admin')
    assert.equal(permissions.resolveAlerts, role === 'Admin')
    assert.equal(permissions.exportAudit, role === 'Admin')
  }
})
test('audit seed references and model metrics remain internally consistent', () => {
  assert.equal(new Set(AUDIT_LOGS.map(row => row.id)).size, AUDIT_LOGS.length)
  for (const row of AUDIT_LOGS) {
    assert.ok(Number.isFinite(Date.parse(row.timestamp)))
    assert.equal(row.source, 'Synthetic')
    if (row.project.startsWith('LS-2026-')) assert.ok(PROJECTS.some(p => p.id === row.project))
  }
  const m = MODEL_PERFORMANCE.confusionMatrix
  const total = Object.values(m).reduce((sum, count) => sum + count, 0)
  const metric = (name: string) => MODEL_PERFORMANCE.metrics.find(row => row.name === name)!.value
  assert.equal(metric('Accuracy'), `${((m.truePositive + m.trueNegative) / total * 100).toFixed(1)}%`)
  assert.equal(metric('Precision'), `${(m.truePositive / (m.truePositive + m.falsePositive) * 100).toFixed(1)}%`)
  assert.equal(metric('Recall'), (m.truePositive / (m.truePositive + m.falseNegative)).toFixed(2))
  assert.equal(metric('F1 Score'), (2 * m.truePositive / (2 * m.truePositive + m.falsePositive + m.falseNegative)).toFixed(2))
  assert.ok(Math.abs(MODEL_PERFORMANCE.featureImportance.reduce((sum, f) => sum + f.importance, 0) - 100) < 0.001)
})
test('CSV validation catches malformed data and bounded numeric inputs', async () => {
  const row = 'LS-UPLOAD-001,Sample,Maharashtra,Pune,Highway,100,101,110,-1,181,6,0,0'
  const bad = await validateCSV(new File([`${CSV_COLUMNS.join(',')}\n${row}`], 'invalid.csv'))
  assert.equal(bad.valid, 0)
  assert.match(bad.errors.join(' '), /parcel totals are inconsistent/)
  const empty = await validateCSV(new File([CSV_COLUMNS.join(',')], 'empty.csv'))
  assert.equal(empty.valid, 0)
  assert.match(empty.errors.join(' '), /no project records/)
  await assert.rejects(validateCSV(new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'large.csv')), /2 MB/)
})
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
