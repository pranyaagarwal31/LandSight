import { NextResponse } from 'next/server'

export async function forwardProjectRequest(path: string) {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-LandSight-Storage': 'unavailable' }
  const developmentFallback = process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL && !process.env.LANDSIGHT_BACKEND_URL
  try {
    if (!/^\/api\/(projects(?:\/[A-Za-z0-9_-]{1,128})?|gis\/projects)$/.test(path)) throw new Error('Invalid project path')
    const base = new URL(process.env.LANDSIGHT_BACKEND_URL || 'http://127.0.0.1:8000')
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid backend URL')
    const response = await fetch(new URL(path, base), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000),
    })
    const storage = response.headers.get('x-landsight-storage')
    if (!response.ok) {
      const status = response.status === 404 ? 404 : 503
      return NextResponse.json({ error: { code: status === 404 ? 'PROJECT_NOT_FOUND' : 'DATABASE_UNAVAILABLE', message: status === 404 ? 'Project not found.' : 'The project backend or database is unavailable. No demo data was substituted.' } }, { status, headers })
    }
    if (storage !== 'postgres' && storage !== 'demo-memory') throw new Error('Missing storage provenance')
    headers['X-LandSight-Storage'] = storage
    return NextResponse.json(await response.json(), { headers })
  } catch {
    if (developmentFallback) headers['X-LandSight-Storage'] = 'demo-fallback'
    return NextResponse.json({ error: { code: 'PROJECTS_UNAVAILABLE', message: 'The project API is unavailable or timed out.' } }, { status: 503, headers })
  }
}
