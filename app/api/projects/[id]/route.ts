import { NextResponse } from 'next/server'
import { forwardProjectRequest } from '@/lib/landsight/backend'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return NextResponse.json({ error: { code: 'INVALID_PROJECT_ID', message: 'Invalid project ID.' } }, { status: 422 })
  }
  return forwardProjectRequest(id)
}
