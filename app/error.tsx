'use client'
import { ErrorState } from '@/components/landsight/shared'
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ErrorState reset={reset}/> }
