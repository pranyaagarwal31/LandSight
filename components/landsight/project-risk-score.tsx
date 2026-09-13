'use client'

import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePrediction } from '@/lib/landsight/use-prediction'
import type { Project } from '@/lib/landsight/types'
import { Panel } from './shared'
import { RiskScore } from './risk-components'

export function ProjectRiskScore({ project, title }: { project: Project; title: string }) {
  const { prediction, mlPrediction, isLoading, isValidating, mutate } = usePrediction(project)
  if (!prediction) return null
  return <Panel title={title} description={`Model ${prediction.model} · Synthetic inputs`}>
    <div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="outline">{mlPrediction ? 'TRAINED ML · SYNTHETIC DATA' : 'DEMO RULE FALLBACK'}</Badge></div>
    {!mlPrediction && <Alert><Info/><AlertDescription><span role="status">{isLoading ? 'Loading prediction for this project. Showing its demo estimate while loading.' : `${prediction.fallbackReason ?? 'Trained ML unavailable.'} Showing demo rule estimates, not ML or SHAP.`}</span><Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}>Retry prediction</Button></AlertDescription></Alert>}
    <div aria-busy={isLoading}><RiskScore prediction={prediction}/></div>
    {mlPrediction && <div className="mt-4 flex flex-col gap-2 text-[10px] leading-relaxed text-muted-foreground">
      <p>{mlPrediction.metadata.algorithm} · {mlPrediction.metadata.featureSchemaVersion} · Trained {mlPrediction.metadata.trainedAt}</p>
      <p>{mlPrediction.probability.notice}</p>
      <details><summary className="cursor-pointer">Model inputs and metadata</summary><p className="mt-2">{mlPrediction.metadata.notice}</p><dl className="mt-2 flex flex-col gap-1">{Object.entries(mlPrediction.featureValues).map(([name, value]) => <div key={name}><dt className="inline font-medium">{name}: </dt><dd className="inline">{value ?? 'Missing; training median used'}</dd></div>)}</dl></details>
      {!!mlPrediction.warnings.length && <ul className="flex flex-col gap-1">{mlPrediction.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    </div>}
  </Panel>
}
