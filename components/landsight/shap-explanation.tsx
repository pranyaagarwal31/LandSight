'use client'

import type { ReactNode } from 'react'
import useSWR from 'swr'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchMLPrediction, predictionInput, type ShapContribution } from '@/lib/landsight/ml'
import type { Project } from '@/lib/landsight/types'
import { FactorChart } from './charts'
import { Panel } from './shared'

function ContributionRows({ factors, empty, unit }: { factors: ShapContribution[]; empty: string; unit: string }) {
  if (!factors.length) return <p className="py-3 text-xs text-muted-foreground">{empty}</p>
  return <ul className="flex flex-col divide-y">{factors.map(factor => <li key={factor.id} className="flex gap-3 py-3">
    {factor.contribution > 0 ? <ArrowUpRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-high"/> : <ArrowDownRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low"/>}
    <div className="min-w-0 flex-1"><h4 className="text-xs font-medium">{factor.name}</h4><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{factor.description}</p><p className="mt-1 text-[10px] text-muted-foreground">{factor.direction} · {(factor.relativeImportance * 100).toFixed(1)}% of absolute contributions</p></div>
    <span className={factor.contribution < 0 ? 'text-xs font-semibold text-low' : 'text-xs font-semibold text-high'}>{factor.contribution > 0 ? '+' : ''}{factor.contribution.toPrecision(3)}<span className="mt-1 block text-right text-[9px] font-normal text-muted-foreground">{unit}</span></span>
  </li>)}</ul>
}

export function ShapRiskExplanation({ project, fallback }: { project: Project; fallback: ReactNode }) {
  const input = predictionInput(project)
  const { data, error, isLoading, isValidating, mutate } = useSWR(['ml-explanation', input], ([, values]) => fetchMLPrediction(values), {
    shouldRetryOnError: false, revalidateOnFocus: false, keepPreviousData: false,
  })
  const explanation = data?.explanation
  if (error || !explanation || explanation.status === 'unavailable') return <div className="flex flex-col gap-4">
    <Alert><Info/><AlertDescription><span role="status">{isLoading ? 'Calculating SHAP for the selected project. Demo rule contributions are shown below while loading.' : explanation?.status === 'unavailable' ? explanation.unavailableReason : 'SHAP unavailable: the trained-model service could not be reached or its response could not be verified. The demo rule fallback below is not SHAP.'}</span>{!isLoading && <Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}>Retry SHAP</Button>}</AlertDescription></Alert>
    {data && !error && <p className="text-xs text-muted-foreground">Trained prototype prediction retained: {data.score}/100 ({data.level}), {data.delayDays} predicted delay days. No SHAP attributions are shown for this prediction.</p>}
    {fallback}
  </div>
  const unit = explanation.outputSpace === 'log_odds' ? 'log-odds' : 'probability'
  return <div className="flex flex-col gap-4">
    <Alert><Info/><AlertDescription><span>{explanation.notice}</span><span>These contributions explain the ML prediction shown here. Other page scores, stages and simulations remain the separate demo-rule estimates.</span></AlertDescription></Alert>
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.25fr]">
      <Panel title="Explainable AI" description={`TreeSHAP · ${explanation.algorithm} · ${unit}`}>
        <div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant="outline">SYNTHETIC MODEL</Badge><span className="text-xs font-medium">ML risk: {data.score}/100 · {data.level}</span></div>
        <p className="mb-3 text-[11px] text-muted-foreground">Uncalibrated synthetic delay probability: {(explanation.predictedProbability * 100).toFixed(2)}%. Not confidence in correctness.</p>
        <FactorChart factors={explanation.contributions} contributionLabel={`SHAP contribution (${unit})`}/>
        <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-[10px] text-muted-foreground"><span>Model baseline: {explanation.baseValue.toFixed(4)}</span><span>Baseline + contributions: {explanation.outputValue.toFixed(4)} {unit}</span></div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">{explanation.outputSpace === 'log_odds' ? 'Log-odds contributions are not score points or percentage points. Applying the logistic function to their sum plus the baseline recovers the model probability.' : 'Contributions are in probability units (0–1), not risk-score points.'} One-hot project-type contributions are summed across all categories.</p>
        <p className="mt-2 break-all text-[10px] text-muted-foreground">Model {explanation.modelVersion} · SHAP {explanation.shapVersion}</p>
        <details className="mt-4 text-xs"><summary className="cursor-pointer font-medium">All feature contributions and input values</summary><ul className="mt-2 flex flex-col gap-2 text-[11px] text-muted-foreground">{explanation.contributions.map(f => <li key={f.id}>{f.name} · input: {f.inputValue ?? 'missing (training median used)'} · {f.contribution > 0 ? '+' : ''}{f.contribution.toPrecision(4)} {unit} · {f.direction}</li>)}</ul></details>
      </Panel>
      <Panel title="What is driving this prediction?" description="Actual local SHAP contributions relative to the model baseline">
        <h3 className="text-xs font-semibold">Top risk contributors</h3><ContributionRows factors={explanation.topRiskFactors} empty="No features increased risk relative to the baseline." unit={unit}/>
        <h3 className="mt-4 text-xs font-semibold">Factors reducing risk</h3><ContributionRows factors={explanation.riskReducingFactors} empty="No features reduced risk relative to the baseline." unit={unit}/>
        {!!data.warnings.length && <div className="mt-4 border-t pt-3"><h3 className="text-xs font-medium">Input limitations</h3><ul className="mt-2 flex flex-col gap-2 text-[11px] text-muted-foreground">{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      </Panel>
    </div>
  </div>
}
