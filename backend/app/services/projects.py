from ..schemas.contracts import ProjectInformation, ProjectInput, ProjectStage, RiskPrediction
from .prediction import js_round, risk_level

import json
from pathlib import Path

SEED_PATH = Path(__file__).resolve().parents[2] / "data" / "projects.json"


def bundled_projects() -> list[ProjectInput]:
    seeds = json.loads(SEED_PATH.read_text())["seeds"]
    projects = []
    for index, row in enumerate(seeds):
        name, state, district, kind, total, acquired, paid, cases, days, complexity, latitude, longitude = row
        projects.append(ProjectInput(
            id=f"LS-2026-{index + 1:03d}", name=name, state=state, district=district, type=kind,
            total_parcels=total, acquired_parcels=acquired, compensation_paid=paid,
            legal_cases=cases, approval_days=days, complexity=complexity,
            latitude=latitude, longitude=longitude,
            landowners=int(js_round(total * (1 + complexity * 0.12))),
            compensation_budget_cr=js_round(total * 0.38),
            approvals_pending=3 if days > 80 else 2 if days > 30 else 1 if days > 0 else 0,
            clearance_status="Clearances delayed" if days > 60 else "Under review",
            expected_completion="2026-12-31" if index < 8 else "2027-03-31" if index < 16 else "2027-06-30",
            agency=f"{state} Project Coordination Unit (demo)",
        ))
    return projects


class DemoProjectRepository:
    def list_projects(self) -> list[ProjectInput]:
        return bundled_projects()

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
