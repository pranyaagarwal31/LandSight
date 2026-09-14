import argparse
import asyncio
import json
import os
from datetime import date
from pathlib import Path

from .schemas.contracts import ProjectInput
from .services.database import Database, PROJECT_QUERY, ProjectRepository
from .services.prediction import js_round

SEED_FILE = Path(__file__).resolve().parents[1] / "data" / "projects.json"


def load_seed() -> tuple[date, list[ProjectInput]]:
    payload = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    if payload["source"] != "Synthetic" or not payload["seeds"]:
        raise ValueError("Expected the bundled nonempty synthetic dataset")
    snapshot = date.fromisoformat(payload["snapshotDate"])
    projects = []
    for index, row in enumerate(payload["seeds"]):
        name, state, district, kind, total, acquired, paid, legal, days, complexity, latitude, longitude = row
        # Keep the existing lib/landsight/data.ts derivations, including JavaScript rounding.
        projects.append(ProjectInput(
            id=f"LS-2026-{index + 1:03d}", name=name, state=state, district=district, type=kind,
            total_parcels=total, acquired_parcels=acquired, compensation_paid=paid,
            legal_cases=legal, approval_days=days, complexity=complexity,
            latitude=latitude, longitude=longitude,
            landowners=int(js_round(total * (1 + complexity * .12))),
            compensation_budget_cr=js_round(total * .38),
            approvals_pending=3 if days > 80 else 2 if days > 30 else 1 if days > 0 else 0,
            clearance_status="Clearances delayed" if days > 60 else "Under review",
            expected_completion=date.fromisoformat(
                "2026-12-31" if index < 8 else "2027-03-31" if index < 16 else "2027-06-30"
            ),
            agency=f"{state} Project Coordination Unit (demo)",
        ))
    return snapshot, projects


async def seed_database(database: Database, expected_project: str, expected_branch: str, expected_database: str) -> int:
    snapshot, projects = load_seed()
    async with database.connection() as connection:
        identity = await connection.fetchrow("""
            SELECT current_setting('neon.project_id', true) AS project,
                   current_setting('neon.branch_id', true) AS branch,
                   current_database() AS database
        """)
    if dict(identity) != {"project": expected_project, "branch": expected_branch, "database": expected_database}:
        raise ValueError("Database identity does not match the explicitly expected target")
    if not await database.ready():
        raise ValueError("Apply the existing 005_persistence.sql migration before seeding")

    async with database.connection() as connection:
        async with connection.transaction():
            await connection.executemany("""
                INSERT INTO landsight_projects
                    (id, name, state, district, type, complexity, landowners, expected_completion,
                     agency, location, source, snapshot_date)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                        ST_SetSRID(ST_MakePoint($10, $11), 4326), 'Synthetic', $12)
                ON CONFLICT (id) DO NOTHING
            """, [(p.id, p.name, p.state, p.district, p.type, p.complexity, p.landowners,
                   p.expected_completion, p.agency, p.longitude, p.latitude, snapshot) for p in projects])
            await connection.executemany("""
                INSERT INTO landsight_acquisition (project_id, total_parcels, acquired_parcels)
                VALUES ($1, $2, $3) ON CONFLICT (project_id) DO NOTHING
            """, [(p.id, p.total_parcels, p.acquired_parcels) for p in projects])
            await connection.executemany("""
                INSERT INTO landsight_compensation (project_id, paid_percent, budget_cr)
                VALUES ($1, $2, $3) ON CONFLICT (project_id) DO NOTHING
            """, [(p.id, p.compensation_paid, p.compensation_budget_cr) for p in projects])
            await connection.executemany("""
                INSERT INTO landsight_legal_cases (project_id, pending_count)
                VALUES ($1, $2) ON CONFLICT (project_id) DO NOTHING
            """, [(p.id, p.legal_cases) for p in projects])
            await connection.executemany("""
                INSERT INTO landsight_approvals (project_id, processing_days, pending_count, clearance_status)
                VALUES ($1, $2, $3, $4) ON CONFLICT (project_id) DO NOTHING
            """, [(p.id, p.approval_days, p.approvals_pending, p.clearance_status) for p in projects])
            stored = {row["id"]: ProjectInput.model_validate(dict(row))
                      for row in await connection.fetch(PROJECT_QUERY, None)}
            if any(stored.get(p.id) != p for p in projects):
                raise ValueError("Conflicting project data found; seed transaction rolled back without overwriting it")
            provenance = await connection.fetch("""
                SELECT id, source, snapshot_date FROM landsight_projects WHERE id = ANY($1::text[])
            """, [p.id for p in projects])
            if len(provenance) != len(projects) or any(
                row["source"] != "Synthetic" or row["snapshot_date"] != snapshot for row in provenance
            ):
                raise ValueError("Conflicting seed provenance; seed transaction rolled back")

    repository = ProjectRepository(database, demo_enabled=False)
    persisted = {p.id: p for p in await repository.list_projects()}
    if repository.data_source != "postgresql" or any(persisted.get(p.id) != p for p in projects):
        raise ValueError("Post-commit database service verification failed")
    return len(projects)


async def main(args: argparse.Namespace):
    database = Database(os.environ.get("DATABASE_URL"))
    try:
        count = await seed_database(database, args.expected_project, args.expected_branch, args.expected_database)
        print(json.dumps({"seededProjects": count, "source": "Synthetic", "dataSource": "postgresql"}))
    finally:
        await database.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the existing migrated LandSight schema from bundled synthetic data.")
    parser.add_argument("--expected-project", required=True, help="Connected Neon project ID")
    parser.add_argument("--expected-branch", required=True, help="Connected Neon branch ID")
    parser.add_argument("--expected-database", required=True, help="Connected PostgreSQL database name")
    args = parser.parse_args()
    try:
        asyncio.run(main(args))
    except Exception as exc:
        # Database exceptions can include connection credentials; never emit their text.
        parser.exit(1, f"Database initialization failed ({type(exc).__name__}); verify target, migration and seed consistency.\n")
