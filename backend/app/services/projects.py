from ..schemas.contracts import ProjectInformation, ProjectInput, ProjectStage, RiskPrediction
from .prediction import js_round, risk_level

# Only the first existing frontend seed is exposed; this is not a project database.
_DEMO_PROJECT = {
    "id": "LS-2026-001",
    "name": "Eastern Freight Corridor — Patna",
    "state": "Bihar",
    "district": "Patna",
    "type": "Railway",
    "totalParcels": 1240,
    "acquiredParcels": 310,
    "compensationPaid": 28,
    "legalCases": 23,
    "approvalDays": 110,
    "complexity": 5,
    "latitude": 25.5941,
    "longitude": 85.1376,
    "landowners": 1984,
    "compensationBudgetCr": 471,
    "approvalsPending": 3,
    "clearanceStatus": "Clearances delayed",
    "expectedCompletion": "2026-12-31",
    "agency": "Bihar Project Coordination Unit (demo)",
}


class DemoProjectRepository:
    def list_projects(self) -> list[ProjectInput]:
        return [ProjectInput.model_validate(_DEMO_PROJECT)]

    def get_project(self, project_id: str) -> ProjectInput | None:
        return next((p for p in self.list_projects() if p.id == project_id), None)


def project_information(project: ProjectInput, prediction: RiskPrediction) -> ProjectInformation:
    progress = js_round(project.acquired_parcels / project.total_parcels * 100)
    rows = [
        ("Land identification", 100, 0),
        ("Notification", min(100, progress + 45), 5),
        ("Valuation", min(100, project.compensation_paid + 20), 12),
        ("Compensation", project.compensation_paid, int(js_round((100 - project.compensation_paid) * 0.6))),
        ("Possession", progress, int(js_round((100 - progress) * 0.4))),
        ("Legal resolution", max(0, 100 - project.legal_cases * 4), project.legal_cases * 2),
        ("Final acquisition", progress, int(js_round(project.approval_days * 0.3))),
    ]
    stages = [
        ProjectStage(
            name=name,
            completion=completion,
            delay_days=0 if completion == 100 else delay,
            risk=risk_level(10 if completion == 100 else min(100, 100 - completion + delay / 2)),
            status="Complete" if completion == 100 else "Not started" if completion == 0 else "Needs attention" if completion < 45 else "In progress",
        )
        for name, completion, delay in rows
    ]
    primary_risk = max(prediction.factors, key=lambda factor: factor.contribution).name if prediction.factors else "Per-project ML explanation unavailable"
    if prediction.explanation is not None:
        explanation = prediction.explanation
        primary_risk = (explanation.top_risk_factors[0].name if explanation.top_risk_factors else "No risk-increasing factors relative to the model baseline") if explanation.status == "available" else "Per-project ML explanation unavailable"
    values = project.model_dump()
    values.update(
        pending_parcels=project.total_parcels - project.acquired_parcels,
        progress=progress,
        risk_score=prediction.score,
        expected_delay=prediction.delay_days,
        risk_level=prediction.level,
        risk_change=8 if prediction.score > 80 else 4 if prediction.score > 60 else -5,
        primary_risk=primary_risk,
        status="Delayed" if prediction.score > 80 else "At risk" if prediction.score > 60 else "On track",
        prediction=prediction,
        stages=stages,
    )
    return ProjectInformation.model_validate(values)
