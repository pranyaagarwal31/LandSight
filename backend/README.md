# LandSight backend — Phase 1

Separate Python 3.11+ / FastAPI service. The existing Next.js frontend, service adapter, demo predictions, and deployment configuration are unchanged. This backend is **not yet connected to the UI or deployed by the root Next.js configuration**. No database, authentication, model training, XGBoost, Random Forest, or SHAP is implemented.

## Install and run

For a local checkout (from the repository root):

```sh
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

On Windows, activate with `.venv\Scripts\activate`. Open `http://127.0.0.1:8000/docs` for interactive OpenAPI documentation; `/redoc` and `/openapi.json` are also available. Port 8000 is separate from the existing frontend on port 3000. Only use `--reload` for development.

Optional process environment variables (no secrets required):

| Variable | Default | Purpose |
| --- | --- | --- |
| `LANDSIGHT_CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated exact frontend origins. For a hosted frontend, set its exact HTTPS origin; no wildcard, paths, or trailing slash. Empty disables cross-origin access. |
| `LANDSIGHT_DEMO_ENABLED` | `true` | When false, prediction/project APIs return 503 rather than pretending a trained model/data source exists. Health remains available. |
| `LANDSIGHT_DOCS_ENABLED` | `true` | Set false to disable docs and the OpenAPI endpoint. |

Configuration is read at startup; restart after changes. Environment files are not automatically loaded. CORS allows GET/POST and Content-Type without cookies; it is not authentication. Do not expose sensitive project data before a later authentication/data phase.

## Endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health`, `/api/health` | Liveness, prediction mode, `modelLoaded: false` |
| GET | `/api/projects` | Array of frontend-shaped project records |
| GET | `/api/projects/{project_id}` | One project; 404 for unknown IDs |
| POST | `/api/predict` | `RiskPrediction` |
| POST | `/api/risk-analysis` | `projectId`, `prediction`, `recommendations`, `isDemo` |
| GET | `/api/projects/{project_id}/risk-analysis` | Same analysis for the fixture |
| GET | `/api/projects/{project_id}/explanation` | `RiskFactor[]` (demo rule contributions, not SHAP) |
| GET | `/api/projects/{project_id}/recommendations` | Frontend-shaped `Recommendation[]` plus `isDemo` |
| POST | `/api/recommendations` | Recommendations for supplied inputs |

Every POST accepts `{ "project": { ... } }`. Example:

```json
{
  "project": {
    "id": "LS-2026-001",
    "name": "Eastern Freight Corridor — Patna",
    "state": "Bihar",
    "district": "Patna",
    "type": "Railway",
    "totalParcels": 1240,
    "acquiredParcels": 310,
    "compensationPaid": 28,
    "legalCases": 23,
    "approvalDays": 110,
    "complexity": 5,
    "latitude": 25.5941,
    "longitude": 85.1376
  }
}
```

The required fields mirror `CSV_COLUMNS` in `lib/landsight/service.ts`. Optional existing context: `landowners`, `compensationBudgetCr`, `approvalsPending`, `clearanceStatus`, `expectedCompletion` (ISO date), `agency`, `pendingParcels`, `progress`. Unknown fields are rejected: a future frontend adapter must project the input fields from `Project`, not send cached predictions, stages, or display-only risk values. Parcel totals and supplied progress must agree (rounded percentages are allowed). Counts must be integers; compensation is 0–100 percent, approval days 0–180, complexity 1–5. Locations use valid latitude/longitude bounds. There is no separate dispute count or parcel geometry in the current prototype, so none is invented here; outstanding compensation does not prove litigation or disputes.

## Compatibility and demo limitations

- CamelCase JSON and risk levels `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` match `lib/landsight/types.ts`. Prediction keys remain `score`, `level`, `delayDays`, `confidence`, `factors`, `model`, `isDemo`; `metadata` adds model/explanation provenance.
- **Intentional future adapter change:** `confidence` is nullable and returns `null`, not the frontend's illustrative 87. `isDemo` is a boolean so a future trained predictor can return false. No accuracy or trained date is fabricated.
- Project GETs expose only `LS-2026-001`, copied from the first existing synthetic seed in `lib/landsight/data.ts`, not the entire 24-project portfolio. `source: "Synthetic"`, nested prediction metadata, and `X-LandSight-Mode: demo` label responses. Explanation arrays retain the frontend contract; provenance is in that header and the risk-analysis response.
- The temporary predictor ports the existing six deterministic factors, rounding, thresholds, and delay formula from `lib/landsight/risk.ts`. It is not ML. Recommendations are illustrative rules with no validated impact claims.
- POSTs accept new project IDs but never save anything. There are no project mutations or persistence. Dashboard, GIS, alerts, simulation, uploads, audit, and model-performance endpoints remain out of scope.
- Errors use `{ "error": { "code", "message", "details": [] } }`: 422 for invalid inputs, 404 for missing projects/routes, 405 for unsupported methods, 503 for unavailable demo/model/data source, and sanitized 500 errors. Submitted payloads and exception internals are not echoed in error details.

## Structure and Phase 2 extension point

- `app/api/`: routes and injectable predictor/project dependencies.
- `app/schemas/contracts.py`: validated requests, responses, and metadata.
- `app/services/`: read-only demo fixture, temporary predictor, recommendations.
- `app/models/contracts.py`: `Predictor` protocol and a versioned, ordered raw feature matrix compatible with a future scikit-learn pipeline adapter.
- `app/core/`: startup settings and error handling.

Implement a future fitted-model adapter with `predict(ProjectInput) -> RiskPrediction`, then replace the predictor dependency/app-state construction in `app/main.py`. Keep preprocessing and feature order with the model artifact; `feature_matrix` currently uses only the six prototype numeric inputs. Additional features require a versioned contract and training pipeline. Load trusted artifacts once at startup, never from caller-supplied paths. Later explanations plug into `factors` and `metadata`; do not label demo contributions as SHAP. No ML dependency is installed in Phase 1.

## Validation

From `backend/` with the virtual environment active:

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python -m pip check
```

Tests cover contracts, fixture consistency, numerical boundaries, request validation, non-persistence, CORS, disabled mode, error sanitization, and feature order. `httpx` is test-only; tests otherwise use Python's standard library.
