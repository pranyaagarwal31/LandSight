import { notFound } from 'next/navigation'
import { ProjectDetail } from '@/components/landsight/project-detail'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) notFound()
  return <ProjectDetail id={id} />
}
