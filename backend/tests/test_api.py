import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.dependencies import get_predictor
from app.core.config import Settings
from app.main import create_app
from app.models.contracts import FEATURE_NAMES, feature_matrix
from app.schemas.contracts import ProjectInput
from app.services.prediction import DemoPredictor, risk_level
from app.services.projects import DemoProjectRepository


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(Settings())
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.project = DemoProjectRepository().list_projects()[0].model_dump(by_alias=True, mode="json")

    def test_health_and_documented_contracts(self):
        for route in ("/health", "/api/health"):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["predictionMode"], "demo")
            self.assertFalse(response.json()["modelLoaded"])
        schema = self.client.get("/openapi.json").json()
        self.assertIn("/api/predict", schema["paths"])
        self.assertIn("/api/projects/{project_id}/recommendations", schema["paths"])
        properties = schema["components"]["schemas"]["ProjectInput"]["properties"]
        self.assertIn("compensationPaid", properties)
        self.assertNotIn("compensation_paid", properties)
        self.assertIn("ErrorResponse", str(schema["paths"]["/api/predict"]["post"]["responses"]["422"]))

    def test_read_only_project_matches_existing_frontend_seed(self):
        response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 200)
        projects = response.json()
        self.assertEqual(len(projects), 1)
        project = projects[0]
        self.assertEqual(project["id"], "LS-2026-001")
        self.assertEqual(project["pendingParcels"], 930)
        self.assertEqual(project["riskScore"], 93)
        self.assertEqual(project["expectedDelay"], 101)
        self.assertEqual(project["riskLevel"], "CRITICAL")
        self.assertEqual(project["source"], "Synthetic")
        self.assertEqual(len(project["stages"]), 7)
        self.assertEqual(self.client.get("/api/projects/LS-2026-001").json(), project)
        self.assertEqual(self.client.post("/api/projects", json=self.project).status_code, 405)
        self.assertEqual(self.client.get("/api/projects/LS-2026-002").json()["error"]["code"], "PROJECT_NOT_FOUND")

    def test_prediction_analysis_explanation_and_recommendations_agree(self):
        payload = {"project": self.project}
        response = self.client.post("/api/predict", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        prediction = response.json()
        self.assertEqual(prediction["score"], 93)
        self.assertEqual(prediction["delayDays"], 101)
        self.assertEqual([factor["contribution"] for factor in prediction["factors"]], [21.6, 25, 18.3, 10, 13.5, -3])
        self.assertTrue(prediction["isDemo"])
        self.assertIsNone(prediction["confidence"])
        self.assertIsNone(prediction["metadata"]["trainedAt"])
        self.assertEqual(prediction["metadata"]["explanationMethod"], "rule-contributions-not-shap")
        analysis = self.client.post("/api/risk-analysis", json=payload).json()
        self.assertEqual(analysis["prediction"], prediction)
        self.assertEqual(self.client.get("/api/projects/LS-2026-001/risk-analysis").json(), analysis)
        self.assertEqual(self.client.get("/api/projects/LS-2026-001/explanation").json(), prediction["factors"])
        for response in (
            self.client.get("/api/projects/LS-2026-001/recommendations"),
            self.client.post("/api/recommendations", json=payload),
        ):
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), analysis["recommendations"])
            self.assertTrue(all(row["projectId"] == self.project["id"] and row["isDemo"] for row in response.json()))

    def test_predict_accepts_new_projects_without_persisting(self):
        project = {**self.project, "id": "LS-INPUT-001", "acquiredParcels": 1240,
                   "compensationPaid": 100, "legalCases": 0, "approvalDays": 0, "complexity": 1}
        response = self.client.post("/api/predict", json={"project": project})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 0)
        self.assertEqual(response.json()["delayDays"], 0)
        self.assertEqual(self.client.get("/api/projects/LS-INPUT-001").status_code, 404)
        self.assertEqual(self.client.get("/api/projects/LS-2026-001").json()["acquiredParcels"], 310)

    def test_invalid_project_inputs_return_safe_422(self):
        invalid_values = [
            ("totalParcels", 0), ("acquiredParcels", 1241), ("acquiredParcels", -1),
            ("compensationPaid", 101), ("compensationPaid", True), ("legalCases", -1),
            ("legalCases", 1.5), ("legalCases", True), ("legalCases", "3"),
            ("approvalDays", 181), ("complexity", 0), ("complexity", 6),
            ("latitude", 91), ("longitude", -181), ("type", "Unknown"),
            ("name", "   "), ("id", "../secret"), ("pendingParcels", 1),
            ("progress", 99), ("expectedCompletion", "not-a-date"),
            ("approvalsPending", -1), ("compensationBudgetCr", -1), ("extraField", 1),
        ]
        for field, value in invalid_values:
            with self.subTest(field=field, value=value):
                response = self.client.post("/api/predict", json={"project": {**self.project, field: value}})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")
                self.assertTrue(response.json()["error"]["details"])
                self.assertNotIn('"input":', response.text)
                self.assertNotIn('"ctx":', response.text)
        for value in (float("nan"), float("inf"), -float("inf")):
            with self.assertRaises(ValidationError):
                ProjectInput.model_validate({**self.project, "compensationPaid": value})
        self.assertEqual(self.client.post("/api/predict", json={}).status_code, 422)
        self.assertEqual(self.client.post("/api/predict", content='{"project":', headers={"Content-Type": "application/json"}).status_code, 422)

    def test_cors_allowlist_and_security_headers(self):
        allowed = self.client.options("/api/predict", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        })
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers["access-control-allow-origin"], "http://localhost:3000")
        denied = self.client.options("/api/predict", headers={
            "Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST",
        })
        self.assertEqual(denied.status_code, 400)
        self.assertNotIn("access-control-allow-origin", denied.headers)
        health = self.client.get("/health")
        self.assertEqual(health.headers["x-content-type-options"], "nosniff")
        self.assertEqual(self.client.get("/api/projects").headers["x-landsight-mode"], "demo")

    def test_disabled_demo_and_docs(self):
        with TestClient(create_app(Settings(demo_enabled=False, docs_enabled=False))) as client:
            self.assertEqual(client.get("/health").json()["predictionMode"], "unavailable")
            for route in ("/docs", "/redoc", "/openapi.json"):
                self.assertEqual(client.get(route).status_code, 404)
            self.assertEqual(client.get("/api/projects").status_code, 503)
            response = client.post("/api/predict", json={"project": self.project})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "MODEL_UNAVAILABLE")

    def test_configuration_rejects_unsafe_origins(self):
        for origin in ("*", "https://*.example.com", "null", "https://example.com/path", "https://user:pass@example.com", "https://example.com:bad"):
            with self.subTest(origin=origin), self.assertRaises(ValidationError):
                Settings(cors_origins=(origin,))
        with patch.dict("os.environ", {"LANDSIGHT_CORS_ORIGINS": "https://landsight.example", "LANDSIGHT_DEMO_ENABLED": "false"}):
            settings = Settings.from_env()
            self.assertEqual(settings.cors_origins, ("https://landsight.example",))
            self.assertFalse(settings.demo_enabled)

    def test_unexpected_errors_are_sanitized_and_keep_cors(self):
        class BrokenPredictor:
            def predict(self, _project):
                raise RuntimeError("private diagnostic information")

        self.app.app.dependency_overrides[get_predictor] = lambda: BrokenPredictor()
        with self.assertLogs("landsight.backend", level="ERROR"):
            with TestClient(self.app, raise_server_exceptions=False) as client:
                response = client.post("/api/predict", json={"project": self.project}, headers={"Origin": "http://localhost:3000"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"]["code"], "INTERNAL_ERROR")
        self.assertNotIn("private diagnostic", response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_feature_contract_and_thresholds(self):
        project = ProjectInput.model_validate(self.project)
        self.assertEqual(len(FEATURE_NAMES), 6)
        self.assertEqual(feature_matrix([project]), [[1240.0, 310.0, 28.0, 23.0, 110.0, 5.0]])
        self.assertEqual(feature_matrix([]), [])
        for score, expected in ((0, "LOW"), (30, "LOW"), (31, "MEDIUM"), (60, "MEDIUM"), (61, "HIGH"), (80, "HIGH"), (81, "CRITICAL"), (100, "CRITICAL")):
            self.assertEqual(risk_level(score), expected)
        self.assertEqual(DemoPredictor().predict(project), DemoPredictor().predict(project))


if __name__ == "__main__":
    unittest.main()
