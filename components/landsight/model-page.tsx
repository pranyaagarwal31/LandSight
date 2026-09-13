'use client'

import useSWR from 'swr'
import { BrainCircuit, CalendarDays, Database, GitBranch, Layers3, Route } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState, ErrorState, KpiCard, LoadingState, PageHeader, Panel } from './shared'
import { API_CONTRACT, landSightService } from '@/lib/landsight/service'
import { formatDate, number } from '@/lib/landsight/format'
import { ModelImportanceChart } from './charts'
import type { ConfusionMatrix as ConfusionMatrixData } from '@/lib/landsight/types'

function ConfusionMatrix({ matrix: m }: { matrix: ConfusionMatrixData }) {
  const total = Object.values(m).reduce((sum, value) => sum + value, 0)
  return <div>
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Illustrative confusion matrix">
      <table className="w-full border-separate border-spacing-1 text-center text-[10px]">
        <caption className="mb-3 text-left text-[11px] text-muted-foreground">{number(total)} invented evaluation examples · Positive class: delayed</caption>
        <thead><tr><th scope="col" className="p-2 text-left font-medium">Actual outcome</th><th scope="col" className="p-2 font-medium">Predicted<br/>On time</th><th scope="col" className="p-2 font-medium">Predicted<br/>Delayed</th></tr></thead>
        <tbody>
          <tr><th scope="row" className="p-2 text-left font-medium">On time</th><td className="rounded-md bg-secondary px-3 py-5"><strong className="block text-2xl font-semibold text-primary">{number(m.trueNegative)}</strong><span className="mt-1 block text-muted-foreground">True negatives</span></td><td className="rounded-md bg-medium/10 px-3 py-5"><strong className="block text-2xl font-semibold">{number(m.falsePositive)}</strong><span className="mt-1 block text-muted-foreground">False positives</span></td></tr>
          <tr><th scope="row" className="p-2 text-left font-medium">Delayed</th><td className="rounded-md bg-medium/10 px-3 py-5"><strong className="block text-2xl font-semibold">{number(m.falseNegative)}</strong><span className="mt-1 block text-muted-foreground">False negatives</span></td><td className="rounded-md bg-secondary px-3 py-5"><strong className="block text-2xl font-semibold text-primary">{number(m.truePositive)}</strong><span className="mt-1 block text-muted-foreground">True positives</span></td></tr>
        </tbody>
      </table>
    </div>
    <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Accuracy, precision, recall, and F1 are consistent with these invented counts. ROC-AUC and regression metrics are separate illustrative values and cannot be inferred from this matrix. These examples are not the 24 project records.</p>
  </div>
}

export function ModelPage() {
  const { data: model, error, isLoading, mutate } = useSWR('demo:model', () => landSightService.getModelPerformance())
  if (isLoading) return <LoadingState/>
  if (error) return <ErrorState reset={() => void mutate()}/>
  if (!model) return <EmptyState title="Model metadata unavailable" description="No model metadata was returned by the demonstration service."/>
  return <div className="page-stack">
<PageHeader eyebrow="TRANSPARENT MODEL GOVERNANCE" title="Model performance" description="A preview of how LandSight will evaluate, explain, and govern future delay-prediction models.">
<Badge variant="medium">DEMO MODEL METRICS</Badge>
</PageHeader>
<Alert>
<BrainCircuit/>
<AlertTitle>Illustrative metrics, not evaluation results</AlertTitle>
<AlertDescription>These values and training metadata are synthetic placeholders. No model has been trained or evaluated here, and none of these metrics come from a real government deployment. The running prototype uses deterministic weighted risk logic.</AlertDescription>
</Alert>
<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{model.metrics.map(metric => <KpiCard key={metric.name} title={metric.name} value={metric.value} detail={metric.description} icon={BrainCircuit}/>)}</div>
<div className="grid items-start gap-5 xl:grid-cols-2">
<Panel title="Confusion matrix" description="Illustrative binary delay classification · not observed project outcomes" action={<Badge variant="medium">SYNTHETIC</Badge>}>
<ConfusionMatrix matrix={model.confusionMatrix}/>
</Panel>
<Panel title="Feature importance · demo engine" description="Share of absolute factor contributions across all 24 synthetic projects">
<ModelImportanceChart data={model.featureImportance}/>
<p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Derived from the existing deterministic risk formula, excluding its constant baseline. Acquisition progress reduces risk; absolute values show magnitude, not direction. This is not learned feature importance or SHAP.</p>
</Panel>
</div>
<div className="grid gap-5 lg:grid-cols-2">
<Panel title="Model registry" description="Demonstration metadata · not a completed training run">
<dl className="flex flex-col divide-y">{[{ name: 'Demo engine version', value: model.version, icon: GitBranch }, { name: 'Last trained date (illustrative)', value: formatDate(model.lastTrained), icon: CalendarDays }, { name: 'Training records (illustrative)', value: number(model.trainingRecords), icon: Database }, { name: 'Planned feature count', value: model.features, icon: Layers3 }].map(item => <div key={item.name} className="flex items-center justify-between gap-4 py-4 first:pt-0">
<dt className="flex items-center gap-2 text-xs text-muted-foreground">
<item.icon className="size-3.5"/>{item.name}</dt>
<dd className="text-xs font-medium">{item.value}</dd>
</div>)}</dl>
<p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">The active demo calculation uses six factors and one baseline. The planned 18-feature ML schema will include temporal and historical project attributes.</p>
</Panel>
<Panel title="Current engine vs. future ML" description="An honest separation of implemented and planned capabilities">
<div className="flex flex-col gap-5">
<div>
<Badge variant="low">IMPLEMENTED</Badge>
<h3 className="mt-3 text-xs font-medium">Transparent, deterministic risk logic</h3>
<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Compensation, legal cases, approval time, parcel complexity, pending parcels, and acquisition progress feed a bounded 0–100 score. Simulation uses exactly the same formula.</p>
</div>
<div className="border-t pt-4">
<Badge variant="outline">PLANNED</Badge>
<h3 className="mt-3 text-xs font-medium">Trained prediction and explainability</h3>
<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">FastAPI + Python, Pandas / NumPy, Scikit-learn, XGBoost / Random Forest, and SHAP. PostgreSQL / PostGIS will support project, parcel, and spatial records.</p>
</div>
</div>
</Panel>
</div>
<Panel title="Future service integration contract" description="These are planned endpoint contracts, not live API routes. The typed demo service currently supplies the UI." action={<Badge variant="outline">
<Route data-icon="inline-start"/>Adapter-ready</Badge>} flush>
<div className="table-wrap">
<table className="data-table">
<thead>
<tr>
<th>Capability</th>
<th>Future endpoint</th>
<th>Current implementation</th>
</tr>
</thead>
<tbody>{Object.entries(API_CONTRACT).map(([key, endpoint]) => <tr key={key}>
<td className="capitalize">{key}</td>
<td className="whitespace-nowrap text-[11px]">{endpoint}</td>
<td>
<Badge variant="secondary">Demo service</Badge>
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
