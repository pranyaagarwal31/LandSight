import { forwardProjectRequest } from '@/lib/landsight/project-backend'

export const GET = () => forwardProjectRequest('/api/gis/projects')
