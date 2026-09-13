import numpy as np
from scipy.special import expit
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from ..models.features import ML_FEATURE_NAMES, ML_FEATURE_SCHEMA_VERSION, NUMERIC_FEATURES, transformed_feature_names
from ..schemas.contracts import ProjectInput, ShapContribution, ShapExplanation

FEATURE_LABELS = {
    "totalParcels": "Total parcels",
    "acquiredParcels": "Acquired parcels",
    "compensationPaid": "Compensation paid",
    "legalCases": "Pending legal cases",
    "approvalDays": "Approval processing time",
    "complexity": "Project complexity",
    "landowners": "Landowners affected",
    "compensationBudgetCr": "Compensation budget",
    "approvalsPending": "Pending approvals",
    "type": "Project type",
}


def describe_contribution(name: str, value: float | str | None, used: float | str, contribution: float, project: ProjectInput) -> str:
    if value is None:
        detail = f"not supplied; training-set median {used:g} used"
    elif name == "acquiredParcels":
        detail = f"{value:g} of {project.total_parcels:,}; {project.acquired_parcels / project.total_parcels:.1%} progress"
    elif name == "compensationPaid":
        detail = f"{value:g}% paid"
    elif name == "approvalDays":
        detail = f"{value:g} days"
    elif name == "compensationBudgetCr":
        detail = f"{value:g} crore"
    elif isinstance(value, str):
        detail = value
    else:
        detail = f"{value:g}"
    effect = "increased predicted risk" if contribution > 0 else "reduced predicted risk" if contribution < 0 else "had no contribution to predicted risk"
    return f"{FEATURE_LABELS[name]} ({detail}) {effect} relative to the model baseline."


class ShapExplainer:
    def __init__(self, classifier: Pipeline, model_version: str, algorithm: str):
        # Optional at runtime: an import/loading failure must not disable an otherwise usable prediction.
        import shap

        self.model = classifier.named_steps["model"]
        if isinstance(self.model, RandomForestClassifier):
            self.output_space = "probability"
        elif isinstance(self.model, XGBClassifier) and self.model.get_params()["objective"] == "binary:logistic":
            self.output_space = "log_odds"
        else:
            raise ValueError("Selected classifier is not supported for TreeSHAP risk explanations")
        if list(classifier.classes_) != [0, 1]:
            raise ValueError("Risk explanations require binary class 1 to represent delay")
        self.names = transformed_feature_names(classifier)
        if self.names[:len(NUMERIC_FEATURES)] != list(NUMERIC_FEATURES) or any(not name.startswith("type_") for name in self.names[len(NUMERIC_FEATURES):]):
            raise ValueError("SHAP grouping does not match the fitted preprocessing contract")
        self.model_version, self.algorithm, self.shap_version = model_version, algorithm, shap.__version__
        self.tree = shap.TreeExplainer(self.model, feature_names=self.names, model_output="raw", feature_perturbation="tree_path_dependent")

    def explain(self, project: ProjectInput, raw: dict[str, float | str | None], transformed: np.ndarray, probability: float) -> ShapExplanation:
        if transformed.shape != (1, len(self.names)) or not np.isfinite(transformed).all():
            raise ValueError("Invalid transformed feature matrix for SHAP")
        result = self.tree(transformed, check_additivity=True, approximate=False)
        if self.output_space == "probability":
            if result.values.shape != (1, len(self.names), 2) or result.base_values.shape != (1, 2):
                raise ValueError("Unexpected multi-class SHAP output shape")
            values, baseline = result.values[0, :, 1], float(result.base_values[0, 1])
            output = float(self.model.predict_proba(transformed)[0, 1])
        else:
            if result.values.shape != (1, len(self.names)) or result.base_values.shape != (1,):
                raise ValueError("Unexpected binary SHAP output shape")
            values, baseline = result.values[0], float(result.base_values[0])
            output = float(self.model.predict(transformed, output_margin=True)[0])
        if not np.isfinite(values).all() or not np.isfinite([baseline, output]).all():
            raise ValueError("Non-finite SHAP output")
        if not np.isclose(baseline + float(np.sum(values)), output, atol=1e-5, rtol=1e-5):
            raise ValueError("SHAP contributions do not reconstruct the selected model output")
        explained_probability = float(expit(output)) if self.output_space == "log_odds" else output
        if not np.isclose(explained_probability, probability, atol=1e-6, rtol=1e-6):
            raise ValueError("SHAP explanation does not match the served prediction")

        groups = {name: [i] for i, name in enumerate(NUMERIC_FEATURES)}
        # Sum every one-hot column, including inactive categories, to preserve local additivity.
        groups["type"] = list(range(len(NUMERIC_FEATURES), len(self.names)))
        grouped = {name: float(np.sum(values[indices])) for name, indices in groups.items()}
        total = sum(abs(value) for value in grouped.values())
        factors = []
        for name in ML_FEATURE_NAMES:
            contribution = grouped[name]
            indices = groups[name]
            used = {self.names[i]: float(transformed[0, i]) for i in indices}
            factors.append(ShapContribution(
                id=name, feature_name=name, name=FEATURE_LABELS[name], input_value=raw[name],
                transformed_values=used, contribution=contribution,
                direction="increases risk" if contribution > 0 else "decreases risk" if contribution < 0 else "no contribution",
                relative_importance=abs(contribution) / total if total else 0.0,
                description=describe_contribution(name, raw[name], raw[name] if name == "type" else next(iter(used.values())), contribution, project),
            ))
        return ShapExplanation(
            status="available", model_version=self.model_version, algorithm=self.algorithm,
            feature_schema_version=ML_FEATURE_SCHEMA_VERSION, shap_version=self.shap_version,
            output_space=self.output_space, base_value=baseline, output_value=output, predicted_probability=probability,
            contributions=factors,
            top_risk_factors=sorted((f for f in factors if f.contribution > 0), key=lambda f: -f.contribution)[:3],
            risk_reducing_factors=sorted((f for f in factors if f.contribution < 0), key=lambda f: f.contribution)[:3],
            transformed_contributions=dict(zip(self.names, map(float, values), strict=True)),
        )
