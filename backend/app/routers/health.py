"""Liveness and readiness endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import __version__
from app.database import ping_database
from app.schema import SCHEMA_VERSION
from app.schemas.health import ErrorResponse, HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(service="DukaanVoice AI", version=__version__)


@router.get(
    "/api/health/ready",
    response_model=ReadyResponse,
    responses={503: {"model": ErrorResponse}},
)
def ready() -> ReadyResponse | JSONResponse:
    try:
        ping_database()
    except Exception:
        return JSONResponse(
            status_code=503,
            content=ErrorResponse(
                code="database_unavailable",
                message="The database is not available.",
            ).model_dump(),
        )
    return ReadyResponse(schema_version=SCHEMA_VERSION)
