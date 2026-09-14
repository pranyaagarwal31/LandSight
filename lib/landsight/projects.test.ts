import assert from 'node:assert/strict'
import test from 'node:test'
import { PROJECTS } from './data'
import { fetchProject, fetchProjectCollection, validateProject } from './projects'

const sourceHeaders = { 'X-LandSight-Data-Source': 'postgresql', 'X-LandSight-Predictions-Persisted': 'true' }

test('project validator accepts the existing seed and rejects invalid derived data', () => {
  for (const project of PROJECTS) assert.equal(validateProject(project), project)
  for (const change of [{ pendingParcels: -1 }, { riskScore: 101 }, { stages: [] }, { source: 'Government' }, { landowners: 1.5 }]) {
    assert.throws(() => validateProject({ ...PROJECTS[0], ...change }))
  }
})

test('portfolio and detail use API records, including IDs absent from the bundled seed', async t => {
  const project = { ...PROJECTS[0], id: 'LS-PERSISTED-ONLY', name: 'Persisted test record' }
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url === '/api/projects' ? [project] : project, { headers: sourceHeaders }))
  const collection = await fetchProjectCollection()
  assert.deepEqual(collection.projects, [project])
  assert.equal(collection.source, 'postgresql')
  assert.equal(collection.predictionsPersisted, true)
  assert.deepEqual(await fetchProject(project.id), project)
})

test('an empty persisted portfolio and missing persisted project do not resurrect demo rows', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string) => url === '/api/projects'
    ? Response.json([], { headers: sourceHeaders }) : Response.json({ error: { code: 'PROJECT_NOT_FOUND' } }, { status: 404 }))
  assert.deepEqual((await fetchProjectCollection()).projects, [])
  assert.equal(await fetchProject(PROJECTS[0].id), undefined)
})

test('genuine transport outages retain explicitly labelled demo fallback', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline') })
  const collection = await fetchProjectCollection()
  assert.equal(collection.source, 'demo-fallback')
  assert.match(collection.notice, /Demo fallback/)
  assert.equal(collection.predictionsPersisted, false)
  assert.deepEqual(collection.projects, PROJECTS)
  fetch.mock.mockImplementation(async () => Response.json({ error: { code: 'BACKEND_UNAVAILABLE' } }, { status: 503 }))
  assert.equal((await fetchProjectCollection()).source, 'demo-fallback')
})

test('disabled fallback, application errors, and malformed responses remain visible errors', async t => {
  const fetch = t.mock.method(globalThis, 'fetch')
  for (const code of ['PROJECT_SOURCE_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'PROJECT_REQUEST_FAILED']) {
    fetch.mock.mockImplementation(async () => Response.json({ error: { code } }, { status: 503 }))
    await assert.rejects(fetchProjectCollection)
  }
  for (const payload of [{}, [null], [PROJECTS[0], PROJECTS[0]], [{ ...PROJECTS[0], prediction: null }]]) {
    fetch.mock.mockImplementation(async () => Response.json(payload, { headers: sourceHeaders }))
    await assert.rejects(fetchProjectCollection)
  }
  fetch.mock.mockImplementation(async () => Response.json(PROJECTS))
  await assert.rejects(fetchProjectCollection)
})

test('backend database fallback provenance survives frontend loading', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(PROJECTS, {
    headers: { 'X-LandSight-Data-Source': 'demo-fallback', 'X-LandSight-Predictions-Persisted': 'false' },
  }))
  const collection = await fetchProjectCollection()
  assert.equal(collection.source, 'demo-fallback')
  assert.equal(collection.predictionsPersisted, false)
})
