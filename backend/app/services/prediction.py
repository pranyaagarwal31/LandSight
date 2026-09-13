from math import floor

from ..models.contracts import FEATURE_SCHEMA_VERSION
from ..schemas.contracts import ModelMetadata, ProjectInput, RiskFactor, RiskLevel, RiskPrediction


def js_round(value: float, digits: int = 0) -> float:
    # Preserve the prototype's Math.round behavior, including negative half-values.
    scale = 10 ** digits
    return floor(value * scale + 0.5) / scale


def risk_level(score: float) -> RiskLevel:
    if score <= 30:
        return "LOW"
    if score <= 60:
        return "MEDIUM"
    if score <= 80:
        return "HIGH"
    return "CRITICAL"


class DemoPredictor:
    """Temporary port of lib/landsight/risk.ts; not a trained predictive model."""

    def predict(self, project: ProjectInput) -> RiskPrediction:
        progress = project.acquired_parcels / project.total_parcels
        outstanding = 100 - project.compensation_paid
        rows = [
            ("compensation", "Compensation disputes", outstanding * 0.3,
             f"{outstanding:g}% of compensation is outstanding; this does not establish a dispute count."),
            ("legal", "Pending legal cases", min(project.legal_cases / 20, 1) * 25,
             f"{project.legal_cases} unresolved legal cases affect possession."),
            ("approval", "Approval delays", min(project.approval_days / 120, 1) * 20,
             f"{project.approval_days} days estimated for pending clearances."),
            ("complexity", "Land parcel complexity", project.complexity * 2,
             f"Fragmentation index {project.complexity}/5; supplied project-level complexity."),
            ("pending", "Pending land parcels", (1 - progress) * 18,
             f"{project.total_parcels - project.acquired_parcels} of {project.total_parcels} parcels remain to be acquired."),
            ("progress", "Acquisition progress", -progress * 12,
             f"{js_round(progress * 100):g}% acquired; completed acquisition reduces demo risk."),
        ]
        factors = [
            RiskFactor(id=id, name=name, contribution=js_round(value, 1), description=description)
            for id, name, value, description in rows
        ]
        score = int(js_round(max(0, min(100, 8 + sum(f.contribution for f in factors)))))
        return RiskPrediction(
            score=score,
            level=risk_level(score),
            delay_days=int(js_round(score * 0.72 + project.approval_days * 0.18 + project.legal_cases * 0.6)),
            confidence=None,
            factors=factors,
            model="LS-DEMO-1.0",
            is_demo=True,
            metadata=ModelMetadata(version="LS-DEMO-1.0", feature_schema_version=FEATURE_SCHEMA_VERSION),
        )
