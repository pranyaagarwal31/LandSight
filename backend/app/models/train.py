import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier, XGBRegressor

from ..schemas.performance import CandidateEvaluation, DisplayMetric, FeatureImportance, ModelPerformance, SplitInformation
from .artifacts import ARTIFACT_FORMAT_VERSION, DEFAULT_ARTIFACT_DIRECTORY, runtime_versions
from .dataset import DATASET_VERSION, DELAY_THRESHOLD_DAYS, SEED, SYNTHETIC_NOTICE, dataset_csv, dataset_sha256, generate_dataset
from .evaluation import evaluate, predictions, selection_loss
from .features import ML_FEATURE_NAMES, ML_FEATURE_SCHEMA_VERSION, ml_feature_matrix, model_pipeline, transformed_feature_names

SELECTION_RULE = "Lowest validation log loss + validation delay MAE / 90; tie broken by algorithm name. Baseline excluded; test never selects the model."


def candidate_models(seed: int, trees: int):
    forest = dict(n_estimators=trees, max_depth=12, min_samples_leaf=4, random_state=seed, n_jobs=1)
    boosting = dict(n_estimators=trees, max_depth=4, learning_rate=0.06, subsample=1.0, colsample_bytree=1.0, random_state=seed, n_jobs=1, tree_method="hist", device="cpu")
    return {
        "Random Forest": (RandomForestClassifier(**forest), RandomForestRegressor(**forest)),
        "XGBoost": (XGBClassifier(**boosting, objective="binary:logistic", eval_metric="logloss"), XGBRegressor(**boosting, objective="reg:squarederror")),
        "Baseline": (DummyClassifier(strategy="prior"), DummyRegressor(strategy="mean")),
    }


