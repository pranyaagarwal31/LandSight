import logging

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from .api.routes import health_router, router
from .core.config import Settings
from .core.errors import register_error_handlers
from .services.prediction import DemoPredictor
from contextlib import asynccontextmanager
from .services.database import Database


def create_app(settings: Settings | None = None) -> CORSMiddleware:
    settings = settings if settings is not None else Settings.from_env()
    database = Database(settings.database_url.get_secret_value() if settings.database_url else None)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            await database.close()

    api = FastAPI(
        lifespan=lifespan,
        title="LandSight Backend",
        version="0.5.0",
        description="Persisted synthetic PostgreSQL/PostGIS projects, trained XGBoost predictions, verified TreeSHAP, and explicit demo fallback.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        debug=False,
    )
    api.state.settings = settings
    api.state.predictor = None
    api.state.prediction_mode = "unavailable"
    api.state.model_performance = None
    api.state.prediction_notice = "No trained model is loaded."
    if settings.prediction_mode in {"auto", "ml"}:
        try:
            from .services.ml_prediction import MLPredictor

            predictor = MLPredictor(settings.model_directory)
            api.state.predictor = predictor
            api.state.model_performance = predictor.performance
            api.state.prediction_mode = "ml"
            api.state.prediction_notice = predictor.performance.notice
        except Exception as exc:
            logging.getLogger("landsight.backend").warning("ML artifact unavailable (%s); trained predictions are disabled.", type(exc).__name__)
            api.state.prediction_notice = "Trained model unavailable or incompatible; no ML accuracy claims are available."
    if api.state.predictor is None and settings.demo_enabled and settings.prediction_mode in {"auto", "demo"}:
        api.state.predictor = DemoPredictor()
        api.state.prediction_mode = "demo"
        api.state.prediction_notice = "Rule-based demo fallback only; no trained prediction or measured confidence."
    api.state.database = database
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
            response.headers["X-LandSight-Mode"] = api.state.prediction_mode
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
        expose_headers=["X-LandSight-Mode", "X-LandSight-Data-Source", "X-LandSight-Predictions-Persisted"],
    )


app = create_app()
