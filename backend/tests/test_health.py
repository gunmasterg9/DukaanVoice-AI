"""Health and readiness endpoint tests."""

from fastapi.testclient import TestClient

from app.config import clear_settings_cache
from app.main import create_app


def test_health_returns_expected_response(tmp_db_path):
    with TestClient(create_app()) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "DukaanVoice AI"
    assert "version" in body


def test_ready_succeeds_with_valid_database(tmp_db_path):
    with TestClient(create_app()) as client:
        response = client.get("/api/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["database"] == "ok"
    assert body["schema_version"] == 1


def test_ready_fails_cleanly_when_database_unavailable(tmp_db_path):
    with TestClient(create_app()) as client:
        tmp_db_path.unlink(missing_ok=True)
        wal = tmp_db_path.with_suffix(".db-wal")
        shm = tmp_db_path.with_suffix(".db-shm")
        wal.unlink(missing_ok=True)
        shm.unlink(missing_ok=True)
        response = client.get("/api/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["code"] == "database_unavailable"
    assert "traceback" not in body["message"].lower()
    assert "exception" not in body["message"].lower()
    assert "C:\\" not in body["message"]
    assert str(tmp_db_path) not in response.text
    clear_settings_cache()