def train(output: Path = DEFAULT_ARTIFACT_DIRECTORY, records: int = 6000, seed: int = SEED, trees: int = 160) -> ModelPerformance:
    if trees < 1:
        raise ValueError("trees must be positive")
    if (output / "manifest.json").exists():
        raise FileExistsError("Output already contains a model release; use a new output directory to avoid overwriting a loaded artifact")
    projects, delays = generate_dataset(records, seed)
    features = ml_feature_matrix(projects)
    labels = (delays > DELAY_THRESHOLD_DAYS).astype(int)
    train_indices, holdout = train_test_split(np.arange(records), test_size=0.4, random_state=seed, stratify=labels)
    validation_indices, test_indices = train_test_split(holdout, test_size=0.5, random_state=seed + 1, stratify=labels[holdout])
    split = {"train": train_indices, "validation": validation_indices, "test": test_indices}
    fitted, validation_results, prediction_rows = {}, {}, []
    for algorithm, (classifier, regressor) in candidate_models(seed, trees).items():
        classifier, regressor = model_pipeline(classifier), model_pipeline(regressor)
        classifier.fit(features[train_indices], labels[train_indices])
        regressor.fit(features[train_indices], delays[train_indices])
        fitted[algorithm] = (classifier, regressor)
        probabilities, estimates = predictions(classifier, regressor, features[validation_indices])
        validation_results[algorithm] = evaluate(delays[validation_indices], probabilities, estimates)
    selected = min((name for name in fitted if name != "Baseline"), key=lambda name: (selection_loss(validation_results[name]), name))
    evaluations = {}
    # Selection is frozen before any test predictions or metrics are computed.
    for algorithm, (classifier, regressor) in fitted.items():
        test_probabilities, test_estimates = predictions(classifier, regressor, features[test_indices])
        evaluations[algorithm] = CandidateEvaluation(
            algorithm=algorithm, validation=validation_results[algorithm],
            test=evaluate(delays[test_indices], test_probabilities, test_estimates),
            validation_selection_loss=selection_loss(validation_results[algorithm]),
        )
        for split_name in ("validation", "test"):
            indices = split[split_name]
            probabilities, estimates = predictions(classifier, regressor, features[indices])
            prediction_rows.extend({
                "projectId": projects[int(index)].id, "split": split_name, "algorithm": algorithm,
                "actualSyntheticDelayDays": int(delays[index]), "predictedDelayDays": int(estimate),
                "actualSyntheticDelayedOver90Days": int(labels[index]), "probability": float(probability),
                "predictedDelayedOver90Days": int(probability >= 0.5), "source": "Synthetic",
            } for index, probability, estimate in zip(indices, probabilities, estimates, strict=True))
    classifier, regressor = fitted[selected]
    content = dataset_csv(projects, delays)
    dataset_hash = dataset_sha256(content)
    configuration = {"seed": seed, "records": records, "trees": trees, "selected": selected, "schema": ML_FEATURE_SCHEMA_VERSION, "dataset": DATASET_VERSION, "datasetSha256": dataset_hash, "runtime": runtime_versions()}
    version_hash = hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest()[:12]
    version = f"LS-SYNTHETIC-2.0-{version_hash}"
    names = transformed_feature_names(classifier)
    importance = classifier.named_steps["model"].feature_importances_
    importance_total = float(np.sum(importance))
    test = evaluations[selected].test
    metrics = [
        DisplayMetric(name=name, value=f"{value:.4f}", description="Measured on held-out synthetic delay probabilities across all thresholds; not real-world discrimination." if name == "ROC-AUC" else "Measured on held-out synthetic binary delay labels at probability threshold 0.5; not real-world accuracy.")
        for name, value in (("Accuracy", test.classification.accuracy), ("Precision", test.classification.precision), ("Recall", test.classification.recall), ("F1 Score", test.classification.f1), ("ROC-AUC", test.classification.roc_auc))
        if value is not None
    ]
    metrics += [
        DisplayMetric(name="Delay MAE", value=f"{test.regression.mae:.2f} days", description="Held-out synthetic mean absolute delay error."),
        DisplayMetric(name="Delay RMSE", value=f"{test.regression.rmse:.2f} days", description="Held-out synthetic root mean squared delay error."),
        DisplayMetric(name="Delay R²", value=f"{test.regression.r2:.4f}", description="Held-out synthetic regression coefficient of determination."),
        DisplayMetric(name="Brier score", value=f"{test.classification.brier_score:.4f}", description="Synthetic probability squared error; lower is better. Not a calibration guarantee."),
        DisplayMetric(name="Log loss", value=f"{test.classification.log_loss:.4f}", description="Synthetic binary probability log loss; lower is better."),
    ]
    report = ModelPerformance(
        version=version, last_trained=datetime.now(timezone.utc).isoformat(), training_records=len(train_indices),
        features=len(ML_FEATURE_NAMES), transformed_features=len(names), metrics=metrics,
        confusion_matrix=test.classification.confusion_matrix,
        feature_importance=[FeatureImportance(name=name, importance=float(value / importance_total * 100) if importance_total else 0.0) for name, value in zip(names, importance, strict=True)],
        algorithm=selected, feature_schema_version=ML_FEATURE_SCHEMA_VERSION, notice=SYNTHETIC_NOTICE,
        target="Classification: simulated delay >90 days. Regression: simulated delay days. Score = rounded probability × 100; category cutoffs 30/60/80 are presentation bands, not four trained classes.",
        split=SplitInformation(seed=seed, train=len(train_indices), validation=len(validation_indices), test=len(test_indices)),
        dataset_version=DATASET_VERSION, dataset_sha256=dataset_hash, selection_rule=SELECTION_RULE,
        evaluations=[evaluations[name] for name in fitted if name != "Baseline"], baseline=evaluations["Baseline"],
    )
    numeric = features[train_indices, :-1].astype(float)
    bundle = {
        "formatVersion": ARTIFACT_FORMAT_VERSION, "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
        "featureNames": list(ML_FEATURE_NAMES), "version": version,
        "classifier": classifier, "regressor": regressor,
        "trainingRanges": {name: [float(np.nanmin(numeric[:, i])), float(np.nanmax(numeric[:, i]))] for i, name in enumerate(ML_FEATURE_NAMES[:-1])},
    }
    output.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, output / "model.joblib", compress=3)
    (output / "synthetic-training.csv").write_text(content, encoding="utf-8")
    (output / "performance.json").write_text(report.model_dump_json(by_alias=True, indent=2) + "\n", encoding="utf-8")
    (output / "splits.json").write_text(json.dumps({name: [projects[int(i)].id for i in indices] for name, indices in split.items()}, indent=2) + "\n", encoding="utf-8")
    with (output / "holdout-predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(prediction_rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(prediction_rows)
    manifest = {
        "formatVersion": ARTIFACT_FORMAT_VERSION, "version": version, "configuration": configuration,
        "runtime": runtime_versions(), "featureSchemaVersion": ML_FEATURE_SCHEMA_VERSION,
        "featureNames": list(ML_FEATURE_NAMES), "notice": SYNTHETIC_NOTICE,
        "hyperparameters": {
            name: {target: {key: "NaN (missing-value sentinel)" if isinstance(value, float) and np.isnan(value) else value for key, value in pipeline.named_steps["model"].get_params().items()} for target, pipeline in zip(("classifier", "regressor"), pair, strict=True)}
            for name, pair in fitted.items()
        },
        "files": {name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in ("model.joblib", "performance.json", "synthetic-training.csv", "splits.json", "holdout-predictions.csv")},
    }
    temporary_manifest = output / "manifest.json.tmp"
    temporary_manifest.write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary_manifest.replace(output / "manifest.json")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate LandSight on explicitly synthetic, reproducible acquisition data.")
    parser.add_argument("--output", type=Path, default=DEFAULT_ARTIFACT_DIRECTORY)
    parser.add_argument("--records", type=int, default=6000)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--trees", type=int, default=160)
    args = parser.parse_args()
    report = train(args.output, args.records, args.seed, args.trees)
    print(json.dumps({"version": report.version, "selected": report.algorithm, "metrics": [row.model_dump() for row in report.metrics], "notice": report.notice}, indent=2))


if __name__ == "__main__":
    main()
