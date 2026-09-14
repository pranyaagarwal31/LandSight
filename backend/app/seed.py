import asyncio
import json
from datetime import date

from .core.config import Settings
from .services.database import Database
from .services.projects import SEED_PATH, bundled_projects


async def seed():
    settings = Settings.from_env()
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is required for seeding")
    database = Database(settings.database_url.get_secret_value())
    snapshot = date.fromisoformat(json.loads(SEED_PATH.read_text())["snapshotDate"])
    projects = bundled_projects()
    try:
        async with database.connection() as connection:
            async with connection.transaction():
                for p in projects:
                    await connection.execute("""
                        INSERT INTO landsight_projects
                        (id, name, state, district, type, complexity, landowners, expected_completion,
                         agency, location, source, snapshot_date)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,ST_SetSRID(ST_MakePoint($10,$11),4326),'Synthetic',$12)
                        ON CONFLICT (id) DO NOTHING
                    """, p.id, p.name, p.state, p.district, p.type, p.complexity, p.landowners,
                        p.expected_completion, p.agency, p.longitude, p.latitude, snapshot)
                    await connection.execute("INSERT INTO landsight_acquisition VALUES ($1,$2,$3) ON CONFLICT (project_id) DO NOTHING", p.id, p.total_parcels, p.acquired_parcels)
                    await connection.execute("INSERT INTO landsight_compensation VALUES ($1,$2,$3) ON CONFLICT (project_id) DO NOTHING", p.id, p.compensation_paid, p.compensation_budget_cr)
                    await connection.execute("INSERT INTO landsight_legal_cases VALUES ($1,$2) ON CONFLICT (project_id) DO NOTHING", p.id, p.legal_cases)
                    await connection.execute("INSERT INTO landsight_approvals VALUES ($1,$2,$3,$4) ON CONFLICT (project_id) DO NOTHING", p.id, p.approval_days, p.approvals_pending, p.clearance_status)
        print(f"Seed complete: {len(projects)} existing synthetic projects; existing records preserved.")
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(seed())
