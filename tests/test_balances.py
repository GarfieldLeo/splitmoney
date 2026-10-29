"""Acceptance and invariant coverage for the pure balance calculation module."""

from __future__ import annotations

import random
from uuid import UUID

import pytest

from app.balances import (
    ExpenseInput,
    SettlementInput,
    combine_balances,
    expense_contributions,
    settlement_contributions,
    split_cents,
    suggest_payments,
)


def uid(number: int) -> str:
    return str(UUID(int=number))


ALICE, BOB, CARA, DANA = (uid(number) for number in range(1, 5))
THREE_USERS = [ALICE, BOB, CARA]


def calculate(users, expenses=(), settlements=()):
    expenses_result = expense_contributions(users, expenses)
    settlements_result = settlement_contributions(users, settlements)
    balances = combine_balances(users, expenses_result, settlements_result)
    return expenses_result, settlements_result, balances


def test_split_cents_assigns_remainder_by_uuid_and_conserves_every_cent():
    participants = [CARA, ALICE, BOB, BOB]
    split = split_cents(1000, participants)
    assert list(split) == [ALICE, BOB, CARA]
    assert list(split.values()) == [334, 333, 333]
    assert sum(split.values()) == 1000
    assert participants == [CARA, ALICE, BOB, BOB]

    split_two_cents = split_cents(2, [CARA, BOB, ALICE])
    assert list(split_two_cents.values()) == [1, 1, 0]
    assert sum(split_two_cents.values()) == 2
    assert split_cents(1, [BOB]) == {BOB: 1}


@pytest.mark.parametrize("total", [0, -1, True, 1.5, "100"])
def test_split_rejects_nonpositive_or_noninteger_cents(total):
    with pytest.raises(ValueError):
        split_cents(total, [ALICE])


def test_split_rejects_empty_participants_and_invalid_uuid():
    with pytest.raises(ValueError, match="empty participant"):
        split_cents(1, [])
    with pytest.raises(ValueError, match="UUID"):
        split_cents(1, ["not-a-uuid"])


def test_no_users_no_records_is_an_empty_zero_sum_ledger():
    expense_values, settlement_values, balances = calculate([], [], [])
    assert expense_values == settlement_values == balances == {}
    assert suggest_payments({}) == []


def test_duplicate_user_ids_are_rejected_after_uuid_canonicalization():
    with pytest.raises(ValueError, match="duplicate user ID"):
        expense_contributions([ALICE, ALICE.upper()], [])
    with pytest.raises(ValueError, match="duplicate user ID"):
        settlement_contributions([ALICE, ALICE], [])


def test_expense_contributions_resolve_everyone_and_deduplicate_explicit_targets():
    everyone = ExpenseInput(payer_id=ALICE, amount_cents=6000)
    expenses, _, balances = calculate(THREE_USERS, [everyone])
    assert [balances[user].net for user in THREE_USERS] == [4000, -2000, -2000]
    assert sum(value.money_in for value in expenses.values()) == 6000

    explicitly_empty = ExpenseInput(payer_id=ALICE, amount_cents=3, target_user_ids=[])
    empty_targets, _, empty_target_balances = calculate(THREE_USERS, [explicitly_empty])
    assert [empty_targets[user].money_in for user in THREE_USERS] == [1, 1, 1]
    assert sum(value.money_in for value in empty_targets.values()) == 3
    assert sum(value.net for value in empty_target_balances.values()) == 0

    repeated_targets = ExpenseInput(
        payer_id=CARA,
        amount_cents=1200,
        target_user_ids=[BOB, ALICE, BOB],
    )
    targeted, _, targeted_balances = calculate(THREE_USERS, [repeated_targets])
    assert targeted[ALICE].money_in == targeted[BOB].money_in == 600
    assert targeted[CARA].money_in == 0
    assert [targeted_balances[user].net for user in THREE_USERS] == [-600, -600, 1200]


