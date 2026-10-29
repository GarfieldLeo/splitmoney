from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app import services
from app.db import read_connection


def _create_user(client: TestClient, username: str) -> dict:
    response = client.post("/api/users", json={"username": username})
    assert response.status_code == 201, response.text
    return response.json()


def _create_expense(
    client: TestClient,
    payer_id: str,
    amount: str = "12.34",
    target_user_ids: list[str] | None | object = ...,  # Ellipsis means omitted.
):
    payload = {"payer_id": payer_id, "amount": amount}
    if target_user_ids is not ...:
        payload["target_user_ids"] = target_user_ids
    return client.post("/api/expenses", json=payload)


def test_empty_list_create_get_and_everyone_target_defaults(client: TestClient) -> None:
    payer = _create_user(client, "Alice")
    target = _create_user(client, "Bob")

    assert client.get("/api/expenses").status_code == 200
    assert client.get("/api/expenses").json() == []

    created = _create_expense(client, payer["id"])
    assert created.status_code == 201, created.text
    expense = created.json()
    assert expense == {
        "id": expense["id"],
        "payer_id": payer["id"],
        "payer_username": "Alice",
        "target_user_ids": None,
        "target_usernames": None,
        "amount": "12.34",
        "created_at": expense["created_at"],
        "modified_at": expense["created_at"],
    }
    assert client.get(f"/api/expenses/{expense['id']}").json() == expense
    assert client.get("/api/expenses").json() == [expense]
    assert target["id"] != payer["id"]


@pytest.mark.parametrize("targets", [None, []])
def test_null_and_empty_targets_mean_everyone(
    client: TestClient, targets: list[str] | None
) -> None:
    payer = _create_user(client, "Alice")
    response = _create_expense(client, payer["id"], target_user_ids=targets)

    assert response.status_code == 201, response.text
    assert response.json()["target_user_ids"] is None
    assert response.json()["target_usernames"] is None


def test_explicit_targets_are_canonical_and_never_grow_with_membership(
    client: TestClient,
) -> None:
    payer = _create_user(client, "Payer")
    selected = _create_user(client, "Selected")
    unselected = _create_user(client, "Unselected")

    subset = _create_expense(
        client,
        payer["id"],
        target_user_ids=[selected["id"], selected["id"]],
    )
    assert subset.status_code == 201, subset.text
    assert subset.json()["target_user_ids"] == [selected["id"]]
    assert subset.json()["target_usernames"] == ["Selected"]
    assert payer["id"] not in subset.json()["target_user_ids"]

    explicit_full_membership = _create_expense(
        client,
        payer["id"],
        target_user_ids=[unselected["id"], payer["id"], selected["id"]],
    )
    assert explicit_full_membership.status_code == 201
    full = explicit_full_membership.json()
    assert full["target_user_ids"] == sorted(
        [payer["id"], selected["id"], unselected["id"]]
    )

    newcomer = _create_user(client, "Newcomer")
    reread = client.get(f"/api/expenses/{full['id']}").json()
    assert reread["target_user_ids"] == full["target_user_ids"]
    assert newcomer["id"] not in reread["target_user_ids"]
    assert len(reread["target_usernames"]) == 3


def test_unknown_references_fail_without_insert_or_partial_update(
    client: TestClient,
) -> None:
    payer = _create_user(client, "Payer")
    target = _create_user(client, "Target")
    unknown_id = str(uuid.uuid4())

    missing_payer = _create_expense(client, unknown_id)
    missing_target = _create_expense(
        client, payer["id"], target_user_ids=[target["id"], unknown_id]
    )
    assert missing_payer.status_code == missing_target.status_code == 422
    assert missing_payer.json()["error"]["code"] == "invalid_reference"
    assert missing_target.json()["error"]["code"] == "invalid_reference"
    assert client.get("/api/expenses").json() == []

    created = _create_expense(client, payer["id"], target_user_ids=[target["id"]])
    before = created.json()
    bad_payer = client.patch(
        f"/api/expenses/{before['id']}",
        json={"payer_id": unknown_id, "amount": "90.00"},
    )
    bad_target = client.patch(
        f"/api/expenses/{before['id']}",
        json={"target_user_ids": [unknown_id], "amount": "80.00"},
    )
    assert bad_payer.status_code == bad_target.status_code == 422
    assert bad_payer.json()["error"]["code"] == "invalid_reference"
    assert bad_target.json()["error"]["code"] == "invalid_reference"
    assert client.get(f"/api/expenses/{before['id']}").json() == before


