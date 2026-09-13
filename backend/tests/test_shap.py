import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import shap
from fastapi.testclient import TestClient
from pydantic import ValidationError
from scipy.special import expit

from app.core.config import Settings
from app.main import create_app
from app.models.artifacts import DEFAULT_ARTIFACT_DIRECTORY
from app.models.dataset import generate_dataset
from app.models.features import ML_FEATURE_NAMES, NUMERIC_FEATURES, ml_feature_matrix, model_pipeline, raw_feature_values
from app.models.train import candidate_models
from app.schemas.contracts import ShapContribution, ShapExplanation
from app.services.explanation import ShapExplainer, describe_contribution
from app.services.ml_prediction import MLPredictor
from app.services.projects import DemoProjectRepository


class ShapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.predictor = MLPredictor(DEFAULT_ARTIFACT_DIRECTORY)
        cls.project = DemoProjectRepository().list_projects()[0]

    def test_explainer_loads_selected_release_without_retraining(self):
        self.assertIsInstance(self.predictor.explainer.tree, shap.TreeExplainer)
        self.assertIs(self.predictor.explainer.model, self.predictor.classifier.named_steps["model"])
        explanation = self.predictor.predict(self.project).explanation
        self.assertEqual(explanation.status, "available")
        self.assertEqual(explanation.model_version, self.predictor.performance.version)
        self.assertEqual(explanation.algorithm, "XGBoost")
        self.assertEqual(explanation.shap_version, shap.__version__)
        self.assertEqual(explanation.feature_perturbation, "tree_path_dependent")

    def test_prediction_reconstruction_and_same_preprocessing(self):
        prediction = self.predictor.predict(self.project)
        explanation = prediction.explanation
        matrix = self.predictor.classifier.named_steps["preprocessing"].transform(ml_feature_matrix([self.project]))
        actual = self.predictor.explainer.tree(matrix, check_additivity=True)
        self.assertEqual(explanation.output_space, "log_odds")
        np.testing.assert_allclose(list(explanation.transformed_contributions.values()), actual.values[0])
        self.assertAlmostEqual(explanation.base_value, float(actual.base_values[0]))
        self.assertAlmostEqual(explanation.base_value + sum(f.contribution for f in explanation.contributions), explanation.output_value, places=5)
        self.assertAlmostEqual(float(expit(explanation.output_value)), prediction.probability.value, places=6)
        self.assertEqual([f.feature_name for f in explanation.contributions], list(ML_FEATURE_NAMES))
        for f in explanation.contributions:
            self.assertEqual(f.input_value, prediction.feature_values[f.feature_name])
            for name, value in f.transformed_values.items():
                self.assertEqual(value, prediction.transformed_feature_values[name])
        project_type = explanation.contributions[-1]
        self.assertEqual(len(project_type.transformed_values), 6)
        self.assertAlmostEqual(project_type.contribution, sum(value for name, value in explanation.transformed_contributions.items() if name.startswith("type_")), places=6)

    def test_both_phase_two_candidate_families_are_supported(self):
        projects, delays = generate_dataset(800, 52)
        matrix = ml_feature_matrix(projects)
        for algorithm, pair in candidate_models(52, 8).items():
            if algorithm == "Baseline":
                continue
            with self.subTest(algorithm=algorithm):
                classifier = model_pipeline(pair[0]).fit(matrix, (delays > 90).astype(int))
                explainer = ShapExplainer(classifier, "test-only", algorithm)
                row = classifier.named_steps["preprocessing"].transform(matrix[:1])
                probability = float(classifier.predict_proba(matrix[:1])[0, 1])
                explanation = explainer.explain(projects[0], raw_feature_values(projects[0]), row, probability)
                reconstructed = explanation.base_value + sum(f.contribution for f in explanation.contributions)
                if algorithm == "XGBoost":
                    reconstructed = float(expit(reconstructed))
                self.assertAlmostEqual(reconstructed, probability, places=5)
                self.assertEqual(explanation.output_space, "probability" if algorithm == "Random Forest" else "log_odds")

    def test_directions_rankings_relative_importance_and_descriptions(self):
        result = self.predictor.predict(self.project).explanation
        self.assertAlmostEqual(sum(f.relative_importance for f in result.contributions), 1)
        for f in result.contributions:
            self.assertEqual(f.direction, "increases risk" if f.contribution > 0 else "decreases risk" if f.contribution < 0 else "no contribution")
            self.assertIn("relative to the model baseline", f.description)
        self.assertEqual(result.top_risk_factors, sorted((f for f in result.contributions if f.contribution > 0), key=lambda f: -f.contribution)[:3])
        self.assertEqual(result.risk_reducing_factors, sorted((f for f in result.contributions if f.contribution < 0), key=lambda f: f.contribution)[:3])
        low = self.project.model_copy(update={"acquired_parcels": self.project.total_parcels, "compensation_paid": 100, "legal_cases": 0, "approval_days": 0, "complexity": 1, "approvals_pending": 0})
        lower = self.predictor.predict(low).explanation
        self.assertTrue(lower.risk_reducing_factors)
        self.assertNotEqual([f.contribution for f in result.contributions], [f.contribution for f in lower.contributions])
        for contribution, word in ((0.2, "increased"), (-0.2, "reduced"), (0.0, "no contribution")):
            self.assertIn(word, describe_contribution("legalCases", 23, 23, contribution, self.project))
        self.assertIn("25.0% progress", next(f.description for f in result.contributions if f.id == "acquiredParcels"))

    def test_missing_inputs_explain_imputed_values_without_inventing_observations(self):
        project = self.project.model_copy(update={"landowners": None, "compensation_budget_cr": None, "approvals_pending": None})
        prediction = self.predictor.predict(project)
        for factor in prediction.explanation.contributions:
            if factor.id in ("landowners", "compensationBudgetCr", "approvalsPending"):
                self.assertIsNone(factor.input_value)
                self.assertIn("not supplied; training-set median", factor.description)
                self.assertTrue(all(np.isfinite(v) for v in factor.transformed_values.values()))
        self.assertEqual(len(prediction.warnings), 3)

    def test_prediction_and_explanation_apis_and_schema(self):
        with TestClient(create_app()) as client:
            payload = {"project": self.project.model_dump(by_alias=True, mode="json")}
            response = client.post("/api/predict", json=payload)
            self.assertEqual(response.status_code, 200)
            prediction = response.json()
            explanation = prediction["explanation"]
            self.assertEqual(ShapExplanation.model_validate(explanation).status, "available")
            self.assertEqual(client.post("/api/risk-analysis", json=payload).json()["prediction"], prediction)
            self.assertEqual(client.get(f"/api/projects/{self.project.id}/explanation?format=shap").json(), explanation)
            self.assertEqual(client.get(f"/api/projects/{self.project.id}/explanation").json(), prediction["factors"])
            schemas = client.get("/openapi.json").json()["components"]["schemas"]
            self.assertIn("ShapExplanation", schemas)
            self.assertIn("inputValue", schemas["ShapContribution"]["properties"])
            self.assertIn("synthetic", explanation["notice"])
            self.assertEqual(client.get(f"/api/projects/{self.project.id}/explanation?format=invalid").status_code, 422)
            self.assertEqual(client.get("/api/projects/missing/explanation?format=shap").status_code, 404)
            self.assertEqual(client.post("/api/predict", json={"project": {**payload["project"], "legalCases": -1}}).status_code, 422)

    def test_schema_rejects_wrong_sign_nonfinite_and_fake_unavailable_values(self):
        explanation = self.predictor.predict(self.project).explanation
        factor = explanation.top_risk_factors[0].model_dump()
        for update in ({"direction": "decreases risk"}, {"contribution": float("nan")}, {"relative_importance": 2}):
            with self.subTest(update=update), self.assertRaises(ValidationError):
                ShapContribution.model_validate({**factor, **update})
        with self.assertRaises(ValidationError):
            ShapExplanation.model_validate({**explanation.model_dump(), "status": "unavailable", "unavailable_reason": "failed"})

    def test_shap_loading_failure_keeps_trained_model_usable(self):
        with patch("app.services.ml_prediction.ShapExplainer", side_effect=RuntimeError("private failure")), self.assertLogs("landsight.backend", level="WARNING"):
            predictor = MLPredictor(DEFAULT_ARTIFACT_DIRECTORY)
        result = predictor.predict(self.project)
        self.assertEqual(result.score, self.predictor.predict(self.project).score)
        self.assertEqual(result.metadata.status, "trained")
        self.assertEqual(result.metadata.explanation_method, "shap-unavailable")
        self.assertEqual(result.explanation.status, "unavailable")
        self.assertEqual(result.factors, [])
        self.assertNotIn("private failure", result.model_dump_json())

    def test_failed_calculation_and_bad_additivity_never_fabricate_contributions(self):
        count = len(self.predictor.explainer.names)
        cases = [SimpleNamespace(values=np.full((1, count), np.nan), base_values=np.array([0.0])), SimpleNamespace(values=np.zeros((1, count)), base_values=np.array([0.0])), SimpleNamespace(values=np.zeros((1, 2)), base_values=np.array([0.0]))]
        for result in cases:
            with self.subTest(shape=result.values.shape), patch.object(self.predictor.explainer, "tree", return_value=result), self.assertLogs("landsight.backend", level="WARNING"):
                prediction = self.predictor.predict(self.project)
            self.assertEqual(prediction.explanation.status, "unavailable")
            self.assertEqual(prediction.explanation.contributions, [])
            self.assertIsNone(prediction.explanation.base_value)
            self.assertEqual(prediction.factors, [])
            self.assertTrue(prediction.warnings)
        with patch.object(self.predictor.explainer, "explain", side_effect=RuntimeError("private diagnostic")), self.assertLogs("landsight.backend", level="WARNING"):
            result = self.predictor.predict(self.project)
        self.assertNotIn("private diagnostic", result.model_dump_json())

    def test_demo_fallback_does_not_claim_shap(self):
        with TestClient(create_app(Settings(prediction_mode="demo"))) as client:
            self.assertIsNone(client.post("/api/predict", json={"project": self.project.model_dump(by_alias=True, mode="json")}).json()["explanation"])
            response = client.get(f"/api/projects/{self.project.id}/explanation?format=shap")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "SHAP_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
