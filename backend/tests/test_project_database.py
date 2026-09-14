import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import asyncpg
from fastapi.testclient import TestClient

from app.api.dependencies import get_persisted_project_repository
from app.core.config import Settings
from app.main import create_app
from app.schemas.contracts import ProjectInformation, ProjectInput
from app.services.database import Database, PROJECT_QUERY, PostgresProjectRepository, ProjectRepository
from app.services.prediction import DemoPredictor
from app.services.projects import DemoProjectRepository, project_information


class ProjectDatabaseAPITests(unittest.TestCase):
    def setUp(self):
        self.demo = DemoProjectRepository().list_projects()[0]
        self.rows = [
            {**self.demo.model_dump(exclude={"pending_parcels", "progress"}),
             "name": "Database project with updated acquisition", "acquired_parcels": 900},
            {**self.demo.model_dump(exclude={"pending_parcels", "progress"}),
             "id": "LS-DB-002", "name": "Second database project", "compensation_paid": 80.0},
        ]
        self.connection = SimpleNamespace(fetch=AsyncMock(side_effect=self.fetch), executemany=AsyncMock())
        self.app = create_app(Settings(prediction_mode="demo"))

        @asynccontextmanager
        async def connection():
            yield self.connection

        self.enterContext(patch.object(self.app.app.state.database, "connection", connection))
        self.client = self.enterContext(TestClient(self.app))

    async def fetch(self, query, project_id):
        self.assertEqual(query, PROJECT_QUERY)
        return [row for row in self.rows if project_id is None or row["id"] == project_id]

    def expected(self, row):
        project = ProjectInput.model_validate(row)
        return project_information(project, DemoPredictor().predict(project)).model_dump(by_alias=True, mode="json")

    def test_list_reads_database_rows_and_preserves_full_contract(self):
        with patch.object(DemoProjectRepository, "list_projects", side_effect=AssertionError("Unexpected demo fallback")):
            response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), [self.expected(row) for row in self.rows])
        self.connection.fetch.assert_awaited_once_with(PROJECT_QUERY, None)
        self.connection.executemany.assert_not_awaited()
        for project in response.json():
            ProjectInformation.model_validate(project)

    def test_detail_returns_database_record_not_matching_demo_id(self):
        for row in self.rows:
            with self.subTest(project_id=row["id"]):
                response = self.client.get(f"/api/projects/{row['id']}")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), self.expected(row))
                self.connection.fetch.assert_awaited_with(PROJECT_QUERY, row["id"])
        self.connection.executemany.assert_not_awaited()

    def test_database_changes_are_read_on_next_request(self):
        self.client.get("/api/projects")
        self.rows[0]["name"] = "Changed in database"
        self.rows[0]["acquired_parcels"] = 1000
        response = self.client.get(f"/api/projects/{self.rows[0]['id']}")
        self.assertEqual(response.json(), self.expected(self.rows[0]))

    def test_missing_database_project_does_not_fall_back_to_demo(self):
        self.rows = self.rows[1:]
        with patch.object(DemoProjectRepository, "list_projects", side_effect=AssertionError("Unexpected demo fallback")):
            response = self.client.get(f"/api/projects/{self.demo.id}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found.", "details": []}})

    def test_empty_database_returns_empty_list_without_demo_fallback(self):
        self.rows = []
        with patch.object(DemoProjectRepository, "list_projects", side_effect=AssertionError("Unexpected demo fallback")):
            response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_invalid_ids_are_rejected_before_querying(self):
        for project_id in ("invalid%27%20OR%201%3D1", "invalid.id", "x" * 129):
            with self.subTest(project_id=project_id):
                response = self.client.get(f"/api/projects/{project_id}")
                self.assertEqual(response.status_code, 422, response.text)
        self.connection.fetch.assert_not_awaited()

    def test_database_errors_preserve_demo_fallback_and_missing_id(self):
        errors = (
            ConnectionRefusedError("private connection details"), TimeoutError("private timeout"),
            asyncpg.CannotConnectNowError("private server details"),
            asyncpg.InterfaceError("private connection state"),
            asyncpg.UndefinedTableError("private schema details"),
        )
        expected = project_information(self.demo, DemoPredictor().predict(self.demo)).model_dump(by_alias=True, mode="json")
        for error in errors:
            with self.subTest(error=type(error).__name__):
                self.connection.fetch.side_effect = error
                with self.assertLogs("landsight.backend", level="WARNING") as logs:
                    listing = self.client.get("/api/projects")
                    detail = self.client.get(f"/api/projects/{self.demo.id}")
                    missing = self.client.get("/api/projects/NOT-FOUND")
                self.assertEqual(listing.status_code, 200)
                self.assertEqual(listing.json(), [expected])
                self.assertEqual(detail.status_code, 200)
                self.assertEqual(detail.json(), expected)
                self.assertEqual(missing.status_code, 404)
                self.assertNotIn("private", " ".join(logs.output) + listing.text + detail.text + missing.text)
        self.connection.executemany.assert_not_awaited()

    def test_recovers_after_temporary_outage(self):
        self.connection.fetch.side_effect = ConnectionRefusedError()
        with self.assertLogs("landsight.backend", level="WARNING"):
            self.assertEqual(len(self.client.get("/api/projects").json()), 1)
        self.connection.fetch.side_effect = self.fetch
        response = self.client.get("/api/projects")
        self.assertEqual(response.json(), [self.expected(row) for row in self.rows])

    def test_disabled_fallback_still_allows_database_reads(self):
        self.app.app.state.settings = self.app.app.state.settings.model_copy(update={"demo_enabled": False})
        for path in ("/api/projects", f"/api/projects/{self.rows[1]['id']}"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, response.text)
        self.connection.fetch.side_effect = ConnectionRefusedError("private connection details")
        for path in ("/api/projects", f"/api/projects/{self.demo.id}"):
            with self.assertLogs("landsight.backend", level="WARNING"):
                response = self.client.get(path)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "PROJECT_SOURCE_UNAVAILABLE")
            self.assertNotIn("private", response.text)

    def test_unrelated_project_routes_keep_existing_demo_source(self):
        for suffix in ("risk-analysis", "explanation", "recommendations"):
            self.assertEqual(self.client.get(f"/api/projects/{self.demo.id}/{suffix}").status_code, 200)
            self.assertEqual(self.client.get(f"/api/projects/{self.rows[1]['id']}/{suffix}").status_code, 404)
        self.connection.fetch.assert_not_awaited()

    def test_unexpected_programming_errors_are_not_demo_fallback(self):
        self.connection.fetch.side_effect = RuntimeError("private programming error")
        with self.assertLogs("landsight.backend", level="ERROR"):
            with TestClient(self.app, raise_server_exceptions=False) as client:
                response = client.get("/api/projects")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"]["code"], "INTERNAL_ERROR")
        self.assertNotIn("private", response.text)

    def test_repository_provenance_is_request_scoped(self):
        request = SimpleNamespace(app=self.app.app)
        first = get_persisted_project_repository(request)
        second = get_persisted_project_repository(request)
        self.assertIsNot(first, second)
        self.assertIs(first.postgres.database, second.postgres.database)
        first.data_source = "demo-fallback"
        self.assertEqual(second.data_source, "unavailable")

    def test_app_lifespan_closes_database(self):
        app = create_app(Settings(prediction_mode="demo"))
        with patch.object(app.app.state.database, "close", new_callable=AsyncMock) as close:
            with TestClient(app) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                close.assert_not_awaited()
            close.assert_awaited_once_with()

    def test_refused_connection_uses_real_pool_fallback(self):
        app = create_app(Settings(database_url="postgresql://unused:unused@127.0.0.1:1/unavailable", prediction_mode="demo"))
        with TestClient(app) as client, self.assertLogs("landsight.backend", level="WARNING"):
            listing = client.get("/api/projects")
            detail = client.get(f"/api/projects/{self.demo.id}")
            missing = client.get("/api/projects/NOT-FOUND")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(listing.json(), [detail.json()])
        self.assertEqual(detail.json()["id"], self.demo.id)
        self.assertEqual(missing.status_code, 404)
        self.assertIsNone(app.app.state.database._pool)


