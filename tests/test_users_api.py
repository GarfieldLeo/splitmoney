from __future__ import annotations

import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import serialize_target_ids, utc_timestamp, write_transaction
from app.identity import normalize_username


def _create_user(client: TestClient, username: str, phone: str | None = None) -> dict:
    payload = {"username": username}
    if phone is not None:
        payload["phone"] = phone
    response = client.post("/api/users", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _seed_user(connection: sqlite3.Connection, username: str) -> str:
    display, key = normalize_username(username)
    user_id = str(uuid.uuid4())
    connection.execute(
        "INSERT INTO users (id, username, username_key, phone) VALUES (?, ?, ?, NULL)",
        (user_id, display, key),
    )
    return user_id


def _seed_expense(
    connection: sqlite3.Connection,
    payer_id: str,
    target_ids: list[str] | None,
) -> str:
    expense_id = str(uuid.uuid4())
    timestamp = utc_timestamp()
    connection.execute(
        "INSERT INTO expenses "
        "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
        "VALUES (?, ?, ?, 100, ?, ?)",
        (expense_id, payer_id, serialize_target_ids(target_ids), timestamp, timestamp),
    )
    return expense_id


def _seed_settlement(
    connection: sqlite3.Connection, payer_id: str, target_id: str
) -> str:
    settlement_id = str(uuid.uuid4())
    timestamp = utc_timestamp()
    connection.execute(
        "INSERT INTO settlements "
        "(id, payer_id, target_user_id, amount_cents, created_at, modified_at) "
        "VALUES (?, ?, ?, 100, ?, ?)",
        (settlement_id, payer_id, target_id, timestamp, timestamp),
    )
    return settlement_id


def test_user_crud_cleans_phone_and_sorts_public_fields(client: TestClient) -> None:
    bob = _create_user(client, " Bob ", "  555-0102  ")
    alice = _create_user(client, "Alice", "   ")

    assert bob["username"] == "Bob"
    assert bob["phone"] == "555-0102"
    assert alice["phone"] is None
    assert set(alice) == {"id", "username", "phone"}

    listed = client.get("/api/users")
    assert listed.status_code == 200
    assert [user["username"] for user in listed.json()] == ["Alice", "Bob"]

    fetched = client.get(f"/api/users/{bob['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == bob

    patched = client.patch(
        f"/api/users/{bob['id']}",
        json={"username": " Robert ", "phone": None},
    )
    assert patched.status_code == 200
    assert patched.json() == {
        "id": bob["id"],
        "username": "Robert",
        "phone": None,
    }

    deleted = client.delete(f"/api/users/{bob['id']}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get(f"/api/users/{bob['id']}").json()["error"]["code"] == (
        "user_not_found"
    )


def test_login_normalizes_key_and_preserves_existing_display_name(
    client: TestClient,
) -> None:
    first = client.post("/api/login", json={"username": "Alice"})
    padded = client.post("/api/login", json={"username": " alice "})
    upper = client.post("/api/login", json={"username": "ALICE"})

    assert first.status_code == padded.status_code == upper.status_code == 200
    assert first.json() == padded.json() == upper.json()
    assert first.json()["username"] == "Alice"
    assert client.get("/api/users").json() == [first.json()]


def test_concurrent_same_name_logins_converge_on_one_user(client: TestClient) -> None:
    spellings = ["Alice", " ALICE ", "alice", "aLiCe"] * 4

    def login(username: str) -> dict:
        response = client.post("/api/login", json={"username": username})
        assert response.status_code == 200, response.text
        return response.json()

    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(login, spellings))

    assert len({user["id"] for user in responses}) == 1
    assert len(client.get("/api/users").json()) == 1


def test_direct_duplicate_and_rename_conflict_return_username_taken(
    client: TestClient,
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")

    duplicate = client.post("/api/users", json={"username": " alice "})
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "username_taken"

    conflict = client.patch(f"/api/users/{bob['id']}", json={"username": "ALICE"})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "username_taken"

    # A username may be changed to another spelling of its own normalized key.
    no_op = client.patch(f"/api/users/{alice['id']}", json={"username": " ALICE "})
    assert no_op.status_code == 200
    assert no_op.json()["username"] == "ALICE"


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("post", "/api/login", {"username": "   "}),
        ("post", "/api/users", {"username": ""}),
        ("post", "/api/users", {"username": "Alice", "extra": True}),
        ("post", "/api/users", {"username": "Alice", "phone": "x" * 41}),
        ("patch", "/api/users/00000000-0000-0000-0000-000000000000", {}),
        (
            "patch",
            "/api/users/00000000-0000-0000-0000-000000000000",
            {"username": None},
        ),
        ("get", "/api/users/not-a-uuid", None),
    ],
)
def test_invalid_input_uses_validation_error_envelope(
    client: TestClient, method: str, path: str, payload: dict | None
) -> None:
    response = getattr(client, method)(path, json=payload) if payload is not None else getattr(client, method)(path)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["fields"]


