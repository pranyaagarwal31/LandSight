from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from .api.routes import health_router, router
from .core.config import Settings
from .core.errors import register_error_handlers
from .services.prediction import DemoPredictor
from .services.projects import DemoProjectRepository


def create_app(settings: Settings | None = None) -> CORSMiddleware:
    settings = settings if settings is not None else Settings.from_env()
    api = FastAPI(
        title="LandSight Backend",
        version="0.1.0",
        description="Phase 1 API foundation. Read-only synthetic fixture and temporary rule-based predictions; no ML or database.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        debug=False,
    )
    api.state.settings = settings
    api.state.predictor = DemoPredictor() if settings.demo_enabled else None
    api.state.project_repository = DemoProjectRepository()
    register_error_handlers(api)

    @api.middleware("http")
    async def response_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000"
        if request.url.path.startswith("/api/"):
            response.headers["X-LandSight-Mode"] = "demo" if settings.demo_enabled else "unavailable"
        return response

    api.include_router(health_router)
    api.include_router(router)
    # Wrap the whole ASGI app so even unhandled 500 responses retain CORS headers.
    return CORSMiddleware(
        api,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["X-LandSight-Mode"],
    )


app = create_app()
