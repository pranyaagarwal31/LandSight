import Link from 'next/link'
import { EmptyState } from '@/components/landsight/shared'
export default function NotFound() { return <EmptyState title="We couldn’t find that page" description="The requested project or workspace page does not exist." action={<Link href="/" className="small-link">Return to the executive dashboard</Link>}/> }