def test_missing_user_ids_return_specific_not_found_errors(client: TestClient) -> None:
    missing_id = str(uuid.uuid4())
    for response in (
        client.get(f"/api/users/{missing_id}"),
        client.patch(f"/api/users/{missing_id}", json={"phone": None}),
        client.delete(f"/api/users/{missing_id}"),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "user_not_found"


@pytest.mark.parametrize(
    "reference",
    [
        "expense_payer",
        "expense_target",
        "settlement_sender",
        "settlement_recipient",
        "everyone",
        "everyone_empty_array",
    ],
)
def test_delete_is_blocked_for_every_kind_of_reference(
    client: TestClient,
    database_path: Path,
    reference: str,
) -> None:
    with write_transaction(database_path) as connection:
        target_id = _seed_user(connection, "Target")
        other_id = _seed_user(connection, "Other")
        if reference == "expense_payer":
            _seed_expense(connection, target_id, [other_id])
        elif reference == "expense_target":
            _seed_expense(connection, other_id, [target_id])
        elif reference == "settlement_sender":
            _seed_settlement(connection, target_id, other_id)
        elif reference == "settlement_recipient":
            _seed_settlement(connection, other_id, target_id)
        elif reference == "everyone":
            _seed_expense(connection, other_id, None)
        else:
            expense_id = str(uuid.uuid4())
            timestamp = utc_timestamp()
            connection.execute(
                "INSERT INTO expenses "
                "(id, payer_id, target_ids, amount_cents, created_at, modified_at) "
                "VALUES (?, ?, '[]', 100, ?, ?)",
                (expense_id, other_id, timestamp, timestamp),
            )

    response = client.delete(f"/api/users/{target_id}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "user_in_use"
    assert client.get(f"/api/users/{target_id}").status_code == 200


def test_rename_preserves_uuid_references_and_delete_preserves_other_rows(
    client: TestClient,
    database_path: Path,
) -> None:
    with write_transaction(database_path) as connection:
        referenced_id = _seed_user(connection, "Before")
        payer_id = _seed_user(connection, "Payer")
        unreferenced_id = _seed_user(connection, "Unused")
        expense_id = _seed_expense(connection, payer_id, [referenced_id])

    renamed = client.patch(
        f"/api/users/{referenced_id}", json={"username": "After"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["id"] == referenced_id
    assert renamed.json()["username"] == "After"

    deleted = client.delete(f"/api/users/{unreferenced_id}")
    assert deleted.status_code == 204
    with write_transaction(database_path) as connection:
        expense = connection.execute(
            "SELECT payer_id, target_ids FROM expenses WHERE id = ?", (expense_id,)
        ).fetchone()
        remaining = connection.execute(
            "SELECT COUNT(*) FROM users WHERE id IN (?, ?)",
            (referenced_id, payer_id),
        ).fetchone()[0]
    assert expense["payer_id"] == payer_id
    assert expense["target_ids"] == f'["{referenced_id}"]'
    assert remaining == 2
