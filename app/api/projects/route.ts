import { forwardProjectRequest } from '@/lib/landsight/backend'

export const runtime = 'nodejs'

export async function GET() {
  return forwardProjectRequest()
}
