import assert from 'node:assert/strict'
import test from 'node:test'
import { ALERTS, PROJECTS, recommendationsFor } from './data'
import { dashboardAlerts, dashboardScope, demoRegion, regionalPriorities } from './dashboard-scope'
import { DEFAULT_FILTERS } from './service'
import { summarize } from './risk'

test('roles have distinct deterministic dashboard scopes', () => {
  const admin = dashboardScope(PROJECTS, 'Admin', DEFAULT_FILTERS)
  const officer = dashboardScope(PROJECTS, 'State/District Officer', DEFAULT_FILTERS)
  const manager = dashboardScope(PROJECTS, 'Project Manager', DEFAULT_FILTERS)
  assert.equal(admin.projects.length, 24)
  assert.equal(officer.state, 'Maharashtra')
  assert.equal(officer.projects.length, 2)
  assert.ok(officer.projects.every(p => p.state === officer.state))
  assert.deepEqual(manager.projects.map(p => p.id), ['LS-2026-001', 'LS-2026-002', 'LS-2026-003'])
  assert.equal(manager.selected?.id, 'LS-2026-001')
  assert.deepEqual(dashboardScope([...PROJECTS].reverse(), 'Project Manager', {}).projects, manager.projects)
  assert.deepEqual(dashboardScope([...PROJECTS].reverse(), 'State/District Officer', {}).projects, officer.projects)
  assert.notEqual(summarize(admin.projects).pending, summarize(officer.projects).pending)
  assert.notEqual(summarize(manager.projects).pending, summarize(officer.projects).pending)
})

test('regional filters scope projects, indicators, priorities and alerts together', () => {
  const { projects } = dashboardScope(PROJECTS, 'State/District Officer', { state: 'Uttar Pradesh', district: 'Varanasi' })
  assert.equal(projects.length, 1)
  assert.equal(projects[0].district, 'Varanasi')
  assert.equal(summarize(projects).pending, projects[0].pendingParcels)
  assert.ok(regionalPriorities(projects).every(p => p.district === 'Varanasi'))
  assert.ok(dashboardAlerts(ALERTS, projects).every(a => a.projectId === projects[0].id))
  const priorities = regionalPriorities(PROJECTS)
  assert.ok(priorities.every((p, i) => i === 0 || priorities[i - 1].riskScore >= p.riskScore))
})

test('manager selection and recommendations never leak beyond the filtered demo portfolio', () => {
  const initial = dashboardScope(PROJECTS, 'Project Manager', {}, PROJECTS[22].id)
  assert.equal(initial.selected?.id, 'LS-2026-001')
  const changed = dashboardScope(PROJECTS, 'Project Manager', {}, 'LS-2026-002')
  assert.equal(changed.selected?.name, 'Pune Ring Road — Eastern Section')
  assert.ok(recommendationsFor(changed.selected!).every(r => r.projectId === 'LS-2026-002'))
  assert.notEqual(summarize([initial.selected!]).pending, summarize([changed.selected!]).pending)
  const filtered = dashboardScope(PROJECTS, 'Project Manager', { state: 'Bihar' }, 'LS-2026-002')
  assert.equal(filtered.selected?.id, 'LS-2026-001')
  const empty = dashboardScope(PROJECTS, 'Project Manager', { state: 'Assam' }, 'LS-2026-002')
  assert.equal(empty.selected, undefined)
  assert.deepEqual(empty.projects, [])
  const reentered = dashboardScope(PROJECTS, 'Project Manager', DEFAULT_FILTERS, '')
  assert.equal(reentered.selected?.id, initial.selected?.id)
})

test('alert scope excludes resolved and out-of-region records and preserves session statuses', () => {
  const { projects } = dashboardScope(PROJECTS, 'State/District Officer', {})
  const alerts = dashboardAlerts(ALERTS, projects)
  assert.ok(alerts.length > 0)
  const updated = ALERTS.map(a => a.id === alerts[0].id ? { ...a, status: 'Resolved' as const } : a.id === alerts[1].id ? { ...a, status: 'Acknowledged' as const } : a)
  const scoped = dashboardAlerts(updated, projects)
  assert.ok(!scoped.some(a => a.id === alerts[0].id))
  assert.equal(scoped.find(a => a.id === alerts[1].id)?.status, 'Acknowledged')
  assert.ok(scoped.every(a => projects.some(p => p.id === a.projectId)))
})

test('empty datasets, unsupported filters and missing default region recover without invented records', () => {
  assert.equal(demoRegion([]), '')
  for (const role of ['Admin', 'State/District Officer', 'Project Manager'] as const) {
    assert.deepEqual(dashboardScope([], role, {}).projects, [])
    assert.equal(dashboardScope([], role, {}).selected, undefined)
    assert.deepEqual(dashboardScope(PROJECTS, role, { search: 'does not exist' }).projects, [])
  }
  const subset = PROJECTS.filter(p => p.state !== 'Maharashtra')
  const region = demoRegion(subset)
  assert.ok(subset.some(p => p.state === region))
  assert.ok(dashboardScope(subset, 'State/District Officer', {}).projects.every(p => p.state === region))
  assert.deepEqual(dashboardAlerts(ALERTS, []), [])
})
