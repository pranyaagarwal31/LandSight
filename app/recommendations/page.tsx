import { Suspense } from 'react'
import { RecommendationsPage } from '@/components/landsight/recommendations-page'
import { LoadingState } from '@/components/landsight/shared'
export default function Page() { return <Suspense fallback={<LoadingState/>}><RecommendationsPage/></Suspense> }
