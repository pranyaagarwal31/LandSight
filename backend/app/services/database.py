import asyncio
import json
import logging
from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg
from pydantic import ValidationError

from ..core.errors import APIError
from ..schemas.contracts import ProjectInput, RiskPrediction
from .projects import DemoProjectRepository

logger = logging.getLogger("landsight.backend")
DATABASE_ERRORS = (asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError, ValueError)
DATABASE_NOTICE = "PostgreSQL / PostGIS — persisted synthetic data, not government records."
FALLBACK_NOTICE = "Demo fallback — PostgreSQL is unavailable or unconfigured. Showing the bundled synthetic dataset."

PROJECT_QUERY = """
SELECT p.id, p.name, p.state, p.district, p.type, p.complexity, p.landowners,
       p.expected_completion, p.agency, ST_Y(p.location) AS latitude, ST_X(p.location) AS longitude,
       a.total_parcels, a.acquired_parcels, c.paid_percent AS compensation_paid,
       c.budget_cr AS compensation_budget_cr, l.pending_count AS legal_cases,
       v.processing_days AS approval_days, v.pending_count AS approvals_pending, v.clearance_status
FROM landsight_projects p
LEFT JOIN landsight_acquisition a ON a.project_id = p.id
LEFT JOIN landsight_compensation c ON c.project_id = p.id
LEFT JOIN landsight_legal_cases l ON l.project_id = p.id
LEFT JOIN landsight_approvals v ON v.project_id = p.id
WHERE ($1::text IS NULL OR p.id = $1)
ORDER BY p.id
"""


class Database:
    def __init__(self, url: str | None):
        self._url = url
        self._pool: asyncpg.Pool | None = None
        self._lock = asyncio.Lock()

    async def pool(self) -> asyncpg.Pool:
        if not self._url:
            raise ValueError("Database not configured")
        async with self._lock:
            if self._pool is None:
                parts = urlsplit(self._url)
                if parts.scheme not in {"postgres", "postgresql"}:
                    raise ValueError("Invalid database URL")
                # asyncpg supports sslmode, but not libpq's channel_binding query option.
                query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if k != "channel_binding"])
                dsn = urlunsplit(parts._replace(query=query))
                self._pool = await asyncpg.create_pool(
                    dsn=dsn, min_size=0, max_size=5, timeout=3, command_timeout=3,
                    server_settings={"application_name": "landsight", "statement_timeout": "3000"},
                )
            return self._pool

    @asynccontextmanager
    async def connection(self):
        pool = await self.pool()
        async with pool.acquire(timeout=3) as connection:
            yield connection

    async def close(self):
        if self._pool is not None:
            try:
                await asyncio.wait_for(self._pool.close(), timeout=5)
            except TimeoutError:
                self._pool.terminate()
            finally:
                self._pool = None

    async def ready(self) -> bool:
        try:
            async with self.connection() as connection:
                return bool(await connection.fetchval(
                    "SELECT PostGIS_Version() FROM landsight_schema_migrations WHERE version = 5"
                ))
        except DATABASE_ERRORS:
            return False


class PostgresProjectRepository:
    def __init__(self, database: Database):
        self.database = database

    async def list_projects(self, project_id: str | None = None) -> list[ProjectInput]:
        async with self.database.connection() as connection:
            rows = await connection.fetch(PROJECT_QUERY, project_id)
        return [ProjectInput.model_validate(dict(row)) for row in rows]

    async def save_predictions(self, pairs: list[tuple[ProjectInput, RiskPrediction]]):
        if not pairs:
            return
        values = [(p.id, r.model, p.model_dump_json(by_alias=True), r.model_dump_json(by_alias=True)) for p, r in pairs]
        async with self.database.connection() as connection:
            await connection.executemany("""
                INSERT INTO landsight_predictions (project_id, model_version, input_snapshot, prediction)
                VALUES ($1, $2, $3::jsonb, $4::jsonb)
                ON CONFLICT (project_id, model_version) DO UPDATE
                SET input_snapshot = EXCLUDED.input_snapshot, prediction = EXCLUDED.prediction, generated_at = now()
                WHERE landsight_predictions.input_snapshot IS DISTINCT FROM EXCLUDED.input_snapshot
                   OR landsight_predictions.prediction IS DISTINCT FROM EXCLUDED.prediction
            """, values)


class ProjectRepository:
    """Request-scoped provenance avoids sharing fallback state across concurrent requests."""

    def __init__(self, database: Database, demo_enabled: bool):
        self.postgres = PostgresProjectRepository(database)
        self.demo_enabled = demo_enabled
        self.data_source = "unavailable"
        self.data_notice = FALLBACK_NOTICE

    async def list_projects(self, project_id: str | None = None) -> list[ProjectInput]:
        try:
            projects = await self.postgres.list_projects(project_id)
            self.data_source, self.data_notice = "postgresql", DATABASE_NOTICE
            return projects
        except ValidationError:
            # ValidationError is a ValueError, but invalid persisted data is not an outage.
            raise
        except DATABASE_ERRORS as exc:
            logger.warning("Project database unavailable (%s).", type(exc).__name__)
            if not self.demo_enabled:
                raise APIError(503, "PROJECT_SOURCE_UNAVAILABLE", "Project database unavailable; demo fallback is disabled.") from None
            self.data_source, self.data_notice = "demo-fallback", FALLBACK_NOTICE
            projects = DemoProjectRepository().list_projects()
            return [p for p in projects if project_id is None or p.id == project_id]

    async def get_project(self, project_id: str) -> ProjectInput | None:
        projects = await self.list_projects(project_id)
        return projects[0] if projects else None

    async def save_predictions(self, pairs: list[tuple[ProjectInput, RiskPrediction]]) -> bool:
        if self.data_source != "postgresql":
            return False
        try:
            await self.postgres.save_predictions(pairs)
            return True
        except DATABASE_ERRORS as exc:
            logger.warning("Prediction persistence unavailable (%s); computed results retained.", type(exc).__name__)
            return False
