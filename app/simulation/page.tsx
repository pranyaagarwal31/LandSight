import { Suspense } from 'react'
import { SimulationPage } from '@/components/landsight/simulation-page'
import { LoadingState } from '@/components/landsight/shared'
export default function Page() { return <Suspense fallback={<LoadingState/>}><SimulationPage/></Suspense> }
