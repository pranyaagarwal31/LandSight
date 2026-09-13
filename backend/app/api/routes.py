from fastapi import APIRouter, Request

from ..schemas.contracts import (
    ErrorResponse, HealthResponse, PredictionRequest, ProjectInformation,
    Recommendation, RiskAnalysis, RiskFactor, RiskPrediction,
)
from ..services.projects import project_information
from ..services.recommendations import recommendations_for
from .dependencies import PredictorDependency, ProjectDependency, RepositoryDependency

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
    return HealthResponse(prediction_mode="demo" if request.app.state.settings.demo_enabled else "unavailable")


@router.get("/projects", response_model=list[ProjectInformation], tags=["Projects"])
def list_projects(repository: RepositoryDependency, predictor: PredictorDependency) -> list[ProjectInformation]:
    return [project_information(project, predictor.predict(project)) for project in repository.list_projects()]


@router.get("/projects/{project_id}", response_model=ProjectInformation, tags=["Projects"])
def read_project(project: ProjectDependency, predictor: PredictorDependency) -> ProjectInformation:
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


@router.get("/projects/{project_id}/explanation", response_model=list[RiskFactor], tags=["Risk analysis"])
def explain_project(project: ProjectDependency, predictor: PredictorDependency) -> list[RiskFactor]:
    """Demo rule contributions only, not SHAP. Full metadata is on the risk-analysis response."""
    return predictor.predict(project).factors


@router.get("/projects/{project_id}/recommendations", response_model=list[Recommendation], tags=["Recommendations"])
def project_recommendations(project: ProjectDependency, predictor: PredictorDependency) -> list[Recommendation]:
    return recommendations_for(project, predictor.predict(project))


@router.post("/recommendations", response_model=list[Recommendation], tags=["Recommendations"])
def recommend(payload: PredictionRequest, predictor: PredictorDependency) -> list[Recommendation]:
    return recommendations_for(payload.project, predictor.predict(payload.project))
