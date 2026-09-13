from typing import Protocol

from ..schemas.contracts import ProjectInput, RiskPrediction

FEATURE_SCHEMA_VERSION = "landsight-risk-v1"
FEATURE_NAMES = (
    "totalParcels", "acquiredParcels", "compensationPaid",
    "legalCases", "approvalDays", "complexity",
)


def feature_matrix(projects: list[ProjectInput]) -> list[list[float]]:
    """Stable raw feature order for a future fitted scikit-learn pipeline adapter."""
    return [
        [float(project.model_dump(by_alias=True)[name]) for name in FEATURE_NAMES]
        for project in projects
    ]


class Predictor(Protocol):
    def predict(self, project: ProjectInput) -> RiskPrediction: ...
