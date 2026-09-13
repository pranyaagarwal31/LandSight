'use client'

import useSWR from 'swr'
import { predictionInput, type MLPrediction } from './ml'
import { landSightService } from './service'
import type { Project } from './types'

export function usePrediction(project?: Project) {
  const result = useSWR(project ? ['ml-prediction', predictionInput(project)] : null,
    () => landSightService.predict(project!), {
      shouldRetryOnError: false, revalidateOnFocus: false, keepPreviousData: false,
    })
  const prediction = result.data ?? project?.prediction
  const mlPrediction = prediction?.metadata?.status === 'trained' ? prediction as MLPrediction : undefined
  return { ...result, prediction, mlPrediction }
}
