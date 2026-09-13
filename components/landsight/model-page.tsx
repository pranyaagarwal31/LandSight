'use client'

import useSWR from 'swr'
import { BrainCircuit, CalendarDays, Database, GitBranch, Layers3, Route } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, Panel } from './shared'
import { API_CONTRACT, landSightService } from '@/lib/landsight/service'
import { formatDate, number } from '@/lib/landsight/format'
import { ModelImportanceChart } from './charts'
import type { ConfusionMatrix as ConfusionMatrixData } from '@/lib/landsight/types'

function ConfusionMatrix({ matrix: m, measured }: { matrix: ConfusionMatrixData; measured: boolean }) {
  const total = Object.values(m).reduce((sum, value) => sum + value, 0)
  return <div>
    <div className="table-wrap" tabIndex={0} role="region" aria-label={measured ? 'Measured synthetic holdout confusion matrix' : 'Illustrative confusion matrix'}>
      <table className="w-full border-separate border-spacing-1 text-center text-[10px]">
        <caption className="mb-3 text-left text-[11px] text-muted-foreground">{number(total)} {measured ? 'held-out synthetic test records' : 'invented evaluation examples'} · Positive class: delayed</caption>
        <thead><tr><th scope="col" className="p-2 text-left font-medium">Actual outcome</th><th scope="col" className="p-2 font-medium">Predicted<br/>On time</th><th scope="col" className="p-2 font-medium">Predicted<br/>Delayed</th></tr></thead>
        <tbody>
          <tr><th scope="row" className="p-2 text-left font-medium">On time</th><td className="rounded-md bg-secondary px-3 py-5"><strong className="block text-2xl font-semibold text-primary">{number(m.trueNegative)}</strong><span className="mt-1 block text-muted-foreground">True negatives</span></td><td className="rounded-md bg-medium/10 px-3 py-5"><strong className="block text-2xl font-semibold">{number(m.falsePositive)}</strong><span className="mt-1 block text-muted-foreground">False positives</span></td></tr>
          <tr><th scope="row" className="p-2 text-left font-medium">Delayed</th><td className="rounded-md bg-medium/10 px-3 py-5"><strong className="block text-2xl font-semibold">{number(m.falseNegative)}</strong><span className="mt-1 block text-muted-foreground">False negatives</span></td><td className="rounded-md bg-secondary px-3 py-5"><strong className="block text-2xl font-semibold text-primary">{number(m.truePositive)}</strong><span className="mt-1 block text-muted-foreground">True positives</span></td></tr>
        </tbody>
      </table>
    </div>
    <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{measured ? 'Measured from held-out synthetic labels at a 0.5 classification threshold, not observed government outcomes. ROC-AUC and regression errors are measured separately; they cannot be inferred from this matrix.' : 'Accuracy, precision, recall, and F1 are consistent with these invented counts. ROC-AUC and regression metrics are separate illustrative values and cannot be inferred from this matrix. These examples are not the 24 project records.'}</p>
  </div>
}

