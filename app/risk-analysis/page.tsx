import { Suspense } from 'react'
import { RiskPage } from '@/components/landsight/risk-page'
import { LoadingState } from '@/components/landsight/shared'
export default function Page() { return <Suspense fallback={<LoadingState/>}><RiskPage/></Suspense> }