def test_alice_bob_cara_contract_sequence_and_payment_direction():
    first_expense = ExpenseInput(payer_id=ALICE, amount_cents=6000)
    second_expense = ExpenseInput(payer_id=BOB, amount_cents=3000)
    expenses, settlements, balances = calculate(
        THREE_USERS, [first_expense, second_expense]
    )
    assert [balances[user].net for user in THREE_USERS] == [3000, 0, -3000]
    assert [expenses[user].money_out for user in THREE_USERS] == [6000, 3000, 0]
    assert sum(value.money_in for value in expenses.values()) == 9000
    assert settlements == {user: settlements[user] for user in THREE_USERS}

    payment = SettlementInput(payer_id=BOB, target_user_id=ALICE, amount_cents=1500)
    expenses_after_payment, settlement_values, balances_after_payment = calculate(
        THREE_USERS, [first_expense, second_expense], [payment]
    )
    assert [balances_after_payment[user].net for user in THREE_USERS] == [1500, 1500, -3000]
    assert settlement_values[BOB].money_out == 1500
    assert settlement_values[ALICE].money_in == 1500
    assert sum(value.money_out for value in settlement_values.values()) == 1500
    assert sum(value.money_in for value in settlement_values.values()) == 1500

    payments = suggest_payments(
        {user: balances_after_payment[user].net for user in THREE_USERS}
    )
    assert [(item.from_user_id, item.to_user_id, item.amount_cents) for item in payments] == [
        (CARA, ALICE, 1500),
        (CARA, BOB, 1500),
    ]
    assert sum(value.money_in for value in expenses_after_payment.values()) == 9000


def test_payer_excluded_from_explicit_targets_gets_full_credit_and_no_share():
    expense = ExpenseInput(
        payer_id=CARA,
        amount_cents=10001,
        target_user_ids=[BOB, ALICE],
    )
    expenses, _, balances = calculate(THREE_USERS, [expense])
    assert expenses[CARA].money_out == 10001
    assert expenses[CARA].money_in == 0
    assert expenses[ALICE].money_in == 5001
    assert expenses[BOB].money_in == 5000
    assert sum(value.net for value in balances.values()) == 0


def test_isolated_zero_users_ties_and_multiple_debtors_and_creditors_are_stable():
    nets = {DANA: 0, CARA: -400, BOB: 200, ALICE: 200}
    original = dict(nets)
    payments = suggest_payments(nets)
    assert nets == original
    assert [(p.from_user_id, p.to_user_id, p.amount_cents) for p in payments] == [
        (CARA, ALICE, 200),
        (CARA, BOB, 200),
    ]
    assert all(p.amount_cents > 0 and p.from_user_id != p.to_user_id for p in payments)
    assert suggest_payments({ALICE: 0, BOB: 0}) == []

    multiple = suggest_payments(
        {ALICE: -500, BOB: -250, CARA: 600, DANA: 150}
    )
    assert [(p.from_user_id, p.to_user_id, p.amount_cents) for p in multiple] == [
        (ALICE, CARA, 500),
        (BOB, CARA, 100),
        (BOB, DANA, 150),
    ]


def test_partial_settlement_overpayment_and_already_settled_totals():
    expense = ExpenseInput(payer_id=BOB, amount_cents=1000)
    partial = SettlementInput(payer_id=ALICE, target_user_id=BOB, amount_cents=200)
    _, _, partial_balances = calculate([ALICE, BOB], [expense], [partial])
    assert [partial_balances[user].net for user in [ALICE, BOB]] == [-300, 300]

    exact = SettlementInput(payer_id=ALICE, target_user_id=BOB, amount_cents=500)
    _, _, zero_balances = calculate([ALICE, BOB], [expense], [exact])
    assert [zero_balances[user].net for user in [ALICE, BOB]] == [0, 0]
    assert suggest_payments({user: balance.net for user, balance in zero_balances.items()}) == []

    overpayment = SettlementInput(payer_id=ALICE, target_user_id=BOB, amount_cents=700)
    _, _, overpaid_balances = calculate([ALICE, BOB], [expense], [overpayment])
    assert [overpaid_balances[user].net for user in [ALICE, BOB]] == [200, -200]
    overpayment_suggestions = suggest_payments(
        {user: balance.net for user, balance in overpaid_balances.items()}
    )
    assert [(p.from_user_id, p.to_user_id, p.amount_cents) for p in overpayment_suggestions] == [
        (BOB, ALICE, 200)
    ]


