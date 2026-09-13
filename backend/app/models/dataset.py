import csv
import hashlib
import io

import numpy as np

from ..schemas.contracts import ProjectInput

SEED = 20260914
DATASET_VERSION = "landsight-synthetic-v2"
DELAY_THRESHOLD_DAYS = 90
PROJECT_TYPES = ("Highway", "Railway", "Irrigation", "Power", "Industrial", "Road infrastructure")
SYNTHETIC_NOTICE = (
    "Prototype trained and evaluated exclusively on generated synthetic data, not government records. "
    "Metrics measure this simulator only and do not establish real-world accuracy or deployment readiness."
)


def generate_dataset(records: int = 6000, seed: int = SEED) -> tuple[list[ProjectInput], np.ndarray]:
    """Simulated acquisition snapshots with noisy future delay outcomes; not observed projects."""
    if records < 200:
        raise ValueError("At least 200 records are required for stratified evaluation")
    rng = np.random.default_rng(seed)
    projects, delays = [], []
    for index in range(records):
        total = int(rng.integers(80, 5001))
        progress = float(rng.beta(1.6, 1.6))
        acquired = int(round(total * progress))
        compensation = round(float(np.clip(progress * 75 + rng.normal(15, 22), 0, 100)), 2)
        legal = int(min(80, rng.poisson(2 + (1 - progress) * 15)))
        approval = int(rng.integers(0, 181))
        complexity = int(rng.integers(1, 6))
        project_type = str(rng.choice(PROJECT_TYPES))
        landowners = int(total * rng.uniform(1, 2.8))
        budget = round(float(total * rng.uniform(0.08, 0.9)), 2)
        pending_approvals = int(rng.integers(0, 9))
        remaining = 1 - acquired / total
        unpaid = 1 - compensation / 100
        type_effect = {"Highway": 4, "Railway": 9, "Irrigation": 12, "Power": 7, "Industrial": 11, "Road infrastructure": 0}[project_type]
        # These are explicit simulator assumptions, not the frontend rule score or learned coefficients.
        mean_delay = (
            3 + 44 * remaining ** 1.3 + 32 * unpaid ** 1.5 + 0.26 * approval
            + 1.35 * legal + 2.5 * (complexity - 1) + type_effect
            + 2.2 * pending_approvals + 3 * (landowners / total - 1)
            + 4 * np.log1p(total / 1000) + 3 * budget / total
            + 20 * unpaid * min(legal / 20, 1) + 12 * remaining * approval / 180
        )
        noise = rng.normal(0, 10 + 9 * remaining)
        disruption = rng.binomial(1, 0.09) * rng.gamma(2, 11)
        delays.append(int(round(max(0, mean_delay + noise + disruption))))
        projects.append(ProjectInput(
            id=f"SYN-{index + 1:06d}", name=f"Synthetic acquisition {index + 1}",
            state="Synthetic region", district="Synthetic district", type=project_type,
            total_parcels=total, acquired_parcels=acquired, compensation_paid=compensation,
            legal_cases=legal, approval_days=approval, complexity=complexity,
            latitude=0.0, longitude=0.0,
            landowners=landowners if rng.random() > 0.12 else None,
            compensation_budget_cr=budget if rng.random() > 0.12 else None,
            approvals_pending=pending_approvals if rng.random() > 0.12 else None,
        ))
    return projects, np.asarray(delays, dtype=float)


def dataset_csv(projects: list[ProjectInput], delays: np.ndarray) -> str:
    output = io.StringIO(newline="")
    fields = list(projects[0].model_dump(by_alias=True)) + ["syntheticDelayDays", "syntheticDelayedOver90Days", "source"]
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for project, delay in zip(projects, delays, strict=True):
        writer.writerow({
            **project.model_dump(by_alias=True, mode="json"),
            "syntheticDelayDays": int(delay),
            "syntheticDelayedOver90Days": int(delay > DELAY_THRESHOLD_DAYS),
            "source": "Synthetic — simulated, not government data",
        })
    return output.getvalue()


def dataset_sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
