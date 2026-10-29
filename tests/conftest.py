from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import initialize_database, write_transaction
from app.identity import normalize_username
from app.main import create_app


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "splitmoney.sqlite3"


@pytest.fixture
def application(database_path) -> FastAPI:
    return create_app(database_path=database_path)


@pytest.fixture
def client(application: FastAPI):
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def ledger_fixture_data() -> dict:
    fixture_path = Path(__file__).parent / "fixtures" / "ledger.json"
    return json.loads(fixture_path.read_text(encoding="utf-8"))


@pytest.fixture
def seed_ledger_users(
    database_path: Path, ledger_fixture_data: dict
) -> Callable[..., dict[str, str]]:
    """Seed selected fixed-ID users into this test's isolated database."""

    people = {person["username"]: person for person in ledger_fixture_data["people"]}

    def seed(*usernames: str) -> dict[str, str]:
        selected_names = usernames or tuple(people)
        missing_names = set(selected_names) - set(people)
        if missing_names:
            raise ValueError(f"unknown fixture users: {sorted(missing_names)}")

        initialize_database(database_path)
        result: dict[str, str] = {}
        with write_transaction(database_path) as connection:
            for username in selected_names:
                person = people[username]
                display_name, username_key = normalize_username(username)
                connection.execute(
                    "INSERT INTO users (id, username, username_key, phone) "
                    "VALUES (?, ?, ?, ?)",
                    (
                        person["id"],
                        display_name,
                        username_key,
                        person["phone"],
                    ),
                )
                result[username] = person["id"]
        return result

    return seed
