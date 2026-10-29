from __future__ import annotations

from pathlib import Path

from fastapi import Body, FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import ErrorEnvelope


def test_health_route(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_accessible_html(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert '<html lang="en">' in response.text
    assert 'name="viewport"' in response.text
    assert "Splitmoney" in response.text


def test_static_assets_are_mounted(client: TestClient) -> None:
    response = client.get("/static/index.html")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert '<html lang="en">' in response.text
    assert 'name="viewport"' in response.text
    assert "Splitmoney" in response.text


def test_unknown_api_route_remains_json_404(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "Not found."}
    }


def test_validation_error_matches_public_envelope(
    application: FastAPI, client: TestClient
) -> None:
    @application.post("/test-validation")
    def validate_payload(
        payload: dict[str, str] = Body(..., embed=True),
    ) -> dict[str, str]:
        return payload

    response = client.post("/test-validation", json={})

    assert response.status_code == 422
    envelope = ErrorEnvelope.model_validate(response.json())
    assert envelope.error.code == "validation_error"
    assert envelope.error.fields
    assert envelope.error.fields[0].loc == ["body", "payload"]


def test_app_instances_keep_database_configuration_independent(
    tmp_path: Path,
) -> None:
    first_path = tmp_path / "first.sqlite3"
    second_path = tmp_path / "second.sqlite3"
    first = create_app(database_path=first_path)
    second = create_app(database_path=second_path)

    assert first.state.config.database_path == first_path
    assert second.state.config.database_path == second_path
    assert first.state.database_path == first_path
    assert second.state.database_path == second_path
    assert not first_path.exists()
    assert not second_path.exists()
