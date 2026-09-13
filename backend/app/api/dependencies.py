from typing import Annotated

from fastapi import Depends, Path, Request

from ..core.errors import APIError
from ..models.contracts import Predictor
from ..schemas.contracts import ProjectInput
from ..services.projects import ProjectRepository


def get_predictor(request: Request) -> Predictor:
    predictor = request.app.state.predictor
    if predictor is None:
        raise APIError(503, "MODEL_UNAVAILABLE", "No compatible trained model is loaded and rule-based fallback is not enabled.")
    return predictor


def get_project_repository(request: Request) -> ProjectRepository:
    repository = request.app.state.project_repository
    if repository is None:
        raise APIError(503, "PROJECT_SOURCE_UNAVAILABLE", "No project source is ready; check database configuration and migrations, or enable development demo fallback.")
    return repository


PredictorDependency = Annotated[Predictor, Depends(get_predictor)]
RepositoryDependency = Annotated[ProjectRepository, Depends(get_project_repository)]


async def get_project(
    project_id: Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")],
    repository: RepositoryDependency,
) -> ProjectInput:
    project = await repository.get_project(project_id)
    if project is None:
        raise APIError(404, "PROJECT_NOT_FOUND", "Project not found in the active project source.")
    return project


ProjectDependency = Annotated[ProjectInput, Depends(get_project)]
