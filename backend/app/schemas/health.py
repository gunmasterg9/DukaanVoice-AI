"""Health and readiness response schemas."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "DukaanVoice AI"
    version: str


class ReadyResponse(BaseModel):
    status: Literal["ready"] = "ready"
    database: Literal["ok"] = "ok"
    schema_version: int


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    code: str
    message: str = Field(
        description="Safe, user-facing error. No filesystem paths or traces."
    )