def test_patch_merges_fields_preserves_created_time_and_refreshes_modified_time(
    client: TestClient, database_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payer = _create_user(client, "Payer")
    second_payer = _create_user(client, "Second payer")
    target = _create_user(client, "Target")
    other_target = _create_user(client, "Other target")
    timestamps = iter(
        [
            "2026-10-29T12:00:00.000001Z",
            "2026-10-29T12:00:01.000001Z",
            "2026-10-29T12:00:02.000001Z",
            "2026-10-29T12:00:03.000001Z",
            "2026-10-29T12:00:04.000001Z",
        ]
    )
    monkeypatch.setattr(services.expenses, "utc_timestamp", lambda: next(timestamps))

    created = _create_expense(
        client, payer["id"], amount="10", target_user_ids=[target["id"]]
    )
    assert created.status_code == 201, created.text
    original = created.json()

    amount_only = client.patch(
        f"/api/expenses/{original['id']}", json={"amount": "11.20"}
    ).json()
    assert amount_only["amount"] == "11.20"
    assert amount_only["payer_id"] == payer["id"]
    assert amount_only["target_user_ids"] == [target["id"]]
    assert amount_only["created_at"] == original["created_at"]
    assert amount_only["modified_at"] == "2026-10-29T12:00:01.000001Z"

    payer_only = client.patch(
        f"/api/expenses/{original['id']}", json={"payer_id": second_payer["id"]}
    ).json()
    assert payer_only["payer_id"] == second_payer["id"]
    assert payer_only["target_user_ids"] == [target["id"]]
    assert payer_only["amount"] == "11.20"
    assert payer_only["created_at"] == original["created_at"]
    assert payer_only["modified_at"] == "2026-10-29T12:00:02.000001Z"

    target_only = client.patch(
        f"/api/expenses/{original['id']}",
        json={"target_user_ids": [other_target["id"], target["id"], other_target["id"]]},
    ).json()
    assert target_only["payer_id"] == second_payer["id"]
    assert target_only["target_user_ids"] == sorted([target["id"], other_target["id"]])
    assert target_only["amount"] == "11.20"
    assert target_only["modified_at"] == "2026-10-29T12:00:03.000001Z"

    combined = client.patch(
        f"/api/expenses/{original['id']}",
        json={
            "payer_id": payer["id"],
            "target_user_ids": [other_target["id"]],
            "amount": "0.01",
        },
    ).json()
    assert combined["payer_id"] == payer["id"]
    assert combined["target_user_ids"] == [other_target["id"]]
    assert combined["amount"] == "0.01"
    assert combined["created_at"] == original["created_at"]
    assert combined["modified_at"] == "2026-10-29T12:00:04.000001Z"

    with read_connection(database_path) as connection:
        row = connection.execute(
            "SELECT created_at, modified_at, amount_cents FROM expenses WHERE id = ?",
            (original["id"],),
        ).fetchone()
    assert row["created_at"] == original["created_at"]
    assert row["modified_at"] == combined["modified_at"]
    assert row["amount_cents"] == 1


def test_explicit_null_patch_resets_to_everyone_and_reads_do_not_change_time(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payer = _create_user(client, "Payer")
    target = _create_user(client, "Target")
    timestamps = iter(
        ["2026-10-29T12:10:00Z", "2026-10-29T12:10:01Z"]
    )
    monkeypatch.setattr(services.expenses, "utc_timestamp", lambda: next(timestamps))
    created = _create_expense(
        client, payer["id"], target_user_ids=[target["id"]]
    ).json()

    reset = client.patch(
        f"/api/expenses/{created['id']}", json={"target_user_ids": None}
    )
    assert reset.status_code == 200, reset.text
    updated = reset.json()
    assert updated["target_user_ids"] is None
    assert updated["target_usernames"] is None
    assert updated["created_at"] == created["created_at"]
    assert updated["modified_at"] == "2026-10-29T12:10:01Z"

    assert client.get(f"/api/expenses/{created['id']}").json() == updated
    assert client.get("/api/expenses").json() == [updated]


def test_renamed_users_are_reflected_in_expenses(client: TestClient) -> None:
    payer = _create_user(client, "Before payer")
    target = _create_user(client, "Before target")
    expense = _create_expense(
        client, payer["id"], target_user_ids=[target["id"]]
    ).json()

    assert client.patch(
        f"/api/users/{payer['id']}", json={"username": "After payer"}
    ).status_code == 200
    assert client.patch(
        f"/api/users/{target['id']}", json={"username": "After target"}
    ).status_code == 200

    reread = client.get(f"/api/expenses/{expense['id']}").json()
    assert reread["id"] == expense["id"]
    assert reread["payer_id"] == payer["id"]
    assert reread["payer_username"] == "After payer"
    assert reread["target_user_ids"] == [target["id"]]
    assert reread["target_usernames"] == ["After target"]


def test_list_order_is_created_desc_then_id_asc(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    payer = _create_user(client, "Payer")
    ids = iter(
        [
            "00000000-0000-0000-0000-000000000003",
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
        ]
    )
    timestamps = iter(
        ["2026-10-29T12:20:00Z", "2026-10-29T12:20:00Z", "2026-10-29T12:19:59Z"]
    )
    monkeypatch.setattr(services.expenses, "new_uuid", lambda: next(ids))
    monkeypatch.setattr(services.expenses, "utc_timestamp", lambda: next(timestamps))

    for _ in range(3):
        response = _create_expense(client, payer["id"])
        assert response.status_code == 201, response.text

    listed = client.get("/api/expenses").json()
    assert [item["id"] for item in listed] == [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000002",
    ]


def test_amount_boundary_and_validation_envelope(client: TestClient) -> None:
    payer = _create_user(client, "Payer")
    maximum = _create_expense(client, payer["id"], amount="999999999.99")
    assert maximum.status_code == 201, maximum.text
    assert maximum.json()["amount"] == "999999999.99"

    for amount in ("0", "0.00", "-1.00", "1000000000.00", "1.001", 2):
        response = _create_expense(client, payer["id"], amount=amount)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"
        assert response.json()["error"]["fields"]

    unknown_field = client.post(
        "/api/expenses",
        json={"payer_id": payer["id"], "amount": "1.00", "extra": True},
    )
    assert unknown_field.status_code == 422
    assert unknown_field.json()["error"]["code"] == "validation_error"


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("get", "/api/expenses/not-a-uuid", None),
        ("patch", "/api/expenses/00000000-0000-0000-0000-000000000000", {}),
        (
            "patch",
            "/api/expenses/00000000-0000-0000-0000-000000000000",
            {"payer_id": None},
        ),
        (
            "patch",
            "/api/expenses/00000000-0000-0000-0000-000000000000",
            {"amount": None},
        ),
    ],
)
def test_invalid_path_and_patch_use_validation_error_envelope(
    client: TestClient, method: str, path: str, payload: dict | None
) -> None:
    response = (
        getattr(client, method)(path, json=payload)
        if payload is not None
        else getattr(client, method)(path)
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["fields"]


def test_missing_expense_ids_return_specific_not_found_errors_and_delete_is_empty(
    client: TestClient,
) -> None:
    missing_id = str(uuid.uuid4())
    for response in (
        client.get(f"/api/expenses/{missing_id}"),
        client.patch(f"/api/expenses/{missing_id}", json={"amount": "2.00"}),
        client.delete(f"/api/expenses/{missing_id}"),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "expense_not_found"

    payer = _create_user(client, "Payer")
    created = _create_expense(client, payer["id"])
    expense_id = created.json()["id"]
    deleted = client.delete(f"/api/expenses/{expense_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert client.get(f"/api/expenses/{expense_id}").json()["error"]["code"] == (
        "expense_not_found"
    )
