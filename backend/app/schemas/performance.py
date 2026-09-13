from typing import Annotated, Literal

from pydantic import Field

from .contracts import APIModel

UnitInterval = Annotated[float, Field(ge=0, le=1)]


class ConfusionMatrix(APIModel):
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int


class ClassificationMetrics(APIModel):
    accuracy: UnitInterval
    precision: UnitInterval
    recall: UnitInterval
    f1: UnitInterval
    roc_auc: UnitInterval | None
    brier_score: UnitInterval
    log_loss: float
    threshold: float = 0.5
    confusion_matrix: ConfusionMatrix


class RegressionMetrics(APIModel):
    mae: float
    rmse: float
    r2: float


class EvaluationMetrics(APIModel):
    records: int
    classification: ClassificationMetrics
    regression: RegressionMetrics


class CandidateEvaluation(APIModel):
    algorithm: str
    validation: EvaluationMetrics
    test: EvaluationMetrics
    validation_selection_loss: float


class DisplayMetric(APIModel):
    name: str
    value: str
    description: str


class FeatureImportance(APIModel):
    name: str
    importance: float


class SplitInformation(APIModel):
    seed: int
    train: int
    validation: int
    test: int
    strategy: str = "60/20/20 stratified random split on the binary target; preprocessing fitted on training only."


class ModelPerformance(APIModel):
    version: str
    last_trained: str
    training_records: int
    features: int
    metrics: list[DisplayMetric]
    confusion_matrix: ConfusionMatrix
    feature_importance: list[FeatureImportance]
    is_demo: Literal[True] = True
    source: Literal["Synthetic"] = "Synthetic"
    algorithm: str
    feature_schema_version: str
    transformed_features: int
    feature_importance_method: str = "Classifier global tree impurity/gain importance (%), not per-project explanation or SHAP; may be biased."
    notice: str
    target: str
    split: SplitInformation
    dataset_version: str
    dataset_sha256: str
    selection_rule: str
    evaluations: list[CandidateEvaluation]
    baseline: CandidateEvaluation
    evaluation_scope: Literal["synthetic-held-out-test"] = "synthetic-held-out-test"
    probability_notice: str = "Class probabilities are uncalibrated. Brier score and log loss are reported, not a guarantee of calibration."
