import { notFound } from 'next/navigation'
import { ProjectDetail } from '@/components/landsight/project-detail'
import { landSightService } from '@/lib/landsight/service'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await landSightService.getProject(id)
  if (!project) notFound()
  return <ProjectDetail id={id} />
}
