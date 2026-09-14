from typing import Annotated

from fastapi import Depends, Path, Request

from ..core.errors import APIError
from ..models.contracts import Predictor
from ..schemas.contracts import ProjectInput
from ..services.database import ProjectRepository


def get_predictor(request: Request) -> Predictor:
    predictor = request.app.state.predictor
    if predictor is None:
        raise APIError(503, "MODEL_UNAVAILABLE", "No compatible trained model is loaded and rule-based fallback is not enabled.")
    return predictor


def get_project_repository(request: Request) -> ProjectRepository:
    return ProjectRepository(request.app.state.database, request.app.state.settings.demo_enabled)


PredictorDependency = Annotated[Predictor, Depends(get_predictor)]
RepositoryDependency = Annotated[ProjectRepository, Depends(get_project_repository)]


async def get_project(
    project_id: Annotated[str, Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")],
    repository: RepositoryDependency,
) -> ProjectInput:
    project = await repository.get_project(project_id)
    if project is None:
        raise APIError(404, "PROJECT_NOT_FOUND", "Project not found in the current project source.")
    return project


ProjectDependency = Annotated[ProjectInput, Depends(get_project)]
