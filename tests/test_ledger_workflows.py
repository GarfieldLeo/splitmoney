from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

from fastapi.testclient import TestClient

from app.db import read_connection
from app.main import create_app


def _create_user(client: TestClient, username: str) -> dict:
    response = client.post("/api/users", json={"username": username})
    assert response.status_code == 201, response.text
    return response.json()


def _login(client: TestClient, username: str) -> dict:
    response = client.post("/api/login", json={"username": username})
    assert response.status_code == 200, response.text
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


def _create_payment(
    client: TestClient, payer_id: str, recipient_id: str, amount: str
) -> dict:
    response = client.post(
        "/api/settlements",
        json={
            "payer_id": payer_id,
            "target_user_id": recipient_id,
            "amount": amount,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _cents(amount: str) -> int:
    sign = -1 if amount.startswith("-") else 1
    unsigned = amount[1:] if sign < 0 else amount
    dollars, cents = unsigned.split(".")
    return sign * (int(dollars) * 100 + int(cents))


def _amount(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    dollars, remainder = divmod(abs(cents), 100)
    return f"{sign}{dollars}.{remainder:02d}"


def _assert_balances(
    client: TestClient,
    expected_nets: dict[str, str],
    *,
    expense_total: str,
    payment_total: str,
    user_ids: dict[str, str] | None = None,
    suggestions: set[tuple[str, str, str]] | None = None,
) -> dict:
    response = client.get("/api/balances")
    assert response.status_code == 200, response.text
    ledger = response.json()
    by_name = {user["username"]: user for user in ledger["users"]}
    assert {name: user["net"] for name, user in by_name.items()} == expected_nets
    if user_ids is not None:
        assert {name: user["user_id"] for name, user in by_name.items()} == user_ids
    assert ledger["totals"] == {
        "expenses": expense_total,
        "settlements": payment_total,
    }

    expense_cents = _cents(expense_total)
    payment_cents = _cents(payment_total)
    assert sum(_cents(user["expense_paid"]) for user in ledger["users"]) == expense_cents
    assert sum(_cents(user["expense_share"]) for user in ledger["users"]) == expense_cents
    assert sum(_cents(user["settlement_sent"]) for user in ledger["users"]) == payment_cents
    assert sum(_cents(user["settlement_received"]) for user in ledger["users"]) == payment_cents

    net_by_id = {user["user_id"]: _cents(user["net"]) for user in ledger["users"]}
    assert sum(net_by_id.values()) == 0
    actual_suggestions = {
        (item["from_user_id"], item["to_user_id"], item["amount"])
        for item in ledger["suggested_payments"]
    }
    if suggestions is not None:
        assert actual_suggestions == suggestions
    for item in ledger["suggested_payments"]:
        amount = _cents(item["amount"])
        assert amount > 0
        assert net_by_id[item["from_user_id"]] < 0
        assert net_by_id[item["to_user_id"]] > 0
        net_by_id[item["from_user_id"]] += amount
        net_by_id[item["to_user_id"]] -= amount
    assert set(net_by_id.values()) <= {0}
    return ledger


def _database_snapshot(database_path: Path) -> dict[str, list[tuple]]:
    with read_connection(database_path) as connection:
        return {
            table: [tuple(row) for row in connection.execute(
                f"SELECT * FROM {table} ORDER BY id ASC"
            ).fetchall()]
            for table in ("users", "expenses", "settlements")
        }


def test_q02_primary_ledger_sequence_through_http_and_restart(
    database_path: Path, tmp_path: Path
) -> None:
    people: dict[str, dict] = {}
    with TestClient(create_app(database_path)) as client:
        people["Alice"] = _login(client, "Alice")
        assert _assert_balances(
            client,
            {"Alice": "0.00"},
            expense_total="0.00",
            payment_total="0.00",
            user_ids={"Alice": people["Alice"]["id"]},
            suggestions=set(),
        )

        people["Bob"] = _create_user(client, "Bob")
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "0.00"},
            expense_total="0.00",
            payment_total="0.00",
            user_ids={name: person["id"] for name, person in people.items()},
            suggestions=set(),
        )
        people["Cara"] = _create_user(client, "Cara")
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"},
            expense_total="0.00",
            payment_total="0.00",
            user_ids={name: person["id"] for name, person in people.items()},
            suggestions=set(),
        )

        returning_alice = _login(client, " aLiCe ")
        assert returning_alice == people["Alice"]
        assert len(client.get("/api/users").json()) == 3
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"},
            expense_total="0.00",
            payment_total="0.00",
            user_ids={name: person["id"] for name, person in people.items()},
            suggestions=set(),
        )

        alice_id, bob_id, cara_id = (
            people[name]["id"] for name in ("Alice", "Bob", "Cara")
        )
        expenses: dict[str, dict] = {}
        payments: dict[str, dict] = {}

        expenses["alice"] = _create_expense(client, alice_id, "60.00")
        assert _assert_balances(
            client,
            {"Alice": "40.00", "Bob": "-20.00", "Cara": "-20.00"},
            expense_total="60.00",
            payment_total="0.00",
            suggestions={
                (bob_id, alice_id, "20.00"),
                (cara_id, alice_id, "20.00"),
            },
        )

        expenses["bob"] = _create_expense(client, bob_id, "30.00")
        assert _assert_balances(
            client,
            {"Alice": "30.00", "Bob": "0.00", "Cara": "-30.00"},
            expense_total="90.00",
            payment_total="0.00",
        )

        updated = client.patch(
            f"/api/expenses/{expenses['bob']['id']}", json={"amount": "36.00"}
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["amount"] == "36.00"
        assert _assert_balances(
            client,
            {"Alice": "28.00", "Bob": "4.00", "Cara": "-32.00"},
            expense_total="96.00",
            payment_total="0.00",
        )

        corrected = client.patch(
            f"/api/expenses/{expenses['bob']['id']}", json={"amount": "30.00"}
        )
        assert corrected.status_code == 200, corrected.text
        assert _assert_balances(
            client,
            {"Alice": "30.00", "Bob": "0.00", "Cara": "-30.00"},
            expense_total="90.00",
            payment_total="0.00",
        )

        payments["bob_to_alice"] = _create_payment(
            client, bob_id, alice_id, "15.00"
        )
        assert _assert_balances(
            client,
            {"Alice": "15.00", "Bob": "15.00", "Cara": "-30.00"},
            expense_total="90.00",
            payment_total="15.00",
            suggestions={
                (cara_id, alice_id, "15.00"),
                (cara_id, bob_id, "15.00"),
            },
        )

        # Opening and cancelling a suggested payment leaves the ledger untouched.
        before_cancel = client.get("/api/balances").json()
        assert len(client.get("/api/settlements").json()) == 1
        assert client.get("/api/balances").json() == before_cancel
        assert _assert_balances(
            client,
            {"Alice": "15.00", "Bob": "15.00", "Cara": "-30.00"},
            expense_total="90.00",
            payment_total="15.00",
        )

        payments["cara_to_alice"] = _create_payment(
            client, cara_id, alice_id, "15.00"
        )
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "15.00", "Cara": "-15.00"},
            expense_total="90.00",
            payment_total="30.00",
        )

        payments["cara_to_bob"] = _create_payment(client, cara_id, bob_id, "15.00")
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
            suggestions=set(),
        )

        deleted = client.delete(
            f"/api/settlements/{payments['cara_to_bob']['id']}"
        )
        assert deleted.status_code == 204
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "15.00", "Cara": "-15.00"},
            expense_total="90.00",
            payment_total="30.00",
        )

        payments["cara_to_bob"] = _create_payment(client, cara_id, bob_id, "15.00")
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
            suggestions=set(),
        )

        renamed = client.patch(
            f"/api/users/{bob_id}", json={"username": "Robert"}
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json() == {"id": bob_id, "username": "Robert", "phone": None}
        people["Robert"] = people.pop("Bob")
        expense_labels = {
            item["id"]: item["payer_username"]
            for item in client.get("/api/expenses").json()
        }
        assert expense_labels == {
            expenses["alice"]["id"]: "Alice",
            expenses["bob"]["id"]: "Robert",
        }
        settlement_labels = {
            item["id"]: (item["payer_username"], item["target_username"])
            for item in client.get("/api/settlements").json()
        }
        assert settlement_labels == {
            payments["bob_to_alice"]["id"]: ("Robert", "Alice"),
            payments["cara_to_alice"]["id"]: ("Cara", "Alice"),
            payments["cara_to_bob"]["id"]: ("Cara", "Robert"),
        }
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Cara": "0.00", "Robert": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
            user_ids={name: person["id"] for name, person in people.items()},
            suggestions=set(),
        )

        phone_set = client.patch(
            f"/api/users/{bob_id}", json={"phone": " 555-0102 "}
        )
        assert phone_set.status_code == 200
        assert phone_set.json()["phone"] == "555-0102"
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Cara": "0.00", "Robert": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
        )

        phone_cleared = client.patch(
            f"/api/users/{bob_id}", json={"phone": None}
        )
        assert phone_cleared.status_code == 200
        assert phone_cleared.json()["phone"] is None
        assert _assert_balances(
            client,
            {"Alice": "0.00", "Cara": "0.00", "Robert": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
            suggestions=set(),
        )

        # Exercise every ledger GET against a populated state and prove rows,
        # record counts, and stored timestamps remain unchanged.
        before_reads = _database_snapshot(database_path)
        assert len(client.get("/api/users").json()) == 3
        for person in people.values():
            assert client.get(f"/api/users/{person['id']}").status_code == 200
        assert len(client.get("/api/expenses").json()) == 2
        for expense in expenses.values():
            assert client.get(f"/api/expenses/{expense['id']}").status_code == 200
        assert len(client.get("/api/settlements").json()) == 3
        for payment in payments.values():
            assert client.get(f"/api/settlements/{payment['id']}").status_code == 200
        assert client.get("/api/balances").status_code == 200
        assert _database_snapshot(database_path) == before_reads

    # Starting the application again on the same temporary file preserves the
    # selected identity, renamed labels, records, and settled balances.
    with TestClient(create_app(database_path)) as restarted:
        assert restarted.get("/api/users").json() == [
            {"id": people[name]["id"], "username": name, "phone": None}
            for name in ("Alice", "Cara", "Robert")
        ]
        assert restarted.get("/api/expenses").status_code == 200
        assert len(restarted.get("/api/expenses").json()) == 2
        assert len(restarted.get("/api/settlements").json()) == 3
        assert restarted.get(
            f"/api/settlements/{payments['cara_to_bob']['id']}"
        ).json()["target_username"] == "Robert"
        assert _assert_balances(
            restarted,
            {"Alice": "0.00", "Cara": "0.00", "Robert": "0.00"},
            expense_total="90.00",
            payment_total="45.00",
            user_ids={name: person["id"] for name, person in people.items()},
            suggestions=set(),
        )

    second_database = tmp_path / "fresh-ledger.sqlite3"
    with TestClient(create_app(second_database)) as fresh:
        assert fresh.get("/api/users").json() == []
        assert fresh.get("/api/expenses").json() == []
        assert fresh.get("/api/settlements").json() == []
        assert _assert_balances(
            fresh,
            {},
            expense_total="0.00",
            payment_total="0.00",
            suggestions=set(),
        )


def test_explicit_targets_exclude_payer_and_everyone_tracks_membership(
    client: TestClient,
) -> None:
    people = {name: _create_user(client, name) for name in ("Alice", "Bob", "Cara")}
    ids = {name: person["id"] for name, person in people.items()}
    target_ids = sorted([ids["Alice"], ids["Bob"]])

    selected = _create_expense(
        client,
        ids["Cara"],
        "10.01",
        target_user_ids=[ids["Bob"], ids["Alice"], ids["Bob"]],
    )
    assert selected["target_user_ids"] == target_ids
    assert selected["target_usernames"] == [
        "Alice" if user_id == ids["Alice"] else "Bob" for user_id in target_ids
    ]
    assert _assert_balances(
        client,
        {
            "Alice": "-5.00" if ids["Alice"] == target_ids[1] else "-5.01",
            "Bob": "-5.00" if ids["Bob"] == target_ids[1] else "-5.01",
            "Cara": "10.01",
        },
        expense_total="10.01",
        payment_total="0.00",
        user_ids=ids,
    )

    newcomer = _create_user(client, "Dan")
    people["Dan"] = newcomer
    ids["Dan"] = newcomer["id"]
    assert _assert_balances(
        client,
        {
            "Alice": "-5.00" if ids["Alice"] == target_ids[1] else "-5.01",
            "Bob": "-5.00" if ids["Bob"] == target_ids[1] else "-5.01",
            "Cara": "10.01",
            "Dan": "0.00",
        },
        expense_total="10.01",
        payment_total="0.00",
        user_ids=ids,
    )

    # A separate everyone expense shares its odd cents by UUID and includes Dan.
    everyone = _create_expense(client, ids["Alice"], "0.10")
    everyone_shares = {user_id: 2 for user_id in ids.values()}
    for user_id in sorted(ids.values())[:2]:
        everyone_shares[user_id] += 1
    selected_shares = {
        target_ids[0]: 501,
        target_ids[1]: 500,
    }
    net_cents = {
        name: (1001 if name == "Cara" else 0)
        - selected_shares.get(user_id, 0)
        + (10 if name == "Alice" else 0)
        - everyone_shares[user_id]
        for name, user_id in ids.items()
    }
    share_cents = {
        name: selected_shares.get(user_id, 0) + everyone_shares[user_id]
        for name, user_id in ids.items()
    }
    balance = _assert_balances(
        client,
        {name: _amount(value) for name, value in net_cents.items()},
        expense_total="10.11",
        payment_total="0.00",
        user_ids=ids,
    )
    by_name = {user["username"]: user for user in balance["users"]}
    assert {name: _cents(user["expense_share"]) for name, user in by_name.items()} == share_cents
    assert everyone["target_user_ids"] is None

    blocked = client.delete(f"/api/users/{ids['Dan']}")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "user_in_use"
    assert _assert_balances(
        client,
        {name: _amount(value) for name, value in net_cents.items()},
        expense_total="10.11",
        payment_total="0.00",
        user_ids=ids,
    )

    explicit = client.patch(
        f"/api/expenses/{everyone['id']}",
        json={"target_user_ids": [ids["Alice"], ids["Bob"], ids["Cara"]]},
    )
    assert explicit.status_code == 200, explicit.text
    explicit_shares = {user_id: 3 for user_id in (ids["Alice"], ids["Bob"], ids["Cara"])}
    for user_id in sorted(explicit_shares)[:1]:
        explicit_shares[user_id] += 1
    updated_net = {
        name: (1001 if name == "Cara" else 0)
        - selected_shares.get(user_id, 0)
        + (10 if name == "Alice" else 0)
        - explicit_shares.get(user_id, 0)
        for name, user_id in ids.items()
    }
    updated_share = {
        name: selected_shares.get(user_id, 0) + explicit_shares.get(user_id, 0)
        for name, user_id in ids.items()
    }
    updated_balance = _assert_balances(
        client,
        {name: _amount(value) for name, value in updated_net.items()},
        expense_total="10.11",
        payment_total="0.00",
        user_ids=ids,
    )
    assert explicit.json()["target_user_ids"] == sorted(
        [ids["Alice"], ids["Bob"], ids["Cara"]]
    )
    assert {
        user["username"]: _cents(user["expense_share"])
        for user in updated_balance["users"]
    } == updated_share

    assert client.delete(f"/api/users/{ids['Dan']}").status_code == 204
    ids.pop("Dan")
    people.pop("Dan")
    assert _assert_balances(
        client,
        {name: _amount(value) for name, value in updated_net.items() if name != "Dan"},
        expense_total="10.11",
        payment_total="0.00",
        user_ids=ids,
    )


def test_seeded_fixed_ids_split_odd_dollars_and_suggestions_settle_exactly(
    client: TestClient, seed_ledger_users
) -> None:
    ids = seed_ledger_users("Alice", "Bob", "Cara")
    expense = _create_expense(client, ids["Alice"], "10.00")

    expected_shares = {
        name: "3.34" if user_id == ids["Alice"] else "3.33"
        for name, user_id in ids.items()
    }
    first_balances = _assert_balances(
        client,
        {"Alice": "6.66", "Bob": "-3.33", "Cara": "-3.33"},
        expense_total="10.00",
        payment_total="0.00",
        user_ids=ids,
        suggestions={
            (ids["Bob"], ids["Alice"], "3.33"),
            (ids["Cara"], ids["Alice"], "3.33"),
        },
    )
    assert {
        user["username"]: user["expense_share"] for user in first_balances["users"]
    } == expected_shares

    suggestions = first_balances["suggested_payments"]
    assert [
        (item["from_user_id"], item["to_user_id"], item["amount"])
        for item in suggestions
    ] == [
        (ids["Bob"], ids["Alice"], "3.33"),
        (ids["Cara"], ids["Alice"], "3.33"),
    ]
    for index, suggestion in enumerate(suggestions, start=1):
        payment = _create_payment(
            client,
            suggestion["from_user_id"],
            suggestion["to_user_id"],
            suggestion["amount"],
        )
        assert payment["payer_id"] == suggestion["from_user_id"]
        assert payment["target_user_id"] == suggestion["to_user_id"]
        if index == 1:
            expected_nets = {"Alice": "3.33", "Bob": "0.00", "Cara": "-3.33"}
        else:
            expected_nets = {"Alice": "0.00", "Bob": "0.00", "Cara": "0.00"}
        _assert_balances(
            client,
            expected_nets,
            expense_total="10.00",
            payment_total="3.33" if index == 1 else "6.66",
            user_ids=ids,
            suggestions=None if index == 1 else set(),
        )

    assert expense["payer_id"] == ids["Alice"]


def test_overpayment_reversal_and_delete_safety_through_http(client: TestClient) -> None:
    alice, bob = [_create_user(client, name) for name in ("Alice", "Bob")]
    expense = _create_expense(client, alice["id"], "20.00")
    assert _assert_balances(
        client,
        {"Alice": "10.00", "Bob": "-10.00"},
        expense_total="20.00",
        payment_total="0.00",
    )

    payment = _create_payment(client, bob["id"], alice["id"], "15.00")
    assert _assert_balances(
        client,
        {"Alice": "-5.00", "Bob": "5.00"},
        expense_total="20.00",
        payment_total="15.00",
        suggestions={(alice["id"], bob["id"], "5.00")},
    )

    exact = client.patch(
        f"/api/settlements/{payment['id']}", json={"amount": "10.00"}
    )
    assert exact.status_code == 200, exact.text
    assert _assert_balances(
        client,
        {"Alice": "0.00", "Bob": "0.00"},
        expense_total="20.00",
        payment_total="10.00",
        suggestions=set(),
    )

    assert client.delete(f"/api/settlements/{payment['id']}").status_code == 204
    assert _assert_balances(
        client,
        {"Alice": "10.00", "Bob": "-10.00"},
        expense_total="20.00",
        payment_total="0.00",
    )
    for person in (alice, bob):
        blocked = client.delete(f"/api/users/{person['id']}")
        assert blocked.status_code == 409
        assert blocked.json()["error"]["code"] == "user_in_use"

    assert client.delete(f"/api/expenses/{expense['id']}").status_code == 204
    assert _assert_balances(
        client,
        {"Alice": "0.00", "Bob": "0.00"},
        expense_total="0.00",
        payment_total="0.00",
        suggestions=set(),
    )
    assert client.delete(f"/api/users/{alice['id']}").status_code == 204
    assert client.delete(f"/api/users/{bob['id']}").status_code == 204
    assert _assert_balances(
        client,
        {},
        expense_total="0.00",
        payment_total="0.00",
        suggestions=set(),
    )


def test_failed_cross_feature_mutations_are_atomic(client: TestClient, database_path: Path) -> None:
    alice, bob = [_create_user(client, name) for name in ("Alice", "Bob")]
    expense = _create_expense(client, alice["id"], "60.00")
    unknown_id = "00000000-0000-0000-0000-000000000099"

    before_rows = _database_snapshot(database_path)
    before_balances = _assert_balances(
        client,
        {"Alice": "30.00", "Bob": "-30.00"},
        expense_total="60.00",
        payment_total="0.00",
    )

    invalid_patch = client.patch(
        f"/api/expenses/{expense['id']}",
        json={"amount": "90.00", "target_user_ids": [unknown_id]},
    )
    assert invalid_patch.status_code == 422
    assert invalid_patch.json()["error"]["code"] == "invalid_reference"
    assert _database_snapshot(database_path) == before_rows
    assert client.get("/api/balances").json() == before_balances

    rename_collision = client.patch(
        f"/api/users/{bob['id']}", json={"username": "ALICE"}
    )
    assert rename_collision.status_code == 409
    assert rename_collision.json()["error"]["code"] == "username_taken"
    assert _database_snapshot(database_path) == before_rows
    assert client.get("/api/balances").json() == before_balances

    invalid_payment = client.post(
        "/api/settlements",
        json={"payer_id": alice["id"], "target_user_id": alice["id"], "amount": "5.00"},
    )
    assert invalid_payment.status_code == 422
    assert invalid_payment.json()["error"]["code"] == "validation_error"
    assert _database_snapshot(database_path) == before_rows
    assert client.get("/api/balances").json() == before_balances


def test_concurrent_logins_converge_before_their_ids_enter_the_ledger(
    client: TestClient,
) -> None:
    barrier = Barrier(6)

    def login(spelling: str) -> dict:
        barrier.wait()
        response = client.post("/api/login", json={"username": spelling})
        assert response.status_code == 200, response.text
        return response.json()

    spellings = ["Alice", " ALICE ", "alice", "aLiCe", "Alice", "ALICE"]
    with ThreadPoolExecutor(max_workers=len(spellings)) as executor:
        alice_responses = list(executor.map(login, spellings))

    alice_ids = {person["id"] for person in alice_responses}
    assert len(alice_ids) == 1
    alice_id = alice_ids.pop()
    alice_name = alice_responses[0]["username"]
    assert {person["username"] for person in alice_responses} == {alice_name}
    bob = _login(client, "Bob")
    expense = _create_expense(client, alice_id, "8.00")
    assert expense["payer_id"] == alice_id
    assert _assert_balances(
        client,
        {alice_name: "4.00", "Bob": "-4.00"},
        expense_total="8.00",
        payment_total="0.00",
        user_ids={alice_name: alice_id, "Bob": bob["id"]},
        suggestions={(bob["id"], alice_id, "4.00")},
    )


def test_concurrent_create_and_delete_never_leave_dangling_references(
    client: TestClient, database_path: Path
) -> None:
    alice, bob = [_create_user(client, name) for name in ("Alice", "Bob")]
    barrier = Barrier(3)

    def create_expense() -> tuple[str, dict]:
        barrier.wait()
        response = client.post(
            "/api/expenses",
            json={
                "payer_id": alice["id"],
                "target_user_ids": [bob["id"]],
                "amount": "7.00",
            },
        )
        return response.status_code, response.json() if response.content else {}

    def create_payment() -> tuple[str, dict]:
        barrier.wait()
        response = client.post(
            "/api/settlements",
            json={
                "payer_id": bob["id"],
                "target_user_id": alice["id"],
                "amount": "2.00",
            },
        )
        return response.status_code, response.json() if response.content else {}

    def delete_bob() -> tuple[str, dict]:
        barrier.wait()
        response = client.delete(f"/api/users/{bob['id']}")
        return response.status_code, response.json() if response.content else {}

    with ThreadPoolExecutor(max_workers=3) as executor:
        expense_future = executor.submit(create_expense)
        payment_future = executor.submit(create_payment)
        delete_future = executor.submit(delete_bob)
        expense_result = expense_future.result()
        payment_result = payment_future.result()
        delete_result = delete_future.result()

    create_results = (expense_result, payment_result)
    assert all(status in (201, 422) for status, _ in create_results)
    assert delete_result[0] in (204, 409)
    for status, body in create_results:
        if status == 422:
            assert body["error"]["code"] == "invalid_reference"
    if delete_result[0] == 409:
        assert delete_result[1]["error"]["code"] == "user_in_use"
    if delete_result[0] == 204:
        assert all(status == 422 for status, _ in create_results)
        assert client.get(f"/api/users/{bob['id']}").status_code == 404
    else:
        assert any(status == 201 for status, _ in create_results)
        assert client.get(f"/api/users/{bob['id']}").status_code == 200

    with read_connection(database_path) as connection:
        user_ids = {
            row["id"] for row in connection.execute("SELECT id FROM users").fetchall()
        }
        expenses = connection.execute(
            "SELECT payer_id, target_ids FROM expenses"
        ).fetchall()
        payments = connection.execute(
            "SELECT payer_id, target_user_id FROM settlements"
        ).fetchall()
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []

    for row in expenses:
        assert row["payer_id"] in user_ids
        if row["target_ids"] is not None:
            assert set(json.loads(row["target_ids"])) <= user_ids
    for row in payments:
        assert row["payer_id"] in user_ids
        assert row["target_user_id"] in user_ids