export function ModelPage() {
  const { data: model, error, isLoading, isValidating, mutate } = useSWR('ml:model-performance', () => landSightService.getModelPerformance(), { revalidateOnFocus: false, shouldRetryOnError: false })
  const measured = model?.evaluationScope === 'synthetic-held-out-test'
  if (isLoading) return <LoadingState/>
  if (error) return <ErrorState reset={() => void mutate()}/>
  if (!model) return <EmptyState title="Model metadata unavailable" description="No model metadata was returned by the demonstration service."/>
  return <div className="page-stack">
<PageHeader eyebrow="TRANSPARENT MODEL GOVERNANCE" title="Model performance" description="Evaluate, explain, and govern LandSight delay-prediction models with explicit data provenance.">
<Badge variant="medium">{measured ? 'MEASURED · SYNTHETIC HOLDOUT' : 'DEMO MODEL METRICS'}</Badge>
</PageHeader>
<Alert>
<BrainCircuit/>
<AlertTitle>{measured ? 'Measured model evaluation on synthetic data' : 'Illustrative fallback, not evaluation results'}</AlertTitle>
<AlertDescription>{measured ? model.notice : `${model.fallbackReason ?? 'Measured metrics unavailable.'} Showing existing illustrative placeholders, not measured evaluation results.`}{!measured && <Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}>Retry model performance</Button>}</AlertDescription>
</Alert>
<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{model.metrics.map(metric => <KpiCard key={metric.name} title={metric.name} value={metric.value} detail={metric.description} icon={BrainCircuit}/>)}</div>
<div className="grid items-start gap-5 xl:grid-cols-2">
<Panel title="Confusion matrix" description={measured ? model.target : 'Illustrative binary delay classification · not observed project outcomes'} action={<Badge variant="medium">SYNTHETIC</Badge>}>
<ConfusionMatrix matrix={model.confusionMatrix} measured={measured}/>
</Panel>
<Panel title={measured ? 'Feature importance · trained classifier' : 'Feature importance · demo engine'} description={measured ? model.featureImportanceMethod : 'Share of absolute factor contributions across all 24 synthetic projects'}>
<ModelImportanceChart data={model.featureImportance} measured={measured}/>
<p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{measured ? 'Global importance is returned by the fitted classifier. It is not a local SHAP explanation, causal effect, or evidence of real-world accuracy.' : 'Derived from the existing deterministic risk formula, excluding its constant baseline. Acquisition progress reduces risk; absolute values show magnitude, not direction. This is not learned feature importance or SHAP.'}</p>
</Panel>
</div>
<div className="grid gap-5 lg:grid-cols-2">
<Panel title="Model registry" description={measured ? `${model.algorithm} · ${model.featureSchemaVersion}` : 'Demonstration metadata · not a completed training run'}>
<dl className="flex flex-col divide-y">{[{ name: measured ? 'Model version' : 'Demo engine version', value: model.version, icon: GitBranch }, { name: measured ? 'Last trained' : 'Last trained date (illustrative)', value: formatDate(model.lastTrained), icon: CalendarDays }, { name: measured ? 'Training records' : 'Training records (illustrative)', value: number(model.trainingRecords), icon: Database }, { name: measured ? 'Raw feature count' : 'Planned feature count', value: model.features, icon: Layers3 }].map(item => <div key={item.name} className="flex items-center justify-between gap-4 py-4 first:pt-0">
<dt className="flex items-center gap-2 text-xs text-muted-foreground">
<item.icon className="size-3.5"/>{item.name}</dt>
<dd className="text-xs font-medium">{item.value}</dd>
</div>)}</dl>
<p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{measured ? `${model.split?.strategy} Train: ${model.split?.train}; validation: ${model.split?.validation}; test: ${model.split?.test}. ${model.probabilityNotice}` : 'The demo fallback calculation uses six factors and one baseline. Its metadata is illustrative, not a training report.'}</p>
</Panel>
<Panel title="Demo engine and trained ML" description="An honest separation of the two prediction paths">
<div className="flex flex-col gap-5">
<div>
<Badge variant="low">IMPLEMENTED</Badge>
<h3 className="mt-3 text-xs font-medium">Transparent, deterministic risk logic</h3>
<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Compensation, legal cases, approval time, parcel complexity, pending parcels, and acquisition progress feed a bounded 0–100 score. Simulation uses exactly the same formula.</p>
</div>
<div className="border-t pt-4">
<Badge variant="outline">{measured ? 'CONNECTED' : 'API UNAVAILABLE'}</Badge>
<h3 className="mt-3 text-xs font-medium">Trained prediction and explainability</h3>
<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">FastAPI serves the existing fitted XGBoost / Random Forest pipeline and real TreeSHAP. Risk analysis and project-detail predictions use it when available. No database or real government-data integration is included.</p>
</div>
</div>
</Panel>
</div>
<Panel title="Service integration contract" description="Prediction, SHAP and measured performance use FastAPI through same-origin proxies. Other capabilities remain on the existing demo service." action={<Badge variant="outline">
<Route data-icon="inline-start"/>Adapter-ready</Badge>} flush>
<div className="table-wrap">
<table className="data-table">
<thead>
<tr>
<th>Capability</th>
<th>Backend / planned endpoint</th>
<th>Current implementation</th>
</tr>
</thead>
<tbody>{Object.entries(API_CONTRACT).map(([key, endpoint]) => <tr key={key}>
<td className="capitalize">{key}</td>
<td className="whitespace-nowrap text-[11px]">{endpoint}</td>
<td>
<Badge variant="secondary">{['predict', 'explanation', 'performance'].includes(key) ? 'API-first · demo fallback' : 'Demo service'}</Badge>
</td>
</tr>)}</tbody>
</table>
</div>
</Panel>
<Alert>
<GitBranch/>
<AlertTitle>Continuous learning requires verified outcomes</AlertTitle>
<AlertDescription>Future learning will use authorized data ingestion, time-based train/test splits, completed-project outcomes, drift monitoring, recalibration, human review, and versioned model promotion. No automatic retraining occurs in this prototype.</AlertDescription>
</Alert>
</div>
}
