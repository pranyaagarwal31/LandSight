from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
ProjectType = Literal["Highway", "Railway", "Irrigation", "Power", "Industrial", "Road infrastructure"]
Count = Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)]
Percentage = Annotated[float, Field(strict=True, ge=0, le=100)]
Text = Annotated[str, Field(min_length=1, max_length=240)]


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        allow_inf_nan=False,
        str_strip_whitespace=True,
    )


class ProjectInput(APIModel):
    id: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
    name: Text
    state: Text
    district: Text
    type: ProjectType
    total_parcels: Annotated[int, Field(strict=True, gt=0, le=2_147_483_647)]
    acquired_parcels: Count
    compensation_paid: Percentage = Field(description="Percentage paid (0–100), not a currency amount or dispute count.")
    legal_cases: Count = Field(description="Pending, unresolved legal cases.")
    approval_days: Annotated[int, Field(strict=True, ge=0, le=180)]
    complexity: Annotated[int, Field(strict=True, ge=1, le=5)]
    latitude: Annotated[float, Field(strict=True, ge=-90, le=90)]
    longitude: Annotated[float, Field(strict=True, ge=-180, le=180)]
    landowners: Count | None = None
    compensation_budget_cr: Annotated[float, Field(strict=True, ge=0)] | None = None
    approvals_pending: Count | None = None
    clearance_status: Text | None = None
    expected_completion: date | None = None
    agency: Text | None = None
    pending_parcels: Count | None = None
    progress: Percentage | None = None

    @model_validator(mode="after")
    def consistent_acquisition(self) -> Self:
        if self.acquired_parcels > self.total_parcels:
            raise ValueError("acquiredParcels cannot exceed totalParcels")
        if self.pending_parcels is not None and self.pending_parcels != self.total_parcels - self.acquired_parcels:
            raise ValueError("pendingParcels must equal totalParcels minus acquiredParcels")
        if self.progress is not None and abs(self.progress - self.acquired_parcels / self.total_parcels * 100) > 0.500001:
            raise ValueError("progress must match the acquired parcel percentage (rounding allowed)")
        return self


class RiskFactor(APIModel):
    id: str
    name: str
    contribution: float
    description: str


class ModelMetadata(APIModel):
    version: str
    status: Literal["demo", "trained"] = "demo"
    algorithm: str = "deterministic-rules"
    explanation_method: str = "rule-contributions-not-shap"
    feature_schema_version: str = "landsight-risk-v1"
    trained_at: str | None = None
    notice: str = "Temporary demonstration only. No trained ML model, calibrated confidence, or SHAP explanation."


class RiskPrediction(APIModel):
    score: Annotated[int, Field(ge=0, le=100)]
    level: RiskLevel
    delay_days: Count
    confidence: Percentage | None = None
    factors: list[RiskFactor]
    model: str
    is_demo: bool
    metadata: ModelMetadata


class ProjectStage(APIModel):
    name: str
    completion: Percentage
    risk: RiskLevel
    status: Literal["Complete", "In progress", "Needs attention", "Not started"]
    delay_days: Count


class ProjectInformation(ProjectInput):
    pending_parcels: Count
    landowners: Count
    compensation_budget_cr: Annotated[float, Field(strict=True, ge=0)]
    approvals_pending: Count
    clearance_status: Text
    progress: Percentage
    expected_completion: date
    agency: Text
    risk_score: Annotated[int, Field(ge=0, le=100)]
    expected_delay: Count
    risk_level: RiskLevel
    risk_change: int
    primary_risk: str
    status: Literal["On track", "At risk", "Delayed"]
    prediction: RiskPrediction
    stages: list[ProjectStage]
    source: Literal["Synthetic"] = "Synthetic"


class PredictionRequest(APIModel):
    project: ProjectInput


class Recommendation(APIModel):
    id: str
    project_id: str
    title: str
    priority: RiskLevel
    reason: str
    impact: str
    action: str
    owner: str
    is_demo: bool = True


class RiskAnalysis(APIModel):
    project_id: str
    prediction: RiskPrediction
    recommendations: list[Recommendation]
    is_demo: bool = True


class HealthResponse(APIModel):
    status: Literal["ok"] = "ok"
    service: str = "LandSight backend"
    version: str = "0.1.0"
    prediction_mode: Literal["demo", "unavailable"]
    model_loaded: bool = False


class ErrorDetail(APIModel):
    location: list[str | int]
    message: str
    type: str


class ErrorBody(APIModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(APIModel):
    error: ErrorBody
