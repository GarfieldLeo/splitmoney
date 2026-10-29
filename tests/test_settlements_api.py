from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.services import settlements as settlement_service


def _create_user(client: TestClient, username: str) -> dict:
    response = client.post("/api/users", json={"username": username})
    assert response.status_code == 201, response.text
    return response.json()


def _create_settlement(
    client: TestClient,
    payer_id: str,
    target_user_id: str,
    amount: str = "15.00",
) -> dict:
    response = client.post(
        "/api/settlements",
        json={
            "payer_id": payer_id,
            "target_user_id": target_user_id,
            "amount": amount,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_settlement_crud_partial_updates_and_current_names(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")
    cara = _create_user(client, "Cara")
    timestamps = iter(
        [
            "2026-10-29T12:00:00.000001Z",
            "2026-10-29T12:01:00.000001Z",
            "2026-10-29T12:02:00.000001Z",
        ]
    )
    monkeypatch.setattr(settlement_service, "utc_timestamp", lambda: next(timestamps))

    created = _create_settlement(client, bob["id"], alice["id"], "7.50")
    assert created == {
        "id": created["id"],
        "payer_id": bob["id"],
        "payer_username": "Bob",
        "target_user_id": alice["id"],
        "target_username": "Alice",
        "amount": "7.50",
        "created_at": "2026-10-29T12:00:00.000001Z",
        "modified_at": "2026-10-29T12:00:00.000001Z",
    }

    sender_only = client.patch(
        f"/api/settlements/{created['id']}", json={"payer_id": cara["id"]}
    )
    assert sender_only.status_code == 200, sender_only.text
    assert sender_only.json()["payer_id"] == cara["id"]
    assert sender_only.json()["target_user_id"] == alice["id"]
    assert sender_only.json()["created_at"] == created["created_at"]
    assert sender_only.json()["modified_at"] == "2026-10-29T12:01:00.000001Z"

    full_patch = client.patch(
        f"/api/settlements/{created['id']}",
        json={"target_user_id": bob["id"], "amount": "12.34"},
    )
    assert full_patch.status_code == 200, full_patch.text
    updated = full_patch.json()
    assert updated["payer_id"] == cara["id"]
    assert updated["payer_username"] == "Cara"
    assert updated["target_user_id"] == bob["id"]
    assert updated["target_username"] == "Bob"
    assert updated["amount"] == "12.34"
    assert updated["created_at"] == created["created_at"]
    assert updated["modified_at"] == "2026-10-29T12:02:00.000001Z"

    # Names are resolved from the current user rows, while UUID references persist.
    renamed = client.patch(f"/api/users/{cara['id']}", json={"username": "Caroline"})
    assert renamed.status_code == 200
    fetched = client.get(f"/api/settlements/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["payer_username"] == "Caroline"
    assert fetched.json()["payer_id"] == cara["id"]

    listed = client.get("/api/settlements")
    assert listed.status_code == 200
    assert listed.json() == [fetched.json()]

    deleted = client.delete(f"/api/settlements/{created['id']}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    for response in (
        client.get(f"/api/settlements/{created['id']}"),
        client.patch(f"/api/settlements/{created['id']}", json={"amount": "1.00"}),
        client.delete(f"/api/settlements/{created['id']}"),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "settlement_not_found"


@pytest.mark.parametrize("missing_party", ["payer_id", "target_user_id"])
def test_unknown_participant_returns_invalid_reference_without_insert(
    client: TestClient, missing_party: str
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")
    unknown_id = str(uuid.uuid4())
    payload = {
        "payer_id": alice["id"],
        "target_user_id": bob["id"],
        "amount": "1.00",
    }
    payload[missing_party] = unknown_id

    response = client.post("/api/settlements", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_reference"
    assert client.get("/api/settlements").json() == []


@pytest.mark.parametrize("amount", ["0", "-1.00", "1.001"])
def test_invalid_amount_fails_without_inserting_settlement(
    client: TestClient, amount: str
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")

    response = client.post(
        "/api/settlements",
        json={"payer_id": alice["id"], "target_user_id": bob["id"], "amount": amount},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get("/api/settlements").json() == []


def test_self_payment_rejected_on_create_and_merged_one_party_patch(
    client: TestClient,
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")
    same_party = client.post(
        "/api/settlements",
        json={"payer_id": alice["id"], "target_user_id": alice["id"], "amount": "1.00"},
    )
    assert same_party.status_code == 422
    assert same_party.json()["error"]["code"] == "validation_error"

    created = _create_settlement(client, alice["id"], bob["id"])
    invalid_patch = client.patch(
        f"/api/settlements/{created['id']}", json={"payer_id": bob["id"]}
    )
    assert invalid_patch.status_code == 422
    assert invalid_patch.json()["error"]["code"] == "validation_error"
    assert client.get(f"/api/settlements/{created['id']}").json() == created


def test_overpayment_without_expense_is_recorded_and_uuid_path_is_canonicalized(
    client: TestClient,
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")
    created = _create_settlement(client, alice["id"], bob["id"], "999999999.99")

    compact_path = created["id"].replace("-", "")
    fetched = client.get(f"/api/settlements/{compact_path}")
    assert fetched.status_code == 200
    assert fetched.json() == created
    invalid_path = client.get("/api/settlements/not-a-uuid")
    assert invalid_path.status_code == 422
    assert invalid_path.json()["error"]["code"] == "validation_error"


def test_user_deletion_is_blocked_for_sender_and_recipient_until_payment_deleted(
    client: TestClient,
) -> None:
    alice = _create_user(client, "Alice")
    bob = _create_user(client, "Bob")
    created = _create_settlement(client, alice["id"], bob["id"])

    for user in (alice, bob):
        blocked = client.delete(f"/api/users/{user['id']}")
        assert blocked.status_code == 409
        assert blocked.json()["error"]["code"] == "user_in_use"

    assert client.delete(f"/api/settlements/{created['id']}").status_code == 204
    assert client.delete(f"/api/users/{alice['id']}").status_code == 204
    assert client.delete(f"/api/users/{bob['id']}").status_code == 204


def test_settlement_list_orders_by_creation_descending_then_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    users = [_create_user(client, name) for name in ("Alice", "Bob", "Cara")]
    ids = iter(
        [
            "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
        ]
    )
    timestamps = iter(
        [
            "2026-10-28T12:00:00Z",
            "2026-10-29T12:00:00Z",
            "2026-10-29T12:00:00Z",
        ]
    )
    monkeypatch.setattr(settlement_service, "new_uuid", lambda: next(ids))
    monkeypatch.setattr(settlement_service, "utc_timestamp", lambda: next(timestamps))

    _create_settlement(client, users[0]["id"], users[1]["id"])
    _create_settlement(client, users[1]["id"], users[2]["id"])
    _create_settlement(client, users[2]["id"], users[0]["id"])

    listed = client.get("/api/settlements")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
    ]
