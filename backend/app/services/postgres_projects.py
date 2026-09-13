import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg

from ..core.errors import APIError
from ..schemas.contracts import ProjectInput, RiskPrediction
from .prediction import js_round

PROJECT_COLUMNS = """id, name, state, district, type, total_parcels, acquired_parcels,
    compensation_paid, legal_cases, approval_days, complexity, landowners,
    compensation_budget_cr, approvals_pending, clearance_status, expected_completion, agency,
    ST_Y(location) AS latitude, ST_X(location) AS longitude"""
LIST_SQL = "SELECT " + PROJECT_COLUMNS + " FROM landsight_projects WHERE source = 'Synthetic' ORDER BY id"
GET_SQL = "SELECT " + PROJECT_COLUMNS + " FROM landsight_projects WHERE source = 'Synthetic' AND id = $1"
SEED_SQL = """INSERT INTO landsight_projects (
    id, name, state, district, type, total_parcels, acquired_parcels,
    compensation_paid, legal_cases, approval_days, complexity, landowners,
    compensation_budget_cr, approvals_pending, clearance_status, expected_completion, agency, location
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
    ST_SetSRID(ST_MakePoint($18,$19),4326)) ON CONFLICT (id) DO NOTHING"""
PREDICTION_SQL = """INSERT INTO landsight_predictions (project_id, model_version, input_snapshot, prediction)
    SELECT $1, $2, $3::jsonb, $4::jsonb
    WHERE EXISTS (SELECT 1 FROM landsight_projects WHERE id = $1 AND source = 'Synthetic')
    ON CONFLICT (project_id, model_version) DO UPDATE
    SET input_snapshot = EXCLUDED.input_snapshot, prediction = EXCLUDED.prediction, updated_at = now()
    WHERE landsight_predictions.input_snapshot IS DISTINCT FROM EXCLUDED.input_snapshot
       OR landsight_predictions.prediction IS DISTINCT FROM EXCLUDED.prediction"""


def synthetic_projects() -> list[ProjectInput]:
    fixture = json.loads(Path(__file__).with_name("synthetic_projects.json").read_text(encoding="utf-8"))
    if fixture["source"] != "Synthetic":
        raise ValueError("Only the existing synthetic prototype dataset may be seeded")
    fields = ("name", "state", "district", "type", "total_parcels", "acquired_parcels", "compensation_paid",
              "legal_cases", "approval_days", "complexity", "latitude", "longitude")
    projects = []
    for index, seed in enumerate(fixture["seeds"]):
        values = dict(zip(fields, seed, strict=True))
        total, complexity, days = values["total_parcels"], values["complexity"], values["approval_days"]
        values.update(
            id=f"LS-2026-{index + 1:03d}",
            landowners=int(js_round(total * (1 + complexity * .12))), compensation_budget_cr=js_round(total * .38),
            approvals_pending=3 if days > 80 else 2 if days > 30 else 1 if days > 0 else 0,
            clearance_status="Clearances delayed" if days > 60 else "Under review",
            expected_completion="2026-12-31" if index < 8 else "2027-03-31" if index < 16 else "2027-06-30",
            agency=f"{values['state']} Project Coordination Unit (demo)",
        )
        projects.append(ProjectInput.model_validate(values))
    return projects


async def seed_projects(pool: asyncpg.Pool) -> None:
    rows = [(
        p.id, p.name, p.state, p.district, p.type, p.total_parcels, p.acquired_parcels,
        p.compensation_paid, p.legal_cases, p.approval_days, p.complexity, p.landowners,
        p.compensation_budget_cr, p.approvals_pending, p.clearance_status, p.expected_completion,
        p.agency, p.longitude, p.latitude,
    ) for p in synthetic_projects()]
    async with pool.acquire() as connection, connection.transaction():
        await connection.executemany(SEED_SQL, rows)


class PostgresProjectRepository:
    storage_mode = "postgres"

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    @asynccontextmanager
    async def connection(self):
        try:
            async with self.pool.acquire() as connection:
                yield connection
        except (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError) as exc:
            logging.getLogger("landsight.backend").warning("Project database unavailable (%s)", type(exc).__name__)
            raise APIError(503, "DATABASE_UNAVAILABLE", "Persisted project data is unavailable; check the database connection and migrations.") from None

    async def list_projects(self) -> list[ProjectInput]:
        async with self.connection() as connection:
            return [ProjectInput.model_validate(dict(row)) for row in await connection.fetch(LIST_SQL)]

    async def get_project(self, project_id: str) -> ProjectInput | None:
        async with self.connection() as connection:
            row = await connection.fetchrow(GET_SQL, project_id)
            return ProjectInput.model_validate(dict(row)) if row is not None else None

    async def save_predictions(self, predictions: list[tuple[ProjectInput, RiskPrediction]]) -> None:
        rows = [(p.id, result.metadata.version, p.model_dump_json(), result.model_dump_json(by_alias=True))
                for p, result in predictions]
        async with self.connection() as connection, connection.transaction():
            await connection.executemany(PREDICTION_SQL, rows)

    async def check(self) -> None:
        async with self.connection() as connection:
            await connection.fetchval("SELECT ST_SRID(location) FROM landsight_projects LIMIT 1")
            await connection.fetchval("SELECT count(*) FROM landsight_predictions")
