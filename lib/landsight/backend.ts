import { NextResponse } from 'next/server'

export function forwardMLRequest(path: '/api/predict' | '/api/model-performance', body?: string) {
  return forwardRequest(path, false, body)
}

export function forwardProjectRequest(id?: string) {
  return forwardRequest(id ? `/api/projects/${encodeURIComponent(id)}` : '/api/projects', true)
}

async function forwardRequest(path: string, projects: boolean, body?: string) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  try {
    // Only operator configuration selects the upstream; never accept a URL from request data.
    const base = new URL(process.env.LANDSIGHT_BACKEND_URL || 'http://127.0.0.1:8000')
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid backend URL')
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST', body,
      headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(projects ? 20_000 : 8000),
    })
    if (projects) {
      for (const name of ['X-LandSight-Data-Source', 'X-LandSight-Predictions-Persisted', 'X-LandSight-Mode']) {
        const value = response.headers.get(name)
        if (value) headers[name] = value
      }
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        const unavailable = [502, 504].includes(response.status)
        const code = response.status === 404 ? 'PROJECT_NOT_FOUND'
          : error?.error?.code === 'PROJECT_SOURCE_UNAVAILABLE' ? 'PROJECT_SOURCE_UNAVAILABLE'
          : error?.error?.code === 'MODEL_UNAVAILABLE' ? 'MODEL_UNAVAILABLE'
          : unavailable ? 'BACKEND_UNAVAILABLE' : 'PROJECT_REQUEST_FAILED'
        return NextResponse.json({ error: { code, message: code === 'PROJECT_NOT_FOUND' ? 'Project not found.' : 'The project API could not complete this request.' } }, {
          status: unavailable ? 503 : response.status, headers,
        })
      }
    }
    if (!response.ok) {
      const unavailable = response.status === 503 || response.status === 502 || response.status === 504
      const status = response.status === 422 ? 422 : unavailable ? 503 : 502
      return NextResponse.json({ error: { code: unavailable ? 'ML_UNAVAILABLE' : 'PREDICTION_ERROR', message: status === 422 ? 'The backend rejected these project inputs.' : unavailable ? 'The ML API is unavailable.' : 'The backend could not complete the request.' } }, { status, headers })
    }
    try {
      return NextResponse.json(await response.json(), { headers })
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_RESPONSE', message: 'The backend returned invalid JSON.' } }, { status: 502, headers })
    }
  } catch {
    return NextResponse.json({ error: { code: projects ? 'BACKEND_UNAVAILABLE' : 'ML_UNAVAILABLE', message: 'The backend API is unavailable or timed out.' } }, { status: 503, headers })
  }
}