def test_expense_and_settlement_references_are_validated():
    with pytest.raises(ValueError, match="unknown payer"):
        expense_contributions([ALICE], [ExpenseInput(BOB, 100)])
    with pytest.raises(ValueError, match="unknown target"):
        expense_contributions([ALICE], [ExpenseInput(ALICE, 100, [BOB])])
    with pytest.raises(ValueError, match="unknown payer"):
        settlement_contributions([ALICE, BOB], [SettlementInput(CARA, ALICE, 100)])
    with pytest.raises(ValueError, match="unknown recipient"):
        settlement_contributions([ALICE, BOB], [SettlementInput(ALICE, CARA, 100)])
    with pytest.raises(ValueError, match="must differ"):
        settlement_contributions([ALICE], [SettlementInput(ALICE, ALICE, 100)])
    with pytest.raises(ValueError, match="positive"):
        expense_contributions([ALICE], [ExpenseInput(ALICE, 0)])
    with pytest.raises(ValueError, match="positive"):
        settlement_contributions([ALICE, BOB], [SettlementInput(ALICE, BOB, -1)])


@pytest.mark.parametrize(
    "nets",
    [
        {ALICE: 1, BOB: 0},
        {ALICE: True, BOB: -1},
        {ALICE.upper(): 1, ALICE: -1},
    ],
)
def test_suggest_payments_rejects_invalid_or_nonconserving_nets(nets):
    with pytest.raises(ValueError):
        suggest_payments(nets)


def test_combine_balances_rejects_missing_or_nonconserving_contributions():
    expenses = expense_contributions([ALICE, BOB], [ExpenseInput(ALICE, 100)])
    settlements = settlement_contributions([ALICE, BOB], [])
    with pytest.raises(ValueError, match="missing expense contributions"):
        combine_balances([ALICE, BOB], {ALICE: expenses[ALICE]}, settlements)
    with pytest.raises(ValueError, match="do not conserve"):
        combine_balances(
            [ALICE, BOB],
            {ALICE: expenses[ALICE], BOB: type(expenses[BOB])(money_out=1)},
            settlements,
        )


def test_generated_ledgers_are_deterministic_immutable_and_fully_conserved():
    rng = random.Random(20261029)

    for _ in range(100):
        users = [uid(index + 1) for index in range(rng.randint(1, 7))]
        expenses = []
        for _ in range(rng.randint(0, 10)):
            roll = rng.randrange(3)
            if roll == 0:
                targets = None
            elif roll == 1:
                targets = []
            else:
                targets = rng.sample(users, rng.randint(1, len(users)))
            expenses.append(
                ExpenseInput(
                    payer_id=rng.choice(users),
                    amount_cents=rng.randint(1, 100_000),
                    target_user_ids=targets,
                )
            )

        settlements = []
        if len(users) > 1:
            for _ in range(rng.randint(0, 8)):
                payer, recipient = rng.sample(users, 2)
                settlements.append(
                    SettlementInput(payer, recipient, rng.randint(1, 100_000))
                )

        original_users = list(users)
        original_expenses = [
            (item.payer_id, item.amount_cents, None if item.target_user_ids is None else tuple(item.target_user_ids))
            for item in expenses
        ]
        original_settlements = list(settlements)

        expense_values, settlement_values, balances = calculate(users, expenses, settlements)
        repeated = calculate(users, expenses, settlements)
        assert repeated == (expense_values, settlement_values, balances)
        assert users == original_users
        assert [
            (item.payer_id, item.amount_cents, None if item.target_user_ids is None else tuple(item.target_user_ids))
            for item in expenses
        ] == original_expenses
        assert settlements == original_settlements

        expected_expenses = sum(item.amount_cents for item in expenses)
        expected_settlements = sum(item.amount_cents for item in settlements)
        assert sum(item.money_out for item in expense_values.values()) == expected_expenses
        assert sum(item.money_in for item in expense_values.values()) == expected_expenses
        assert sum(item.money_out for item in settlement_values.values()) == expected_settlements
        assert sum(item.money_in for item in settlement_values.values()) == expected_settlements
        assert sum(item.net for item in balances.values()) == 0

        nets = {user: balance.net for user, balance in balances.items()}
        original_nets = dict(nets)
        payments = suggest_payments(nets)
        assert nets == original_nets
        assert payments == suggest_payments(nets)
        settled = dict(nets)
        for payment in payments:
            assert payment.amount_cents > 0
            assert payment.from_user_id != payment.to_user_id
            assert settled[payment.from_user_id] < 0
            assert settled[payment.to_user_id] > 0
            settled[payment.from_user_id] += payment.amount_cents
            settled[payment.to_user_id] -= payment.amount_cents
        assert all(net == 0 for net in settled.values())
