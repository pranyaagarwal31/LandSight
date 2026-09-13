import { NextResponse } from 'next/server'

export async function forwardMLRequest(path: '/api/predict' | '/api/model-performance', body?: string) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    // Only operator configuration selects the upstream; never accept a URL from request data.
    const base = new URL(process.env.LANDSIGHT_BACKEND_URL || 'http://127.0.0.1:8000')
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid backend URL')
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST', body,
      headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(8000),
    })
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
    return NextResponse.json({ error: { code: 'ML_UNAVAILABLE', message: 'The ML API is unavailable or timed out.' } }, { status: 503, headers })
  }
}
