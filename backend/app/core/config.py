import os
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, field_validator


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    cors_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )
    demo_enabled: bool = True
    docs_enabled: bool = True

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        for origin in origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "*" in origin
            ):
                raise ValueError("CORS origins must be exact HTTP(S) origins without paths or wildcards")
            _ = parsed.port
        return origins

    @classmethod
    def from_env(cls) -> "Settings":
        values: dict[str, object] = {}
        if "LANDSIGHT_CORS_ORIGINS" in os.environ:
            values["cors_origins"] = tuple(
                origin.strip()
                for origin in os.environ["LANDSIGHT_CORS_ORIGINS"].split(",")
                if origin.strip()
            )
        for field, variable in (
            ("demo_enabled", "LANDSIGHT_DEMO_ENABLED"),
            ("docs_enabled", "LANDSIGHT_DOCS_ENABLED"),
        ):
            if variable in os.environ:
                values[field] = os.environ[variable]
        return cls.model_validate(values)
