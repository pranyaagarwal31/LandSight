from typing import Annotated

from fastapi import Depends, Path, Request

from ..core.errors import APIError
from ..models.contracts import Predictor
from ..schemas.contracts import ProjectInput
from ..services.projects import DemoProjectRepository


def get_predictor(request: Request) -> Predictor:
    predictor = request.app.state.predictor
    if predictor is None:
        raise APIError(503, "MODEL_UNAVAILABLE", "Demo mode is disabled; no trained model is configured.")
    return predictor


def get_project_repository(request: Request) -> DemoProjectRepository:
    if not request.app.state.settings.demo_enabled:
        raise APIError(503, "PROJECT_SOURCE_UNAVAILABLE", "Demo data is disabled; no project data source is configured.")
    return request.app.state.project_repository


PredictorDependency = Annotated[Predictor, Depends(get_predictor)]
RepositoryDependency = Annotated[DemoProjectRepository, Depends(get_project_repository)]


def get_project(
    project_id: Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")],
    repository: RepositoryDependency,
) -> ProjectInput:
    project = repository.get_project(project_id)
    if project is None:
        raise APIError(404, "PROJECT_NOT_FOUND", "Project not found in the read-only demo fixture.")
    return project


ProjectDependency = Annotated[ProjectInput, Depends(get_project)]
