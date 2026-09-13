import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.utils.validation import check_is_fitted

from ..models.artifacts import ARTIFACT_FORMAT_VERSION, runtime_versions
from ..models.dataset import SYNTHETIC_NOTICE
from ..models.evaluation import predictions
from ..models.features import ML_FEATURE_NAMES, ML_FEATURE_SCHEMA_VERSION, ml_feature_matrix, raw_feature_values, transformed_feature_names
from ..schemas.contracts import ModelMetadata, ProbabilityEstimate, ProjectInput, RiskPrediction
from ..schemas.performance import ModelPerformance
from .prediction import risk_level


class MLPredictor:
    """Loads only an operator-controlled local release; joblib must never receive user uploads."""

    def __init__(self, directory: Path):
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        if manifest["formatVersion"] != ARTIFACT_FORMAT_VERSION:
            raise ValueError("Unsupported artifact format")
        if manifest["featureSchemaVersion"] != ML_FEATURE_SCHEMA_VERSION or manifest["featureNames"] != list(ML_FEATURE_NAMES):
            raise ValueError("Artifact feature contract mismatch")
        if manifest["runtime"] != runtime_versions():
            raise ValueError("Artifact runtime mismatch; retrain under this runtime and dependency lock")
        # Checksums detect corruption, not malicious pickles: the entire release must be trusted.
        for name in ("model.joblib", "performance.json"):
            content = (directory / name).read_bytes()
            if hashlib.sha256(content).hexdigest() != manifest["files"][name]:
                raise ValueError("Artifact checksum mismatch")
        report = ModelPerformance.model_validate_json((directory / "performance.json").read_text(encoding="utf-8"))
        bundle = joblib.load(directory / "model.joblib")
        if bundle["formatVersion"] != ARTIFACT_FORMAT_VERSION or bundle["featureSchemaVersion"] != ML_FEATURE_SCHEMA_VERSION:
            raise ValueError("Model bundle schema mismatch")
        if bundle["featureNames"] != list(ML_FEATURE_NAMES) or bundle["version"] != report.version or report.version != manifest["version"]:
            raise ValueError("Model bundle provenance mismatch")
        self.classifier, self.regressor = bundle["classifier"], bundle["regressor"]
        for pipeline in (self.classifier, self.regressor):
            if not isinstance(pipeline, Pipeline) or pipeline.n_features_in_ != len(ML_FEATURE_NAMES):
                raise ValueError("Invalid fitted model pipeline")
            check_is_fitted(pipeline.named_steps["preprocessing"])
            check_is_fitted(pipeline.named_steps["model"])
        if list(self.classifier.classes_) != [0, 1]:
            raise ValueError("Classifier must represent both binary delay outcomes")
        if transformed_feature_names(self.classifier) != transformed_feature_names(self.regressor):
            raise ValueError("Classifier and regressor preprocessing disagree")
        self.performance = report
        self.training_ranges = bundle["trainingRanges"]

    def predict(self, project: ProjectInput) -> RiskPrediction:
        matrix = ml_feature_matrix([project])
        probabilities, delays = predictions(self.classifier, self.regressor, matrix)
        probability, delay = float(probabilities[0]), int(delays[0])
        if not np.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("Model produced an invalid probability")
        score = int(np.floor(probability * 100 + 0.5))
        level = risk_level(score)
        raw_values = raw_feature_values(project)
        warnings = []
        for name, (lower, upper) in self.training_ranges.items():
            value = raw_values[name]
            if value is None:
                warnings.append(f"{name} was missing and replaced by the training-set median.")
            elif not lower <= float(value) <= upper:
                warnings.append(f"{name} is outside the synthetic training range [{lower:g}, {upper:g}]; this estimate is out of distribution.")
        transformed = self.classifier.named_steps["preprocessing"].transform(matrix)[0]
        return RiskPrediction(
            score=score, level=level, risk_category=level.title(), delay_days=delay,
            confidence=None, probability=ProbabilityEstimate(value=probability), factors=[],
            model=self.performance.version, is_demo=True,
            metadata=ModelMetadata(
                version=self.performance.version, status="trained", algorithm=self.performance.algorithm,
                explanation_method="not-implemented-no-shap", feature_schema_version=ML_FEATURE_SCHEMA_VERSION,
                trained_at=self.performance.last_trained, notice=SYNTHETIC_NOTICE,
            ),
            feature_values=raw_values,
            transformed_feature_values=dict(zip(transformed_feature_names(self.classifier), map(float, transformed), strict=True)),
            warnings=warnings,
        )
