import unittest
from contextlib import asynccontextmanager
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.seed import load_seed, seed_database
from app.services.projects import DemoProjectRepository


class SeedDataTests(unittest.TestCase):
    def test_reuses_existing_dataset_and_demo_contract(self):
        snapshot, projects = load_seed()
        self.assertEqual(snapshot, date(2026, 9, 13))
        self.assertEqual(len(projects), 24)
        self.assertEqual(len({p.id for p in projects}), 24)
        self.assertEqual(projects[0], DemoProjectRepository().list_projects()[0])
        self.assertEqual(projects[-1].id, "LS-2026-024")

    def test_existing_derivation_boundaries_and_coordinate_order(self):
        _, projects = load_seed()
        self.assertEqual(projects[7].expected_completion, date(2026, 12, 31))
        self.assertEqual(projects[8].expected_completion, date(2027, 3, 31))
        self.assertEqual(projects[16].expected_completion, date(2027, 6, 30))
        self.assertEqual(projects[0].longitude, 85.1376)
        self.assertEqual(projects[0].latitude, 25.5941)
        self.assertEqual(projects[19].approvals_pending, 1)
        self.assertEqual(projects[19].clearance_status, "Under review")


class SeedSafetyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.snapshot, self.projects = load_seed()
        self.transaction = AsyncMock()
        self.transaction.__aexit__.return_value = False
        self.connection = SimpleNamespace(
            fetchrow=AsyncMock(return_value={"project": "expected-project", "branch": "expected-branch", "database": "neondb"}),
            fetch=AsyncMock(side_effect=[
                [p.model_dump() for p in self.projects],
                [{"id": p.id, "source": "Synthetic", "snapshot_date": self.snapshot} for p in self.projects],
            ]),
            executemany=AsyncMock(),
            transaction=MagicMock(return_value=self.transaction),
        )

        @asynccontextmanager
        async def connection():
            yield self.connection

        self.database = SimpleNamespace(connection=connection, ready=AsyncMock(return_value=True))

    async def run_seed(self):
        return await seed_database(self.database, "expected-project", "expected-branch", "neondb")

    async def test_target_mismatch_prevents_all_writes(self):
        for key in ("project", "branch", "database"):
            with self.subTest(key=key):
                original = dict(self.connection.fetchrow.return_value)
                self.connection.fetchrow.return_value = {**original, key: "wrong-target"}
                with self.assertRaisesRegex(ValueError, "identity"):
                    await self.run_seed()
                self.connection.fetchrow.return_value = original
        self.connection.executemany.assert_not_awaited()
        self.database.ready.assert_not_awaited()

    async def test_requires_existing_migration(self):
        self.database.ready.return_value = False
        with self.assertRaisesRegex(ValueError, "005_persistence.sql"):
            await self.run_seed()
        self.connection.executemany.assert_not_awaited()

    async def test_conflicts_roll_back_without_overwrite(self):
        self.connection.fetch.side_effect = [[]]
        with self.assertRaisesRegex(ValueError, "Conflicting project data"):
            await self.run_seed()
        self.assertIs(self.transaction.__aexit__.await_args.args[0], ValueError)
        for call in self.connection.executemany.await_args_list:
            self.assertIn("DO NOTHING", call.args[0])
            self.assertNotIn("DO UPDATE", call.args[0])

    async def test_mismatched_provenance_rolls_back(self):
        self.connection.fetch.side_effect = [[p.model_dump() for p in self.projects], []]
        with self.assertRaisesRegex(ValueError, "provenance"):
            await self.run_seed()
        self.assertIs(self.transaction.__aexit__.await_args.args[0], ValueError)

    async def test_success_requires_postcommit_read_without_fallback(self):
        repository = SimpleNamespace(data_source="postgresql", list_projects=AsyncMock(return_value=self.projects))
        with patch("app.seed.ProjectRepository", return_value=repository) as factory:
            self.assertEqual(await self.run_seed(), 24)
        factory.assert_called_once_with(self.database, demo_enabled=False)
        self.assertEqual(self.connection.executemany.await_count, 5)
        self.assertEqual(self.connection.executemany.await_args_list[0].args[1][0][9:11], (85.1376, 25.5941))
        self.assertIsNone(self.transaction.__aexit__.await_args.args[0])
        repository.list_projects.assert_awaited_once_with()


if __name__ == "__main__":
    unittest.main()
