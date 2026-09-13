# LandSight backend — Phase 2

Separate FastAPI service with actual fitted **Random Forest and XGBoost** training pipelines. The checked-in release selects XGBoost by validation performance. **All training and evaluation data is synthetic, not real government records.** These measurements establish only simulator performance, not real-world accuracy, calibrated probabilities, or production readiness.

The existing Next.js frontend, demo adapter, dashboard, navigation, GIS, analytics, role preview, audit logs, and deployment configuration are unchanged. **This backend is not connected to the UI or deployed by the root Next.js configuration.** The frontend remains independent and works without Python/ML. No SHAP, database, real-data integration, or authentication is added.

## Install and run

Tested on Linux x86-64 with Python 3.13 and the hash-locked dependencies in `requirements.lock`. XGBoost uses the small CPU-only `xgboost-cpu` distribution (no CUDA/GPU dependency). The pinned numerical packages and CPU wheel have their own platform/Python requirements; do not assume the Phase 1 Python 3.11 baseline still applies. From a local checkout:

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --require-hashes -r requirements.lock
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Use `--reload` only for development. The supplied artifact is already trained; normal startup **does not train**. Visit `/docs`, `/openapi.json`, and `/health`. Port 8000 remains separate from the frontend. `requirements.txt` pins direct runtime dependencies; `requirements-dev.txt` adds test tooling; `requirements.lock` pins and hashes the complete tested runtime + test environment. There is no additional JavaScript dependency.

## Train reproducibly

From `backend/` in the same environment:

```sh
python -m app.models.train --output artifacts-retrained --records 6000 --seed 20260914 --trees 160
python -m unittest discover -s tests -v
python -m pip check
```

Training writes to a **new release directory** and refuses an existing `manifest.json`. The default output is `backend/artifacts`, already populated in this repository, so use `--output` when reproducing it. Do not overwrite a release while a service is loading it. A fixed seed governs generation, splits, and both estimators; CPU workers are fixed to one. Identical code, data parameters, dependency versions, and platform reproduce predictions/evaluations. Training timestamps naturally change, and numerical/serialized identity is not guaranteed across platforms or dependency upgrades.

Each release contains:

| File | Purpose |
| --- | --- |
| `synthetic-training.csv` | All 6,000 generated snapshots and synthetic outcome labels, explicitly marked Synthetic on every row |
| `splits.json` | Exact disjoint train/validation/test project IDs |
| `holdout-predictions.csv` | Validation/test probabilities, predicted days, and actual synthetic labels for RF, XGBoost, and the baseline |
| `model.joblib` | The selected fitted classifier and regressor, each including preprocessing; training ranges and feature contract |
| `performance.json` | Computed metrics, comparisons, split information, provenance, and frontend-compatible display fields |
| `manifest.json` | Parameters, dataset/version identifiers, runtime versions, feature order, and file SHA-256 checksums |

The manifest is written last. Only the selected estimator pair is serialized; both candidates' evaluations, hyperparameters, and holdout predictions are retained, and both can be retrained. The source generator, not a downloaded dataset, is the dataset authority.

### Dataset and features

`app/models/dataset.py` simulates acquisition snapshots. The six existing inputs are preserved in order: `totalParcels`, `acquiredParcels`, `compensationPaid`, `legalCases`, `approvalDays`, `complexity`. The v2 schema also uses existing `landowners`, `compensationBudgetCr`, `approvalsPending`, and project `type`: **10 raw features, 15 transformed features**. No ID, project name, coordinates, geographic identity, completion date, frontend risk score, or outcome label is a model feature.

The simulator draws 80–5,000 parcels, partial progress, correlated compensation progress, legal cases, 0–180 approval days, complexity 1–5, six existing project types, and optional acquisition factors. Delay outcomes are generated from nonlinear relationships and interactions among these inputs plus heteroscedastic noise and occasional random disruptions. Those relationships are **documented simulator assumptions in the generator, not learned real-world facts**. There is no historical follow-up or observation date. The future-delay target is entirely invented. A random 12% of each optional numerical factor is withheld after outcome generation to exercise missing-input handling.

