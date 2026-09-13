import csv
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.models.artifacts import DEFAULT_ARTIFACT_DIRECTORY
from app.models.dataset import dataset_csv, generate_dataset
from app.models.evaluation import evaluate
from app.models.features import ML_FEATURE_NAMES, ml_feature_matrix
from app.models.train import train
from app.schemas.contracts import RiskPrediction
from app.schemas.performance import ModelPerformance
from app.services.ml_prediction import MLPredictor
from app.services.prediction import risk_level
from app.services.projects import DemoProjectRepository


class MLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.directory = Path(cls.temp.name) / "release"
        cls.report = train(cls.directory, records=800, seed=47, trees=32)
        cls.predictor = MLPredictor(cls.directory)
        cls.project = DemoProjectRepository().list_projects()[0]

    def client(self, **kwargs):
        client = TestClient(create_app(Settings(model_directory=self.directory, **kwargs)))
        self.addCleanup(client.close)
        return client

    def test_model_loading_and_health(self):
        loaded = MLPredictor(self.directory)
        self.assertEqual(loaded.predict(self.project), self.predictor.predict(self.project))
        health = self.client().get("/api/health")
        self.assertEqual(health.json()["predictionMode"], "ml")
        self.assertTrue(health.json()["modelLoaded"])
        self.assertEqual(health.json()["modelVersion"], self.report.version)
        self.assertEqual(health.headers["x-landsight-mode"], "ml")

    def test_checked_in_model_release_is_loadable(self):
        predictor = MLPredictor(DEFAULT_ARTIFACT_DIRECTORY)
        self.assertEqual(predictor.performance.split.train, 3600)
        self.assertEqual(predictor.performance.split.validation, 1200)
        self.assertEqual(predictor.performance.split.test, 1200)
        self.assertEqual(predictor.predict(self.project).metadata.status, "trained")

    def test_valid_prediction_schema_and_provenance(self):
        client = self.client()
        response = client.post("/api/predict", json={"project": self.project.model_dump(by_alias=True, mode="json")})
        self.assertEqual(response.status_code, 200, response.text)
        prediction = RiskPrediction.model_validate(response.json())
        self.assertEqual(prediction, self.predictor.predict(self.project))
        self.assertEqual(prediction.metadata.status, "trained")
        self.assertIn(prediction.metadata.algorithm, ("Random Forest", "XGBoost"))
        self.assertTrue(prediction.is_demo)
        self.assertIsNone(prediction.confidence)
        self.assertFalse(prediction.probability.calibrated)
        self.assertEqual(prediction.factors, [])
        self.assertEqual(prediction.score, int(np.floor(prediction.probability.value * 100 + 0.5)))
        self.assertEqual(prediction.level, risk_level(prediction.score))
        self.assertEqual(prediction.risk_category, prediction.level.title())
        self.assertEqual(list(prediction.feature_values), list(ML_FEATURE_NAMES))
        self.assertEqual(len(prediction.transformed_feature_values), 15)
        self.assertIn("synthetic", prediction.metadata.notice)
        self.assertIn("RiskPrediction", client.get("/openapi.json").json()["components"]["schemas"])

    def test_invalid_ml_inputs_return_422(self):
        client = self.client()
        values = self.project.model_dump(by_alias=True, mode="json")
        for field, invalid in (("totalParcels", 0), ("acquiredParcels", 999999), ("legalCases", -1), ("compensationPaid", 101), ("complexity", 6), ("approvalDays", 181), ("type", "unknown"), ("modelPath", "/tmp/model")):
            with self.subTest(field=field):
                response = client.post("/api/predict", json={"project": {**values, field: invalid}})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")

    def test_risk_category_boundaries_and_rounding(self):
        for score, level in ((0, "LOW"), (30, "LOW"), (31, "MEDIUM"), (60, "MEDIUM"), (61, "HIGH"), (80, "HIGH"), (81, "CRITICAL"), (100, "CRITICAL")):
            with self.subTest(score=score), patch("app.services.ml_prediction.predictions", return_value=(np.array([score / 100]), np.array([100]))):
                response = self.predictor.predict(self.project)
                self.assertEqual(response.score, score)
                self.assertEqual(response.level, level)
        for probability, expected in ((0.3049, 30), (0.305, 31), (0.605, 61), (0.805, 81)):
            with patch("app.services.ml_prediction.predictions", return_value=(np.array([probability]), np.array([100]))):
                self.assertEqual(self.predictor.predict(self.project).score, expected)

    def test_dataset_and_training_reproducibility(self):
        projects, delays = generate_dataset(800, 47)
        repeated_projects, repeated_delays = generate_dataset(800, 47)
        self.assertEqual(dataset_csv(projects, delays), dataset_csv(repeated_projects, repeated_delays))
        another = Path(self.temp.name) / "repeated"
        repeated_report = train(another, records=800, seed=47, trees=32)
        self.assertEqual(repeated_report.dataset_sha256, self.report.dataset_sha256)
        self.assertEqual(repeated_report.evaluations, self.report.evaluations)
        self.assertEqual(repeated_report.version, self.report.version)
        repeated = MLPredictor(another)
        for project in projects[:10]:
            first, second = self.predictor.predict(project), repeated.predict(project)
            self.assertEqual((first.score, first.delay_days, first.probability), (second.score, second.delay_days, second.probability))
        self.assertEqual(self.predictor.predict(self.project), self.predictor.predict(self.project))

    def test_splits_are_disjoint_and_imputer_uses_only_training_rows(self):
        split = json.loads((self.directory / "splits.json").read_text())
        groups = [set(split[name]) for name in ("train", "validation", "test")]
        self.assertFalse(groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2])
        self.assertEqual(len(set.union(*groups)), 800)
        projects, _ = generate_dataset(800, 47)
        rows = ml_feature_matrix([project for project in projects if project.id in groups[0]])
        expected = np.nanmedian(rows[:, :-1].astype(float), axis=0)
        for pipeline in (self.predictor.classifier, self.predictor.regressor):
            imputer = pipeline.named_steps["preprocessing"].named_transformers_["numeric"]
            np.testing.assert_allclose(imputer.statistics_, expected)
        self.assertNotIn("syntheticDelayDays", ML_FEATURE_NAMES)
        self.assertNotIn("id", ML_FEATURE_NAMES)

    def test_measured_metrics_match_saved_holdout_predictions(self):
        with (self.directory / "holdout-predictions.csv").open() as file:
            rows = [row for row in csv.DictReader(file) if row["split"] == "test" and row["algorithm"] == self.report.algorithm]
        metrics = evaluate(
            np.array([float(row["actualSyntheticDelayDays"]) for row in rows]),
            np.array([float(row["probability"]) for row in rows]),
            np.array([int(row["predictedDelayDays"]) for row in rows]),
        )
        selected = next(row for row in self.report.evaluations if row.algorithm == self.report.algorithm)
        self.assertEqual(metrics, selected.test)
        matrix = self.report.confusion_matrix
        self.assertEqual(sum(matrix.model_dump().values()), len(rows))
        self.assertAlmostEqual(metrics.classification.accuracy, (matrix.true_positive + matrix.true_negative) / len(rows))
        self.assertEqual(selected.validation_selection_loss, min(row.validation_selection_loss for row in self.report.evaluations))
        response = self.client().get("/api/model-performance")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ModelPerformance.model_validate(response.json()), self.report)
        self.assertEqual({row.algorithm for row in self.report.evaluations}, {"Random Forest", "XGBoost"})

    def test_optional_inputs_and_out_of_distribution_warnings(self):
        project = self.project.model_copy(update={"landowners": None, "compensation_budget_cr": None, "approvals_pending": None, "legal_cases": 200000})
        prediction = self.predictor.predict(project)
        self.assertEqual(len(prediction.warnings), 4)
        self.assertIsNone(prediction.feature_values["landowners"])
        self.assertTrue(np.isfinite(prediction.transformed_feature_values["landowners"]))
        self.assertTrue(any("outside" in warning for warning in prediction.warnings))

    def test_prediction_is_input_sensitive_and_identity_is_not_a_feature(self):
        low = self.project.model_copy(update={"acquired_parcels": 1240, "compensation_paid": 100, "legal_cases": 0, "approval_days": 0, "complexity": 1, "approvals_pending": 0})
        high = self.project.model_copy(update={"acquired_parcels": 0, "compensation_paid": 0, "legal_cases": 40, "approval_days": 180, "complexity": 5, "approvals_pending": 8})
        low_result, high_result = self.predictor.predict(low), self.predictor.predict(high)
        self.assertLess(low_result.score, high_result.score)
        self.assertLess(low_result.delay_days, high_result.delay_days)
        self.assertEqual(low_result, self.predictor.predict(low.model_copy(update={"id": "RENAMED", "name": "Renamed", "latitude": 10.0})))

    def test_missing_model_fallback_and_strict_failure(self):
        missing = Path(self.temp.name) / "missing"
        with self.assertRaises(FileNotFoundError):
            MLPredictor(missing)
        with self.assertLogs("landsight.backend", level="WARNING"), TestClient(create_app(Settings(model_directory=missing))) as client:
            self.assertEqual(client.get("/health").json()["predictionMode"], "demo")
            response = client.post("/api/predict", json={"project": self.project.model_dump(by_alias=True, mode="json")})
            self.assertEqual(response.json()["metadata"]["status"], "demo")
            self.assertEqual(response.json()["score"], 93)
            self.assertEqual(client.get("/api/model-performance").status_code, 503)
        with self.assertLogs("landsight.backend", level="WARNING"), TestClient(create_app(Settings(model_directory=missing, prediction_mode="ml"))) as client:
            self.assertFalse(client.get("/health").json()["modelLoaded"])
            self.assertEqual(client.post("/api/predict", json={"project": self.project.model_dump(by_alias=True, mode="json")}).status_code, 503)

    def test_corrupt_artifact_rejected_before_deserialization(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "release"
            shutil.copytree(self.directory, target)
            with (target / "model.joblib").open("ab") as file:
                file.write(b"corruption")
            with patch("app.services.ml_prediction.joblib.load") as deserialize, self.assertRaisesRegex(ValueError, "checksum"):
                MLPredictor(target)
            deserialize.assert_not_called()
            with self.assertLogs("landsight.backend", level="WARNING"), TestClient(create_app(Settings(model_directory=target))) as client:
                self.assertEqual(client.get("/health").json()["predictionMode"], "demo")

    def test_artifact_contract_and_runtime_mismatch_are_rejected(self):
        for field in ("featureSchemaVersion", "runtime"):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp:
                target = Path(temp) / "release"
                shutil.copytree(self.directory, target)
                manifest = json.loads((target / "manifest.json").read_text())
                manifest[field] = "incompatible"
                (target / "manifest.json").write_text(json.dumps(manifest))
                with patch("app.services.ml_prediction.joblib.load") as deserialize, self.assertRaises(ValueError):
                    MLPredictor(target)
                deserialize.assert_not_called()

    def test_artifact_file_checksums(self):
        manifest = json.loads((self.directory / "manifest.json").read_text())
        for name, checksum in manifest["files"].items():
            self.assertEqual(hashlib.sha256((self.directory / name).read_bytes()).hexdigest(), checksum)

    def test_related_routes_work_without_shap(self):
        client = self.client()
        for route in ("/api/projects", "/api/projects/LS-2026-001", "/api/projects/LS-2026-001/risk-analysis", "/api/projects/LS-2026-001/recommendations"):
            response = client.get(route)
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(client.get("/api/projects/LS-2026-001/explanation").json(), [])
        project = client.get("/api/projects/LS-2026-001").json()
        self.assertEqual(project["prediction"]["metadata"]["status"], "trained")
        self.assertIn("not yet available", project["primaryRisk"])

    def test_trained_model_does_not_require_demo_repository(self):
        client = self.client(demo_enabled=False)
        self.assertEqual(client.get("/api/projects").status_code, 503)
        self.assertEqual(client.post("/api/predict", json={"project": self.project.model_dump(by_alias=True, mode="json")}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
