import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import APIError
from app.main import create_app
from app.services.database import Database, PostgresProjectRepository, ProjectRepository
from app.services.projects import bundled_projects


class RepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_complete_seed_has_strict_counts(self):
        projects = bundled_projects()
        self.assertEqual(len(projects), 24)
        self.assertEqual(len({p.id for p in projects}), 24)
        self.assertTrue(all(type(p.landowners) is int for p in projects))

    async def test_empty_database_does_not_load_fallback(self):
        repository = ProjectRepository(Database(None), True)
        repository.postgres.list_projects = AsyncMock(return_value=[])
        self.assertEqual(await repository.list_projects(), [])
        self.assertEqual(repository.data_source, 'postgresql')
        self.assertIsNone(await repository.get_project('LS-2026-001'))

    async def test_outage_fallback_can_be_disabled(self):
        repository = ProjectRepository(Database(None), True)
        self.assertEqual(len(await repository.list_projects()), 24)
        self.assertEqual(repository.data_source, 'demo-fallback')
        self.assertFalse(await repository.save_predictions([]))
        strict = ProjectRepository(Database(None), False)
        with self.assertRaises(APIError):
            await strict.list_projects()

    async def test_invalid_database_rows_are_not_disguised_as_an_outage(self):
        repository = ProjectRepository(Database(None), True)
        repository.postgres.list_projects = AsyncMock(side_effect=ValueError('invalid stored input'))
        with self.assertRaises(ValueError):
            await repository.list_projects()
        self.assertNotEqual(repository.data_source, 'demo-fallback')

    async def test_write_failure_does_not_replace_persisted_project_inputs(self):
        repository = ProjectRepository(Database(None), True)
        repository.postgres.list_projects = AsyncMock(return_value=bundled_projects()[:1])
        repository.postgres.save_predictions = AsyncMock(side_effect=TimeoutError())
        self.assertEqual(len(await repository.list_projects()), 1)
        self.assertFalse(await repository.save_predictions([]))
        self.assertEqual(repository.data_source, 'postgresql')


class PersistedAPITests(unittest.TestCase):
    def test_project_routes_preserve_database_provenance_and_persist_predictions(self):
        project = bundled_projects()[0].model_copy(update={'id': 'LS-PERSISTED-ONLY', 'name': 'Persisted API test'})

        async def projects(project_id=None):
            return [project] if project_id in (None, project.id) else []

        with patch.object(PostgresProjectRepository, 'list_projects', side_effect=projects), \
                patch.object(PostgresProjectRepository, 'save_predictions', new_callable=AsyncMock) as save, \
                TestClient(create_app(Settings(prediction_mode='demo'))) as client:
            response = client.get('/api/projects')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['x-landsight-data-source'], 'postgresql')
            self.assertEqual(response.headers['x-landsight-predictions-persisted'], 'true')
            self.assertEqual([p['id'] for p in response.json()], [project.id])
            detail = client.get(f'/api/projects/{project.id}')
            self.assertEqual(detail.status_code, 200)
            self.assertEqual(detail.headers['x-landsight-data-source'], 'postgresql')
            self.assertEqual(detail.json(), response.json()[0])
            self.assertEqual(save.await_count, 2)
            self.assertEqual(client.get('/api/projects/LS-2026-001').status_code, 404)


if __name__ == '__main__':
    unittest.main()
