"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.database import initialize_schema
from app.routers import (
    cash_closing,
    customers,
    expenses,
    health,
    products,
    reports,
    transactions,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_schema()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="DukaanVoice AI",
        version=__version__,
        description="Local-first Kirana register with Multilingual Voice AI, Udhaar Khata, Expenses & Cash Closing.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    application.include_router(health.router)
    application.include_router(products.router)
    application.include_router(transactions.router)
    application.include_router(reports.router)
    application.include_router(customers.router)
    application.include_router(expenses.router)
    application.include_router(cash_closing.router)
    return application



app = create_app()