class DatabasePoolTests(unittest.IsolatedAsyncioTestCase):
    async def test_reuses_pool_and_normalizes_neon_connection_options(self):
        database = Database("postgresql://user:password@localhost/db?sslmode=require&channel_binding=require")
        pool = SimpleNamespace(close=AsyncMock())
        with patch("app.services.database.asyncpg.create_pool", new=AsyncMock(return_value=pool)) as create_pool:
            self.assertIs(await database.pool(), pool)
            self.assertIs(await database.pool(), pool)
            create_pool.assert_awaited_once()
            options = create_pool.call_args.kwargs
            self.assertIn("sslmode=require", options["dsn"])
            self.assertNotIn("channel_binding", options["dsn"])
            self.assertEqual(options["command_timeout"], 3)
            self.assertEqual(options["max_size"], 5)
            await database.close()
            pool.close.assert_awaited_once_with()
            self.assertIsNone(database._pool)

    async def test_unconfigured_database_uses_existing_demo_repository(self):
        repository = ProjectRepository(Database(None), demo_enabled=True)
        with self.assertLogs("landsight.backend", level="WARNING"):
            projects = await repository.list_projects()
        self.assertEqual(projects, DemoProjectRepository().list_projects())
        self.assertEqual(repository.data_source, "demo-fallback")


@unittest.skipUnless(os.environ.get("DATABASE_URL"), "Live PostgreSQL verification requires DATABASE_URL")
class LiveProjectDatabaseTests(unittest.TestCase):
    def test_existing_persisted_projects_match_list_and_detail(self):
        settings = Settings.from_env().model_copy(update={"demo_enabled": False})

        async def read_database():
            database = Database(settings.database_url.get_secret_value())
            try:
                async with database.connection() as connection:
                    self.assertEqual(await connection.fetchval("SELECT 1"), 1)
                self.assertTrue(await database.ready(), "Connected database lacks the existing Phase 5 schema/PostGIS setup")
                return await PostgresProjectRepository(database).list_projects()
            finally:
                await database.close()

        projects = asyncio.run(read_database())
        self.assertTrue(projects, "Existing PostgreSQL seed data is missing; this test never migrates or seeds")
        app = create_app(settings)
        with TestClient(app) as client:
            self.assertIsNotNone(app.app.state.predictor, "A compatible existing predictor is required")
            with patch.object(DemoProjectRepository, "list_projects", side_effect=AssertionError("Live verification must not fall back")):
                response = client.get("/api/projects")
                self.assertEqual(response.status_code, 200, response.text)
                expected = [
                    project_information(project, app.app.state.predictor.predict(project)).model_dump(by_alias=True, mode="json")
                    for project in projects
                ]
                self.assertEqual(response.json(), expected)
                for project in expected:
                    detail = client.get(f"/api/projects/{project['id']}")
                    self.assertEqual(detail.status_code, 200, detail.text)
                    self.assertEqual(detail.json(), project)
                missing = client.get("/api/projects/LS-NONEXISTENT-TASK5A-VERIFICATION")
                self.assertEqual(missing.status_code, 404)
                self.assertEqual(missing.json()["error"]["code"], "PROJECT_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
