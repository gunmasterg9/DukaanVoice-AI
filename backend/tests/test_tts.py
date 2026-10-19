"""Unit and integration tests for Amazon Polly & TTS voice endpoints."""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(initialized_db):
    app = create_app()
    with TestClient(app, follow_redirects=True) as test_client:
        yield test_client


def test_tts_status_without_aws_credentials(client):
    """Verify that when AWS credentials are not set, /api/tts/status reports browser fallback."""
    with patch.dict("os.environ", {"AWS_ACCESS_KEY_ID": "", "AWS_SECRET_ACCESS_KEY": ""}, clear=True):
        res = client.get("/api/tts/status")
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is False
        assert data["provider"] == "browser_speech_synthesis"
        assert "fallback" in data["message"].lower()


def test_tts_status_with_mocked_polly(client):
    """Verify that when AWS credentials and boto3 are available, Polly is reported as available."""
    with patch.dict("os.environ", {"AWS_ACCESS_KEY_ID": "AKIA_MOCK_TEST", "AWS_SECRET_ACCESS_KEY": "MOCK_SECRET_KEY"}):
        with patch("app.routers.tts.HAS_BOTO3", True):
            res = client.get("/api/tts/status")
            assert res.status_code == 200
            data = res.json()
            assert data["available"] is True
            assert data["provider"] == "amazon_polly"
            assert data["engine"] == "neural"


def test_tts_synthesize_empty_text_rejection(client):
    """Verify that empty text payload is rejected with HTTP 422 or 400."""
    res = client.post("/api/tts/synthesize", json={"text": "   "})
    assert res.status_code in (400, 422)


def test_tts_synthesize_length_limit(client):
    """Verify that text exceeding 1500 characters is rejected by Pydantic validation."""
    long_text = "a" * 1501
    res = client.post("/api/tts/synthesize", json={"text": long_text})
    assert res.status_code == 422


def test_tts_synthesize_fallback_when_unavailable(client):
    """Verify that when Polly is not configured, synthesis returns 503 to signal client fallback."""
    with patch("app.routers.tts._get_polly_client", return_value=None):
        res = client.post("/api/tts/synthesize", json={"text": "How many packets of biscuits are left?"})
        assert res.status_code == 503
        assert "fallback" in res.json()["detail"].lower()


def test_tts_synthesize_success_with_polly_client(client):
    """Verify that when Polly synthesizes speech, audio/mpeg bytes are returned with correct headers."""
    fake_stream = io.BytesIO(b"MOCK_MP3_AUDIO_BYTES_HEADER")
    mock_polly = MagicMock()
    mock_polly.synthesize_speech.return_value = {"AudioStream": fake_stream}

    with patch("app.routers.tts._get_polly_client", return_value=mock_polly):
        res = client.post(
            "/api/tts/synthesize",
            json={
                "text": "Parle-G stock is 45 packets.",
                "language_code": "en-IN",
                "voice_id": "Kajal",
                "engine": "neural",
            },
        )
        assert res.status_code == 200
        assert res.headers["content-type"] == "audio/mpeg"
        assert res.headers["x-tts-provider"] == "amazon_polly"
        assert res.headers["x-tts-voice"] == "Kajal"
        assert res.content == b"MOCK_MP3_AUDIO_BYTES_HEADER"
