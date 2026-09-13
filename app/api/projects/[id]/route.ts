import { NextResponse } from 'next/server'
import { forwardProjectRequest } from '@/lib/landsight/project-backend'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } }, { status: 404 })
  return forwardProjectRequest(`/api/projects/${id}`)
}