Fitted scikit-learn pipelines impute numerical inputs with **training-only medians** and one-hot encode the fixed six project types. Trees do not require numerical scaling. Optional nulls are returned as null in `featureValues`, while `transformedFeatureValues` shows the actual imputed/encoded values used by the model. Out-of-training-range numerical values are accepted under the existing API schema but explicitly warned about; those estimates should not be trusted for decisions. This range check is not a comprehensive distribution-shift detector.

### Targets, model selection, and evaluation

- **Classification:** whether simulated delay is strictly greater than 90 days. RandomForestClassifier and XGBClassifier learn this binary target.
- **Regression:** simulated delay days, learned separately by RandomForestRegressor and XGBRegressor. Served estimates and regression evaluations use nonnegative, nearest-integer days.
- Stratified fixed-seed **60/20/20 split**: 3,600 training, 1,200 validation, 1,200 test rows. No preprocessing is fitted on validation/test rows. A future real dataset will need temporal/grouped splitting rather than assuming independent synthetic projects.
- Fixed hyperparameters are recorded in the manifest. Select the model family with the lowest **validation log loss plus validation MAE divided by 90**; algorithm name breaks ties. Selection is frozen before test evaluation. The selected model is not refitted on holdout rows.
- A prior-probability classifier and mean-delay regressor provide measured baselines. The baseline is reported, not eligible for selection; there is no production acceptance gate.
- Accuracy, precision, recall, F1, and the binary confusion matrix use probability threshold **0.5**. ROC-AUC uses continuous probabilities across thresholds. Brier score and log loss measure probability quality; MAE, RMSE, and R² evaluate days. Raw metric values are retained, not fabricated or derived from the UI's illustrative metrics.
- Model probabilities are **uncalibrated**. No calibrated confidence or prediction interval is claimed. `confidence` remains null; `probability.value` is a 0–1 model estimate for the synthetic event, with `calibrated: false` and an explicit caveat.
- `score` is the rounded probability multiplied by 100. Existing `level` bands remain `LOW` (0–30), `MEDIUM` (31–60), `HIGH` (61–80), `CRITICAL` (81–100). `riskCategory` additionally supplies title case. These are presentation bands, **not a four-class classifier**, and the binary metrics' 0.5 threshold is not the HIGH category boundary. This changes the backend score meaning from additive demo points to synthetic event probability.
- The independent classifier and regressor need not agree exactly near the 90-day threshold. A mean delay is not a probability.
- `featureImportance` contains selected classifier global normalized tree impurity/gain importance. It can be biased and is **not a local explanation, causal effect, or SHAP**. Local `factors` is empty in ML mode until Phase 3.

The checked-in `performance.json` is the source of measured values, not hard-coded response constants. It includes results for both candidate families and the baseline. Retraining recomputes everything.

## Loading and fallback behavior

`MLPredictor` in `app/services/ml_prediction.py` implements the existing `Predictor.predict(ProjectInput) -> RiskPrediction` protocol. Each app instance loads its local artifact once during creation; requests never train, accept file paths, download models, or mutate model files. The fitted preprocessing remains attached to each estimator and is ready for later explanation work.

The default `create_app()` uses `Settings(prediction_mode="auto", model_directory=backend/artifacts)`. It verifies the feature schema/order, artifact format, exact numerical dependency versions and Python major/minor, model/report versions, serving-file checksums, fitted pipelines, and binary class labels. A different Python/runtime requires retraining and a compatible release. The dataset and diagnostic CSVs are not needed at inference; their hashes remain available for offline auditing.

**Joblib is a pickle-based format and can execute code. Load only trusted operator-generated releases.** Checksums detect corruption, not malicious artifacts or an attacker who can rewrite the manifest. There is no model upload endpoint. Keep the entire release directory out of untrusted write access. Serve only this prototype's non-sensitive inputs until authentication is introduced.

Configure other modes programmatically without new credentials or environment variables:

```python
from pathlib import Path
from app.core.config import Settings
from app.main import create_app

app = create_app(Settings(prediction_mode="ml", model_directory=Path("/absolute/path/to/artifacts-retrained")))
```

| Mode | Behavior |
| --- | --- |
| `auto` (default) | Load ML; on missing/corrupt/incompatible artifact or unavailable ML dependency, use explicit rule fallback when `demo_enabled` is true |
| `ml` | Require the trained artifact; prediction/metrics return structured 503 when unavailable, never silently return demo predictions |
| `demo` | Explicit legacy rule predictor, provided `demo_enabled` is true |
| `disabled` | No predictor; structured 503 |

