import argparse
import asyncio
import hashlib
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import asyncpg

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
LEDGER_SQL = """CREATE TABLE IF NOT EXISTS landsight_schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)"""


def connection_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
        raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
    # asyncpg does not implement libpq's channel_binding connection option.
    options = [(key, value) for key, value in parse_qsl(parsed.query) if key != "channel_binding"]
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        options = [(key, value) for key, value in options if key != "sslmode"]
        options.append(("sslmode", "verify-full"))
    return urlunsplit(parsed._replace(query=urlencode(options)))


async def create_pool(url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn=connection_url(url), min_size=1, max_size=5,
        timeout=10, command_timeout=20,
    )


async def migrate(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as connection, connection.transaction():
        await connection.execute("SELECT pg_advisory_xact_lock(2601705)")
        await connection.execute(LEDGER_SQL)
        for path in sorted(MIGRATIONS.glob("*.sql")):
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            previous = await connection.fetchval(
                "SELECT checksum FROM landsight_schema_migrations WHERE version = $1", path.name,
            )
            if previous is not None:
                if previous != checksum:
                    raise ValueError("An applied LandSight migration has changed; add a new migration instead")
                continue
            await connection.execute(sql)
            await connection.execute(
                "INSERT INTO landsight_schema_migrations (version, checksum) VALUES ($1, $2)",
                path.name, checksum,
            )


async def initialize(seed_demo: bool) -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL is required for database initialization")
    pool = await create_pool(url)
    try:
        await migrate(pool)
        if seed_demo:
            from .services.postgres_projects import seed_projects
            await seed_projects(pool)
        print("LandSight migrations verified." + (" Synthetic demo seed verified." if seed_demo else ""))
    finally:
        await pool.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apply LandSight migrations without touching model artifacts.")
    parser.add_argument("--seed-demo", action="store_true", help="Insert missing existing synthetic prototype projects; never overwrite projects")
    arguments = parser.parse_args()
    try:
        asyncio.run(initialize(arguments.seed_demo))
    except Exception as exc:
        raise SystemExit(f"Database initialization failed ({type(exc).__name__}); check connectivity, permissions and migration state.") from None
