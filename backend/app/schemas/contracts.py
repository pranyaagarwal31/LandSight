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


class ProbabilityEstimate(APIModel):
    event: str = "Synthetic delay exceeds 90 days"
    value: Annotated[float, Field(ge=0, le=1)]
    calibrated: Literal[False] = False
    notice: str = "Uncalibrated model estimate for a synthetic event; not confidence in correctness or a real-world probability."


ContributionDirection = Literal["increases risk", "decreases risk", "no contribution"]


class ShapContribution(RiskFactor):
    feature_name: str
    input_value: float | str | None
    transformed_values: dict[str, float]
    direction: ContributionDirection
    relative_importance: Annotated[float, Field(ge=0, le=1)]

    @model_validator(mode="after")
    def consistent_direction(self) -> Self:
        expected = "increases risk" if self.contribution > 0 else "decreases risk" if self.contribution < 0 else "no contribution"
        if self.direction != expected:
            raise ValueError("Direction must agree with the signed SHAP contribution")
        return self


class ShapExplanation(APIModel):
    status: Literal["available", "unavailable"]
    method: Literal["tree-shap"] = "tree-shap"
    feature_perturbation: Literal["tree_path_dependent"] = "tree_path_dependent"
    model_version: str
    algorithm: str
    feature_schema_version: str
    shap_version: str | None = None
    target: str = "Synthetic delay exceeds 90 days (class 1); explains classification risk, not predicted delay days."
    output_space: Literal["log_odds", "probability"] | None = None
    base_value: float | None = None
    output_value: float | None = None
    predicted_probability: Annotated[float, Field(ge=0, le=1)] | None = None
    contributions: list[ShapContribution] = Field(default_factory=list)
    top_risk_factors: list[ShapContribution] = Field(default_factory=list)
    risk_reducing_factors: list[ShapContribution] = Field(default_factory=list)
    transformed_contributions: dict[str, float] = Field(default_factory=dict)
    notice: str = "Generated by a prototype model trained on synthetic data. SHAP describes model behavior, not causes, model accuracy, or real government performance. Correlated features can share attribution."
    unavailable_reason: str | None = None

    @model_validator(mode="after")
    def consistent_availability(self) -> Self:
        values = (self.base_value, self.output_value, self.predicted_probability, self.output_space, self.shap_version)
        if self.status == "available":
            if any(value is None for value in values) or not self.contributions or self.unavailable_reason is not None:
                raise ValueError("Available explanations require verified contributions and output metadata")
            if any(f.contribution <= 0 or f not in self.contributions for f in self.top_risk_factors):
                raise ValueError("Top risk factors must be positive contributions")
            if any(f.contribution >= 0 or f not in self.contributions for f in self.risk_reducing_factors):
                raise ValueError("Risk-reducing factors must be negative contributions")
        elif (any(value is not None for value in values[:4]) or self.contributions or self.top_risk_factors
              or self.risk_reducing_factors or self.transformed_contributions or not self.unavailable_reason):
            raise ValueError("Unavailable explanations must not contain fabricated outputs or contributions")
        return self


class RiskPrediction(APIModel):
    score: Annotated[int, Field(ge=0, le=100)]
    level: RiskLevel
    delay_days: Count
    confidence: Percentage | None = None
    factors: list[RiskFactor]
    model: str
    is_demo: bool
    metadata: ModelMetadata
    risk_category: Literal["Low", "Medium", "High", "Critical"] | None = None
    probability: ProbabilityEstimate | None = None
    feature_values: dict[str, float | str | None] = Field(default_factory=dict)
    transformed_feature_values: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    explanation: ShapExplanation | None = None


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
    version: str = "0.2.0"
    prediction_mode: Literal["ml", "demo", "unavailable"]
    model_loaded: bool = False
    model_version: str | None = None
    notice: str | None = None


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
