from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.balances import split_cents
from app.services import balances as balance_service


def _create_user(client: TestClient, username: str) -> dict:
    response = client.post("/api/users", json={"username": username})
    assert response.status_code == 201, response.text
    return response.json()


def _create_expense(
    client: TestClient,
    payer_id: str,
    amount: str,
    target_user_ids: list[str] | None = None,
) -> dict:
    response = client.post(
        "/api/expenses",
        json={
            "payer_id": payer_id,
            "target_user_ids": target_user_ids,
            "amount": amount,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_settlement(
    client: TestClient, payer_id: str, target_user_id: str, amount: str
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


def _users_by_name(response: dict) -> dict[str, dict]:
    return {user["username"]: user for user in response["users"]}


def _net_by_name(response: dict) -> dict[str, str]:
    return {name: user["net"] for name, user in _users_by_name(response).items()}


def _amount_cents(amount: str) -> int:
    sign = -1 if amount.startswith("-") else 1
    unsigned = amount[1:] if sign < 0 else amount
    dollars, cents = unsigned.split(".")
    return sign * (int(dollars) * 100 + int(cents))


def _database_rows(database_path) -> dict[str, list[tuple]]:
    with sqlite3.connect(database_path) as connection:
        return {
            table: connection.execute(
                f"SELECT * FROM {table} ORDER BY id ASC"
            ).fetchall()
            for table in ("users", "expenses", "settlements")
        }


def _assert_suggestions_zero_balances(response: dict) -> None:
    cents = {
        user["user_id"]: _amount_cents(user["net"])
        for user in response["users"]
    }
    for payment in response["suggested_payments"]:
        amount = _amount_cents(payment["amount"])
        assert amount > 0
        assert payment["from_user_id"] != payment["to_user_id"]
        cents[payment["from_user_id"]] += amount
        cents[payment["to_user_id"]] -= amount
    assert set(cents.values()) <= {0}


def test_empty_database_one_user_and_openapi_balance_contract(client: TestClient) -> None:
    empty = client.get("/api/balances")
    assert empty.status_code == 200
    assert empty.json() == {
        "users": [],
        "totals": {"expenses": "0.00", "settlements": "0.00"},
        "suggested_payments": [],
    }

    solo = _create_user(client, "Solo")
    zero = client.get("/api/balances").json()
    assert zero == {
        "users": [
            {
                "user_id": solo["id"],
                "username": "Solo",
                "expense_paid": "0.00",
                "expense_share": "0.00",
                "settlement_sent": "0.00",
                "settlement_received": "0.00",
                "net": "0.00",
            }
        ],
        "totals": {"expenses": "0.00", "settlements": "0.00"},
        "suggested_payments": [],
    }

    single_person_expense = _create_expense(client, solo["id"], "1.00")
    after_expense = client.get("/api/balances").json()
    assert after_expense["users"][0]["expense_paid"] == "1.00"
    assert after_expense["users"][0]["expense_share"] == "1.00"
    assert after_expense["users"][0]["net"] == "0.00"
    assert after_expense["totals"]["expenses"] == "1.00"
    assert client.delete(f"/api/expenses/{single_person_expense['id']}").status_code == 204

    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/api/balances"]["get"]
    assert "Positive net means the user should receive" in operation["description"]
    assert "currently in the users table" in operation["description"]
    response_schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["$ref"].endswith("/BalancesResponse")
    balance_user = schema["components"]["schemas"]["BalanceUserResponse"]["properties"]
    assert all(balance_user[field]["type"] == "string" for field in (
        "expense_paid",
        "expense_share",
        "settlement_sent",
        "settlement_received",
        "net",
    ))
    expense_schema = schema["components"]["schemas"]["ExpenseResponse"]["properties"]
    assert expense_schema["target_user_ids"]["anyOf"][-1] == {"type": "null"}
    assert expense_schema["amount"]["type"] == "string"


def test_q02_alice_bob_cara_http_balance_sequence_and_read_only_get(
    client: TestClient, database_path, monkeypatch
) -> None:
    alice, bob, cara = [
        _create_user(client, name) for name in ("Alice", "Bob", "Cara")
    ]

    first_expense = _create_expense(client, alice["id"], "60.00")
    first = client.get("/api/balances").json()
    assert _net_by_name(first) == {
        "Alice": "40.00",
        "Bob": "-20.00",
        "Cara": "-20.00",
    }
    assert first["totals"] == {"expenses": "60.00", "settlements": "0.00"}
    assert {payment["amount"] for payment in first["suggested_payments"]} == {
        "20.00"
    }

    second_expense = _create_expense(client, bob["id"], "30.00")
    second = client.get("/api/balances").json()
    assert _net_by_name(second) == {"Alice": "30.00", "Bob": "0.00", "Cara": "-30.00"}
    assert second["totals"]["expenses"] == "90.00"

    patched = client.patch(
        f"/api/expenses/{second_expense['id']}", json={"amount": "36.00"}
    )
    assert patched.status_code == 200
    corrected = client.get("/api/balances").json()
    assert _net_by_name(corrected) == {
        "Alice": "28.00",
        "Bob": "4.00",
        "Cara": "-32.00",
    }
    assert corrected["totals"]["expenses"] == "96.00"

    assert client.patch(
        f"/api/expenses/{second_expense['id']}", json={"amount": "30.00"}
    ).status_code == 200
    payment = _create_settlement(client, bob["id"], alice["id"], "15.00")
    after_payment = client.get("/api/balances").json()
    assert _net_by_name(after_payment) == {
        "Alice": "15.00",
        "Bob": "15.00",
        "Cara": "-30.00",
    }
    alice_row = _users_by_name(after_payment)["Alice"]
    bob_row = _users_by_name(after_payment)["Bob"]
    assert alice_row == {
        "user_id": alice["id"],
        "username": "Alice",
        "expense_paid": "60.00",
        "expense_share": "30.00",
        "settlement_sent": "0.00",
        "settlement_received": "15.00",
        "net": "15.00",
    }
    assert bob_row["expense_paid"] == "30.00"
    assert bob_row["expense_share"] == "30.00"
    assert bob_row["settlement_sent"] == "15.00"
    assert bob_row["settlement_received"] == "0.00"
    assert after_payment["totals"] == {"expenses": "90.00", "settlements": "15.00"}
    assert {
        (item["from_username"], item["to_username"], item["amount"])
        for item in after_payment["suggested_payments"]
    } == {("Cara", "Alice", "15.00"), ("Cara", "Bob", "15.00")}
    _assert_suggestions_zero_balances(after_payment)

    before_reads = _database_rows(database_path)
    repeat_one = client.get("/api/balances").json()
    repeat_two = client.get("/api/balances").json()
    assert repeat_one == repeat_two == after_payment
    assert _database_rows(database_path) == before_reads

    # One GET is calculated from exactly one explicit read transaction.
    original_read_connection = balance_service.read_connection
    opened_snapshots = 0

    @contextmanager
    def counted_read_connection(path):
        nonlocal opened_snapshots
        opened_snapshots += 1
        with original_read_connection(path) as connection:
            yield connection

    monkeypatch.setattr(balance_service, "read_connection", counted_read_connection)
    assert client.get("/api/balances").status_code == 200
    assert opened_snapshots == 1

    # A real API edit and deletion immediately adjust settlement components.
    updated_payment = client.patch(
        f"/api/settlements/{payment['id']}", json={"amount": "10.00"}
    )
    assert updated_payment.status_code == 200
    assert _net_by_name(client.get("/api/balances").json()) == {
        "Alice": "20.00",
        "Bob": "10.00",
        "Cara": "-30.00",
    }
    assert client.patch(
        f"/api/settlements/{payment['id']}", json={"amount": "15.00"}
    ).status_code == 200

    cara_to_alice = _create_settlement(client, cara["id"], alice["id"], "15.00")
    assert _net_by_name(client.get("/api/balances").json()) == {
        "Alice": "0.00",
        "Bob": "15.00",
        "Cara": "-15.00",
    }
    cara_to_bob = _create_settlement(client, cara["id"], bob["id"], "15.00")
    settled = client.get("/api/balances").json()
    assert _net_by_name(settled) == {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"}
    assert settled["totals"]["settlements"] == "45.00"
    assert settled["suggested_payments"] == []

    assert client.delete(f"/api/settlements/{cara_to_bob['id']}").status_code == 204
    assert _net_by_name(client.get("/api/balances").json()) == {
        "Alice": "0.00",
        "Bob": "15.00",
        "Cara": "-15.00",
    }
    rerecorded = _create_settlement(client, cara["id"], bob["id"], "15.00")
    assert rerecorded["id"] != cara_to_bob["id"]

    renamed = client.patch(f"/api/users/{bob['id']}", json={"username": "Robert"})
    assert renamed.status_code == 200
    balances_after_rename = client.get("/api/balances").json()
    assert _net_by_name(balances_after_rename) == {
        "Alice": "0.00",
        "Cara": "0.00",
        "Robert": "0.00",
    }
    assert _users_by_name(balances_after_rename)["Robert"]["user_id"] == bob["id"]
    assert any(
        item["target_user_id"] == bob["id"] and item["target_username"] == "Robert"
        for item in client.get("/api/settlements").json()
    )


def test_everyone_recalculates_after_new_member_explicit_targets_do_not(
    client: TestClient,
) -> None:
    alice, bob, cara = [
        _create_user(client, name) for name in ("Alice", "Bob", "Cara")
    ]
    everyone = _create_expense(client, alice["id"], "10.00")
    explicit = _create_expense(
        client, cara["id"], "7.00", [alice["id"], bob["id"]]
    )
    dan = _create_user(client, "Dan")

    balances = client.get("/api/balances").json()
    assert [user["username"] for user in balances["users"]] == [
        "Alice",
        "Bob",
        "Cara",
        "Dan",
    ]
    all_shares = split_cents(1000, [alice["id"], bob["id"], cara["id"], dan["id"]])
    explicit_shares = split_cents(700, [alice["id"], bob["id"]])
    by_name = _users_by_name(balances)
    assert _amount_cents(by_name["Alice"]["net"]) == (
        1000 - all_shares[alice["id"]] - explicit_shares[alice["id"]]
    )
    assert _amount_cents(by_name["Bob"]["net"]) == (
        -all_shares[bob["id"]] - explicit_shares[bob["id"]]
    )
    assert _amount_cents(by_name["Cara"]["net"]) == (
        -all_shares[cara["id"]] + 700
    )
    assert _amount_cents(by_name["Dan"]["net"]) == -all_shares[dan["id"]]
    assert by_name["Dan"]["expense_paid"] == "0.00"
    assert balances["totals"]["expenses"] == "17.00"
    _assert_suggestions_zero_balances(balances)

    # Renaming resolves current labels while UUID-based expense history persists.
    renamed = client.patch(f"/api/users/{alice['id']}", json={"username": "Alicia"})
    assert renamed.status_code == 200
    after_rename = client.get("/api/balances").json()
    assert _users_by_name(after_rename)["Alicia"]["user_id"] == alice["id"]
    assert _amount_cents(_users_by_name(after_rename)["Alicia"]["net"]) == (
        1000 - all_shares[alice["id"]] - explicit_shares[alice["id"]]
    )
    expense_rows = {item["id"]: item for item in client.get("/api/expenses").json()}
    assert expense_rows[everyone["id"]]["target_user_ids"] is None
    assert expense_rows[explicit["id"]]["target_user_ids"] == sorted(
        [alice["id"], bob["id"]]
    )


def test_odd_cents_payer_exclusion_overpayment_and_conservation(client: TestClient) -> None:
    alice, bob, cara = [
        _create_user(client, name) for name in ("Alice", "Bob", "Cara")
    ]
    expense = _create_expense(
        client, alice["id"], "0.05", [bob["id"], cara["id"]]
    )
    initial = client.get("/api/balances").json()
    expected_shares = split_cents(5, [bob["id"], cara["id"]])
    by_name = _users_by_name(initial)
    assert by_name["Alice"]["expense_paid"] == "0.05"
    assert by_name["Alice"]["expense_share"] == "0.00"
    assert _amount_cents(by_name["Bob"]["expense_share"]) == expected_shares[bob["id"]]
    assert _amount_cents(by_name["Cara"]["expense_share"]) == expected_shares[cara["id"]]
    assert sum(_amount_cents(user["expense_share"]) for user in initial["users"]) == 5
    assert sum(_amount_cents(user["net"]) for user in initial["users"]) == 0
    _assert_suggestions_zero_balances(initial)

    # A payment may exceed the debt. The excess reverses who should pay whom.
    _create_settlement(client, bob["id"], alice["id"], "0.06")
    overpaid = client.get("/api/balances").json()
    assert _net_by_name(overpaid) == {
        "Alice": "-0.01",
        "Bob": "0.03" if expected_shares[bob["id"]] == 3 else "0.04",
        "Cara": "-0.02" if expected_shares[cara["id"]] == 2 else "-0.03",
    }
    assert overpaid["totals"] == {"expenses": "0.05", "settlements": "0.06"}
    assert sum(_amount_cents(user["net"]) for user in overpaid["users"]) == 0
    _assert_suggestions_zero_balances(overpaid)

    assert client.delete(f"/api/expenses/{expense['id']}").status_code == 204
    after_delete = client.get("/api/balances").json()
    assert after_delete["totals"]["expenses"] == "0.00"
    assert after_delete["totals"]["settlements"] == "0.06"
    assert sum(_amount_cents(user["net"]) for user in after_delete["users"]) == 0
    _assert_suggestions_zero_balances(after_delete)


def test_corrupt_stored_target_fails_safely_and_logs_integrity_detail(
    application, database_path, caplog
) -> None:
    with TestClient(application, raise_server_exceptions=False) as client:
        alice = _create_user(client, "Alice")
        bob = _create_user(client, "Bob")
        expense = _create_expense(client, alice["id"], "1.00", [bob["id"]])
        with sqlite3.connect(database_path) as connection:
            connection.execute(
                "UPDATE expenses SET target_ids = ? WHERE id = ?",
                (json.dumps(["not-a-uuid"]), expense["id"]),
            )

        caplog.set_level(logging.ERROR, logger="app.errors")
        response = client.get("/api/balances")
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal_error",
            "message": "An unexpected server error occurred.",
        }
    }
    assert "not-a-uuid" not in response.text
    assert any(
        "Unhandled API error for GET /api/balances" in record.getMessage()
        for record in caplog.records
    )
