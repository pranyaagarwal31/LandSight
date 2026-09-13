import { NextResponse } from 'next/server'
import { forwardMLRequest } from '@/lib/landsight/backend'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: { code: 'INVALID_CONTENT_TYPE', message: 'Send a JSON project.' } }, { status: 415 })
  }
  const maximumBytes = 16_384
  if (Number(request.headers.get('content-length')) > maximumBytes) {
    return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Project input is too large.' } }, { status: 413 })
  }
  let body: string
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('Missing body')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximumBytes) {
        await reader.cancel()
        return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Project input is too large.' } }, { status: 413 })
      }
      chunks.push(value)
    }
    body = Buffer.concat(chunks).toString('utf8')
    JSON.parse(body)
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON project.' } }, { status: 422 })
  }
  return forwardMLRequest('/api/predict', body)
}
