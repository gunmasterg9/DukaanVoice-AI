"""Amazon Polly Neural TTS & Voice Service Router for DukaanVoice AI.

Provides:
1. GET /api/tts/status: Status and active TTS provider configuration.
2. GET /api/tts/voices: Available neural/standard voices for Indian retail.
3. POST /api/tts/synthesize: Synthesizes text to MP3 audio using Amazon Polly Neural
   with graceful fallback signal to client-side speech synthesis.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

# Optional boto3 import to prevent hard dependency crashes
try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    BotoCoreError = Exception
    ClientError = Exception

# Indian Retail Polly Voice mapping
DEFAULT_VOICES = {
    "hi-IN": {"neural": "Kajal", "standard": "Aditi"},
    "en-IN": {"neural": "Kajal", "standard": "Aditi"},
    "en-US": {"neural": "Joanna", "standard": "Joanna"},
}


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1500, description="Text to synthesize (max 1500 characters)")
    voice_id: Optional[str] = Field(None, description="Optional Polly VoiceId (e.g. Kajal, Aditi, Joanna)")
    language_code: Optional[str] = Field("en-IN", description="Language code (e.g. en-IN, hi-IN, en-US)")
    engine: Optional[str] = Field("neural", description="Polly engine: neural or standard")


def _get_aws_credentials() -> tuple[Optional[str], Optional[str], str]:
    """Retrieve AWS credentials securely from server environment variables only."""
    access_key = (
        os.getenv("AWS_ACCESS_KEY_ID")
        or os.getenv("DUKAANVOICE_AWS_ACCESS_KEY_ID")
        or ""
    ).strip()
    secret_key = (
        os.getenv("AWS_SECRET_ACCESS_KEY")
        or os.getenv("DUKAANVOICE_AWS_SECRET_ACCESS_KEY")
        or ""
    ).strip()
    region = (
        os.getenv("AWS_REGION")
        or os.getenv("AWS_DEFAULT_REGION")
        or os.getenv("DUKAANVOICE_AWS_REGION")
        or "ap-south-1"
    ).strip()
    return access_key or None, secret_key or None, region


def _is_polly_configured() -> bool:
    if not HAS_BOTO3:
        return False
    access_key, secret_key, _ = _get_aws_credentials()
    return bool(access_key and secret_key)


def _get_polly_client():
    if not HAS_BOTO3:
        return None
    access_key, secret_key, region = _get_aws_credentials()
    if not (access_key and secret_key):
        return None
    try:
        return boto3.client(
            "polly",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )
    except Exception as exc:
        logger.warning("Failed to initialize boto3 Polly client: %s", exc)
        return None


@router.get("/status")
def get_tts_status() -> dict[str, Any]:
    """Report TTS provider availability and capabilities.
    
    Ensures frontend never misrepresents browser speech synthesis as Polly.
    """
    polly_configured = _is_polly_configured()
    _, _, region = _get_aws_credentials()

    if polly_configured:
        return {
            "available": True,
            "provider": "amazon_polly",
            "engine": "neural",
            "region": region,
            "default_voices": DEFAULT_VOICES,
            "supported_locales": ["en-IN", "hi-IN", "en-US", "gu-IN"],
            "message": "Amazon Polly Neural TTS is active and configured.",
        }

    reason = "boto3 SDK not installed" if not HAS_BOTO3 else "AWS credentials not configured in backend environment"
    return {
        "available": False,
        "provider": "browser_speech_synthesis",
        "engine": "browser",
        "region": None,
        "default_voices": {},
        "supported_locales": ["en-IN", "hi-IN", "gu-IN"],
        "reason": reason,
        "message": "Using browser SpeechSynthesis fallback (natural voices auto-selected).",
    }


@router.get("/voices")
def get_polly_voices() -> dict[str, Any]:
    """List available voices from Amazon Polly or default fallback catalogue."""
    client = _get_polly_client()
    if not client:
        return {
            "provider": "browser",
            "voices": [
                {
                    "id": "Kajal",
                    "name": "Kajal",
                    "gender": "Female",
                    "language_code": "hi-IN",
                    "supported_engines": ["neural"],
                    "description": "Amazon Polly Bilingual Neural (Hindi / Indian English)",
                },
                {
                    "id": "Aditi",
                    "name": "Aditi",
                    "gender": "Female",
                    "language_code": "hi-IN",
                    "supported_engines": ["standard"],
                    "description": "Amazon Polly Bilingual Standard (Hindi / Indian English)",
                },
                {
                    "id": "Joanna",
                    "name": "Joanna",
                    "gender": "Female",
                    "language_code": "en-US",
                    "supported_engines": ["neural", "standard"],
                    "description": "Amazon Polly US English Neural / Standard",
                },
            ],
            "message": "Polly credentials not configured. Reference catalogue shown; client uses browser speech synthesis.",
        }

    try:
        res = client.describe_voices()
        voices = [
            {
                "id": v["Id"],
                "name": v["Name"],
                "gender": v["Gender"],
                "language_code": v["LanguageCode"],
                "supported_engines": v.get("SupportedEngines", []),
            }
            for v in res.get("Voices", [])
            if v["LanguageCode"] in ("en-IN", "hi-IN", "en-US", "en-GB")
        ]
        return {"provider": "amazon_polly", "voices": voices}
    except Exception as exc:
        logger.warning("Error fetching Polly voices: %s", exc)
        return {"provider": "amazon_polly", "voices": [], "error": str(exc)}


@router.post("/synthesize")
def synthesize_speech(payload: SynthesizeRequest):
    """Synthesize text into MP3 audio via Amazon Polly Neural.
    
    Returns 503 if Polly is not configured so the client seamlessly
    falls back to browser SpeechSynthesis.
    """
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Speech text cannot be empty.",
        )

    client = _get_polly_client()
    if not client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Amazon Polly Neural TTS is not available on this server. Please use browser speech synthesis fallback.",
        )

    # Determine best voice
    lang = payload.language_code or "en-IN"
    engine = payload.engine if payload.engine in ("neural", "standard") else "neural"
    voice_id = payload.voice_id

    if not voice_id:
        lang_voices = DEFAULT_VOICES.get(lang, DEFAULT_VOICES["en-IN"])
        voice_id = lang_voices.get(engine, lang_voices.get("neural", "Kajal"))

    try:
        kwargs = {
            "Text": clean_text,
            "OutputFormat": "mp3",
            "VoiceId": voice_id,
        }
        # Only pass Engine parameter if using neural or standard supported voices
        if engine == "neural":
            kwargs["Engine"] = "neural"

        res = client.synthesize_speech(**kwargs)
        audio_stream = res.get("AudioStream")
        if not audio_stream:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Polly did not return an audio stream.",
            )

        audio_bytes = audio_stream.read()
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "X-TTS-Provider": "amazon_polly",
                "X-TTS-Voice": voice_id,
            },
        )
    except ClientError as exc:
        err_msg = exc.response.get("Error", {}).get("Message", str(exc))
        logger.error("Polly ClientError: %s", err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Polly synthesis error: {err_msg}")
    except (BotoCoreError, Exception) as exc:
        logger.error("Polly unexpected error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"TTS error: {str(exc)}")
