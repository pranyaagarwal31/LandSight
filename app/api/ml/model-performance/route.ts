import { forwardMLRequest } from '@/lib/landsight/backend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return forwardMLRequest('/api/model-performance')
}
