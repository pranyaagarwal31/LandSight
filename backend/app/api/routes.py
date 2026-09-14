from typing import Literal

from fastapi import APIRouter, Request

from ..core.errors import APIError
from ..schemas.performance import ModelPerformance

from ..schemas.contracts import (
    ErrorResponse, HealthResponse, PredictionRequest, ProjectInformation,
    Recommendation, RiskAnalysis, RiskFactor, RiskPrediction, ShapExplanation,
)
from ..services.projects import project_information
from ..services.recommendations import recommendations_for
from .dependencies import (
    PersistedProjectDependency, PersistedProjectsDependency, PredictorDependency, ProjectDependency,
)

router = APIRouter(
    prefix="/api",
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
health_router = APIRouter(tags=["Health"])


@health_router.get("/health", response_model=HealthResponse)
@router.get("/health", response_model=HealthResponse, tags=["Health"])
def health(request: Request) -> HealthResponse:
    state = request.app.state
    return HealthResponse(
        prediction_mode=state.prediction_mode, model_loaded=state.prediction_mode == "ml",
        model_version=state.model_performance.version if state.model_performance else None,
        notice=state.prediction_notice,
    )


@router.get("/model-performance", response_model=ModelPerformance, tags=["Model performance"])
def model_performance(request: Request) -> ModelPerformance:
    if request.app.state.model_performance is None:
        raise APIError(503, "MODEL_UNAVAILABLE", "No measured model performance is available without a loaded trained artifact.")
    return request.app.state.model_performance


@router.get("/projects", response_model=list[ProjectInformation], tags=["Projects"])
def list_projects(projects: PersistedProjectsDependency, predictor: PredictorDependency) -> list[ProjectInformation]:
    return [project_information(project, predictor.predict(project)) for project in projects]


@router.get("/projects/{project_id}", response_model=ProjectInformation, tags=["Projects"])
def read_project(project: PersistedProjectDependency, predictor: PredictorDependency) -> ProjectInformation:
    return project_information(project, predictor.predict(project))


@router.post("/predict", response_model=RiskPrediction, tags=["Predictions"])
def predict(payload: PredictionRequest, predictor: PredictorDependency) -> RiskPrediction:
    return predictor.predict(payload.project)


@router.post("/risk-analysis", response_model=RiskAnalysis, tags=["Risk analysis"])
def analyze(payload: PredictionRequest, predictor: PredictorDependency) -> RiskAnalysis:
    prediction = predictor.predict(payload.project)
    return RiskAnalysis(
        project_id=payload.project.id,
        prediction=prediction,
        recommendations=recommendations_for(payload.project, prediction),
        is_demo=prediction.is_demo,
    )


@router.get("/projects/{project_id}/risk-analysis", response_model=RiskAnalysis, tags=["Risk analysis"])
def project_analysis(project: ProjectDependency, predictor: PredictorDependency) -> RiskAnalysis:
    return analyze(PredictionRequest(project=project), predictor)


@router.get("/projects/{project_id}/explanation", response_model=list[RiskFactor] | ShapExplanation, tags=["Risk analysis"])
def explain_project(project: ProjectDependency, predictor: PredictorDependency, format: Literal["factors", "shap"] = "factors") -> list[RiskFactor] | ShapExplanation:
    """Default preserves the factor list. format=shap returns verified units, values, provenance and availability."""
    prediction = predictor.predict(project)
    if format == "shap":
        if prediction.explanation is None:
            raise APIError(503, "SHAP_UNAVAILABLE", "SHAP is unavailable in demo mode. Rule contributions are not SHAP.")
        return prediction.explanation
    return prediction.factors


@router.get("/projects/{project_id}/recommendations", response_model=list[Recommendation], tags=["Recommendations"])
def project_recommendations(project: ProjectDependency, predictor: PredictorDependency) -> list[Recommendation]:
    return recommendations_for(project, predictor.predict(project))


@router.post("/recommendations", response_model=list[Recommendation], tags=["Recommendations"])
def recommend(payload: PredictionRequest, predictor: PredictorDependency) -> list[Recommendation]:
    return recommendations_for(payload.project, predictor.predict(payload.project))