`GET /health` remains a liveness endpoint and reports actual `predictionMode`, `modelLoaded`, `modelVersion`, and a notice; it is not an ML readiness guarantee. `X-LandSight-Mode` matches the actual predictor. In `auto` fallback, metadata says demo, confidence remains null, and model performance returns 503 rather than inventing measurements. Frontend fallback is separately untouched.

Existing optional environment variables are unchanged:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LANDSIGHT_CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact comma-separated frontend origins; no wildcards, paths, or trailing slash. Empty disables cross-origin access. |
| `LANDSIGHT_DEMO_ENABLED` | `true` | Enables the read-only synthetic project repository and permits rule fallback. False **does not disable a successfully loaded ML model**. |
| `LANDSIGHT_DOCS_ENABLED` | `true` | Enables docs/OpenAPI |

Configuration is read at startup; environment files are not automatically loaded. CORS is not authentication.

## API and frontend compatibility

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health`, `/api/health` | Actual prediction mode/model loading status |
| GET | `/api/model-performance` | Measured `ModelPerformance`, or structured 503 when no trained model is loaded |
| GET | `/api/projects`, `/api/projects/{project_id}` | Existing read-only synthetic fixture with active model predictions |
| POST | `/api/predict` | `RiskPrediction` with model provenance, probability information, and feature values |
| POST | `/api/risk-analysis` | Prediction and existing illustrative recommendations |
| GET | `/api/projects/{project_id}/risk-analysis` | Analysis for the synthetic fixture |
| GET | `/api/projects/{project_id}/explanation` | Empty in ML mode; rule contributions in demo mode, never SHAP |
| GET | `/api/projects/{project_id}/recommendations` | Existing illustrative recommendations |
| POST | `/api/recommendations` | Existing illustrative recommendations for supplied inputs |

Every POST retains `{ "project": { ...existing ProjectInput fields... } }`. CamelCase request/response keys and required fields are unchanged. Unknown fields are rejected; counts, ranges, parcel/progress consistency, and valid dates/coordinates are still validated. Requests accept new project IDs but do not persist records.

`RiskPrediction` retains `score`, `level`, `delayDays`, `confidence`, `factors`, `model`, `isDemo`, and `metadata`; it adds `riskCategory`, `probability`, `featureValues`, `transformedFeatureValues`, and `warnings`. Trained synthetic predictions deliberately return **`metadata.status: "trained"` and `isDemo: true`**: the estimator is actually fitted, but training evidence is synthetic. `metadata.algorithm`, `version`, `trainedAt`, and `featureSchemaVersion` identify the model. `explanationMethod` states that SHAP is not implemented.

`/api/model-performance` reuses the existing frontend `ModelPerformance` top-level shape (`version`, `lastTrained`, `trainingRecords`, `features`, `metrics`, `confusionMatrix`, `featureImportance`, `isDemo`) and adds typed raw evaluations, dataset provenance, split counts, selection criteria, and limitations. The frontend still shows its old **illustrative** metrics through its existing service adapter. A later integration must switch that adapter, allow nullable confidence, handle empty factors, and update explanatory UI copy: its current importance-chart wording describes demo rule contributions, not trained-model importance. No UI has been silently relabeled or connected in this phase.

Project stages and recommendations remain rule-based demo aids, not learned predictions or validated intervention effects. `primaryRisk` explicitly says an ML explanation is unavailable instead of inventing a per-project attribution. Source remains Synthetic. Existing structured 422/404/405/503 and sanitized 500 errors, CORS, and security headers are preserved.

## Validation coverage

Backend tests exercise artifact loading and checksums, schema/runtime rejection before deserialization, valid and invalid API inputs, response contracts, risk band boundaries and score rounding, deterministic data/training/inference, data-split isolation, training-only imputation, input sensitivity, exact recomputation of metrics from saved holdout predictions, optional/OOD inputs, existing related routes without SHAP, and graceful fallback. They also retain all Phase 1 demo/API regression tests. The checked-in artifact is explicitly tested. Frontend regression tests and TypeScript checks are run separately without editing frontend code.

The generated CSVs, serialized artifact, and evaluation reports are deliberately checked in for this small synthetic prototype. A later production data/model registry phase should replace this release mechanism; no database or storage integration is needed for this explicitly requested generated fixture.
