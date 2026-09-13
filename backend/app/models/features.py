import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from ..schemas.contracts import ProjectInput
from .contracts import FEATURE_NAMES
from .dataset import PROJECT_TYPES

ML_FEATURE_SCHEMA_VERSION = "landsight-acquisition-v2"
NUMERIC_FEATURES = FEATURE_NAMES + ("landowners", "compensationBudgetCr", "approvalsPending")
ML_FEATURE_NAMES = NUMERIC_FEATURES + ("type",)


def raw_feature_values(project: ProjectInput) -> dict[str, float | str | None]:
    values = project.model_dump(by_alias=True)
    return {name: values[name] for name in ML_FEATURE_NAMES}


def ml_feature_matrix(projects: list[ProjectInput]) -> np.ndarray:
    return np.asarray([
        [np.nan if value is None else value for value in raw_feature_values(project).values()]
        for project in projects
    ], dtype=object).reshape(-1, len(ML_FEATURE_NAMES))


def preprocessing() -> ColumnTransformer:
    return ColumnTransformer([
        ("numeric", SimpleImputer(strategy="median", keep_empty_features=True), list(range(len(NUMERIC_FEATURES)))),
        ("type", OneHotEncoder(categories=[list(PROJECT_TYPES)], handle_unknown="ignore", sparse_output=False), [len(NUMERIC_FEATURES)]),
    ], verbose_feature_names_out=False)


def model_pipeline(estimator) -> Pipeline:
    return Pipeline([("preprocessing", preprocessing()), ("model", estimator)])


def transformed_feature_names(pipeline: Pipeline) -> list[str]:
    return pipeline.named_steps["preprocessing"].get_feature_names_out(list(ML_FEATURE_NAMES)).tolist()
