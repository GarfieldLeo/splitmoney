"""Pure, integer-cent split and balance calculations for Splitmoney.

IDs are UUID strings. Public helpers canonicalize their spelling and order IDs
by UUID value so remainder assignment and payment suggestions are repeatable.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ExpenseInput:
    """An expense record expressed in cents; ``None``/empty targets mean everyone."""

    payer_id: str
    amount_cents: int
    target_user_ids: Sequence[str] | None = None


@dataclass(frozen=True)
class SettlementInput:
    """A recorded payment from ``payer_id`` to ``target_user_id`` in cents."""

    payer_id: str
    target_user_id: str
    amount_cents: int


@dataclass(frozen=True)
class Contribution:
    """Generic movement pair; ``money_out`` and ``money_in`` are nonnegative cents."""

    money_out: int = 0
    money_in: int = 0


@dataclass(frozen=True)
class Balance:
    """Per-user ledger components and net, all in cents.

    Positive ``net`` means the user should receive money; negative ``net``
    means the user should pay. The formula is paid - share + sent - received.
    """

    user_id: str
    expense_paid: int
    expense_share: int
    settlement_sent: int
    settlement_received: int
    net: int


@dataclass(frozen=True)
class SuggestedPayment:
    """A positive suggested transfer from a debtor to a creditor, in cents."""

    from_user_id: str
    to_user_id: str
    amount_cents: int


def _canonical_user_id(user_id: str) -> str:
    if not isinstance(user_id, str):
        raise ValueError("user IDs must be UUID strings")
    try:
        return str(UUID(user_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"invalid user UUID: {user_id!r}") from exc


def _uuid_order(user_id: str) -> int:
    return UUID(user_id).int


def _ordered_unique_ids(user_ids: Iterable[str]) -> list[str]:
    canonical_ids: set[str] = set()
    for user_id in user_ids:
        canonical_ids.add(_canonical_user_id(user_id))
    return sorted(canonical_ids, key=_uuid_order)


def _validated_users(users: Iterable[str]) -> list[str]:
    """Return canonical UUIDs sorted by UUID value; reject duplicate users."""
    result: list[str] = []
    seen: set[str] = set()
    for user_id in users:
        canonical_id = _canonical_user_id(user_id)
        if canonical_id in seen:
            raise ValueError(f"duplicate user ID: {canonical_id}")
        seen.add(canonical_id)
        result.append(canonical_id)
    return sorted(result, key=_uuid_order)


def _validate_cents(amount_cents: int, *, label: str = "amount") -> None:
    if isinstance(amount_cents, bool) or not isinstance(amount_cents, int):
        raise ValueError(f"{label} must be an integer number of cents")
    if amount_cents <= 0:
        raise ValueError(f"{label} must be positive")


def split_cents(total_cents: int, participant_ids: Iterable[str]) -> dict[str, int]:
    """Split positive cents equally, assigning remainders in ascending UUID order.

    Participant IDs are canonicalized, deduplicated, and sorted. This function
    never modifies the supplied iterable and every cent is assigned exactly once.
    """
    _validate_cents(total_cents, label="total_cents")
    participants = _ordered_unique_ids(participant_ids)
    if not participants:
        raise ValueError("cannot split across an empty participant set")

    quotient, remainder = divmod(total_cents, len(participants))
    return {
        user_id: quotient + (1 if index < remainder else 0)
        for index, user_id in enumerate(participants)
    }


def expense_contributions(
    users: Iterable[str], expenses: Iterable[ExpenseInput]
) -> dict[str, Contribution]:
    """Calculate expense cash paid and allocated shares for every current user.

    ``money_out`` is the amount the user paid; ``money_in`` is the user's share
    of the expense benefit. For each expense, paid cents equal allocated cents.
    ``None`` or an empty target list resolves dynamically to all supplied users.
    """
    ordered_users = _validated_users(users)
    known_users = set(ordered_users)
    paid = {user_id: 0 for user_id in ordered_users}
    shares = {user_id: 0 for user_id in ordered_users}

    for expense in expenses:
        if not isinstance(expense, ExpenseInput):
            raise ValueError("expenses must contain ExpenseInput values")
        payer_id = _canonical_user_id(expense.payer_id)
        _validate_cents(expense.amount_cents, label="expense amount")
        if payer_id not in known_users:
            raise ValueError(f"expense references unknown payer: {payer_id}")

        targets = (
            ordered_users
            if expense.target_user_ids is None or len(expense.target_user_ids) == 0
            else _ordered_unique_ids(expense.target_user_ids)
        )
        unknown_targets = [target for target in targets if target not in known_users]
        if unknown_targets:
            raise ValueError(f"expense references unknown target: {unknown_targets[0]}")
        # A no-user ledger can exist, but an expense cannot have zero participants.
        if not targets:
            raise ValueError("cannot allocate an expense without users")

        paid[payer_id] += expense.amount_cents
        for user_id, share_cents in split_cents(expense.amount_cents, targets).items():
            shares[user_id] += share_cents

    return {
        user_id: Contribution(money_out=paid[user_id], money_in=shares[user_id])
        for user_id in ordered_users
    }


def settlement_contributions(
    users: Iterable[str], settlements: Iterable[SettlementInput]
) -> dict[str, Contribution]:
    """Calculate recorded payments sent and received for every current user.

    ``money_out`` is the sender's payment and ``money_in`` is the recipient's
    receipt. Since net is paid - share + sent - received, sending a payment
    raises a debtor's net toward zero and lowers a creditor's net toward zero.
    """
    ordered_users = _validated_users(users)
    known_users = set(ordered_users)
    sent = {user_id: 0 for user_id in ordered_users}
    received = {user_id: 0 for user_id in ordered_users}

    for settlement in settlements:
        if not isinstance(settlement, SettlementInput):
            raise ValueError("settlements must contain SettlementInput values")
        payer_id = _canonical_user_id(settlement.payer_id)
        recipient_id = _canonical_user_id(settlement.target_user_id)
        _validate_cents(settlement.amount_cents, label="settlement amount")
        if payer_id not in known_users:
            raise ValueError(f"settlement references unknown payer: {payer_id}")
        if recipient_id not in known_users:
            raise ValueError(f"settlement references unknown recipient: {recipient_id}")
        if payer_id == recipient_id:
            raise ValueError("settlement payer and recipient must differ")
        sent[payer_id] += settlement.amount_cents
        received[recipient_id] += settlement.amount_cents

    return {
        user_id: Contribution(money_out=sent[user_id], money_in=received[user_id])
        for user_id in ordered_users
    }


def _validated_contributions(
    users: list[str], values: Mapping[str, Contribution], label: str
) -> dict[str, Contribution]:
    if not isinstance(values, Mapping):
        raise ValueError(f"{label} must be a mapping of user IDs to Contribution values")
    normalized: dict[str, Contribution] = {}
    for raw_user_id, contribution in values.items():
        user_id = _canonical_user_id(raw_user_id)
        if user_id in normalized:
            raise ValueError(f"duplicate user ID in {label}: {user_id}")
        if not isinstance(contribution, Contribution):
            raise ValueError(f"{label} values must be Contribution instances")
        for amount in (contribution.money_out, contribution.money_in):
            if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
                raise ValueError(f"{label} amounts must be nonnegative integer cents")
        normalized[user_id] = contribution

    expected = set(users)
    actual = set(normalized)
    if actual != expected:
        missing = sorted(expected - actual, key=_uuid_order)
        extra = sorted(actual - expected, key=_uuid_order)
        details = []
        if missing:
            details.append(f"missing {label} for user {missing[0]}")
        if extra:
            details.append(f"{label} includes unknown user {extra[0]}")
        raise ValueError("; ".join(details))
    return normalized


def combine_balances(
    users: Iterable[str],
    expense_contributions: Mapping[str, Contribution],
    settlement_contributions: Mapping[str, Contribution],
) -> dict[str, Balance]:
    """Combine ledger movements using ``net = paid - share + sent - received``.

    Positive net means the user should receive; negative net means the user
    should pay. Each contribution set must conserve money and include every
    supplied user exactly once.
    """
    ordered_users = _validated_users(users)
    expenses = _validated_contributions(
        ordered_users, expense_contributions, "expense contributions"
    )
    settlements = _validated_contributions(
        ordered_users, settlement_contributions, "settlement contributions"
    )
    if sum(value.money_out for value in expenses.values()) != sum(
        value.money_in for value in expenses.values()
    ):
        raise ValueError("expense contributions do not conserve money")
    if sum(value.money_out for value in settlements.values()) != sum(
        value.money_in for value in settlements.values()
    ):
        raise ValueError("settlement contributions do not conserve money")

    result: dict[str, Balance] = {}
    for user_id in ordered_users:
        expense = expenses[user_id]
        settlement = settlements[user_id]
        net = expense.money_out - expense.money_in + settlement.money_out - settlement.money_in
        result[user_id] = Balance(
            user_id=user_id,
            expense_paid=expense.money_out,
            expense_share=expense.money_in,
            settlement_sent=settlement.money_out,
            settlement_received=settlement.money_in,
            net=net,
        )
    if sum(balance.net for balance in result.values()) != 0:
        raise ValueError("combined balances do not sum to zero")
    return result


def suggest_payments(net_by_user: Mapping[str, int]) -> list[SuggestedPayment]:
    """Return deterministic debtor-to-creditor transfers for a zero-sum ledger.

    Debtors and creditors are ordered by descending outstanding amount, with
    UUID as the tie-breaker. The greedy two-pointer simplification is stable,
    but it does not promise a globally minimum number of transfers. Input
    mappings are copied into local lists and are never changed.
    """
    if not isinstance(net_by_user, Mapping):
        raise ValueError("net_by_user must be a mapping of user IDs to integer cents")

    normalized: dict[str, int] = {}
    for raw_user_id, net_cents in net_by_user.items():
        user_id = _canonical_user_id(raw_user_id)
        if user_id in normalized:
            raise ValueError(f"duplicate user ID in net balances: {user_id}")
        if isinstance(net_cents, bool) or not isinstance(net_cents, int):
            raise ValueError("net balances must be integer cents")
        normalized[user_id] = net_cents
    if sum(normalized.values()) != 0:
        raise ValueError("net balances must sum to zero")

    debtors = [
        [user_id, -net_cents]
        for user_id, net_cents in normalized.items()
        if net_cents < 0
    ]
    creditors = [
        [user_id, net_cents]
        for user_id, net_cents in normalized.items()
        if net_cents > 0
    ]
    debtors.sort(key=lambda item: (-item[1], _uuid_order(item[0])))
    creditors.sort(key=lambda item: (-item[1], _uuid_order(item[0])))

    payments: list[SuggestedPayment] = []
    debtor_index = 0
    creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        debtor_id, debt_cents = debtors[debtor_index]
        creditor_id, credit_cents = creditors[creditor_index]
        amount_cents = min(debt_cents, credit_cents)
        if amount_cents <= 0:  # Defensive guard; zero balances are filtered above.
            raise ValueError("internal payment amount must be positive")
        payments.append(
            SuggestedPayment(
                from_user_id=debtor_id,
                to_user_id=creditor_id,
                amount_cents=amount_cents,
            )
        )
        debtors[debtor_index][1] -= amount_cents
        creditors[creditor_index][1] -= amount_cents
        if debtors[debtor_index][1] == 0:
            debtor_index += 1
        if creditors[creditor_index][1] == 0:
            creditor_index += 1

    if debtor_index != len(debtors) or creditor_index != len(creditors):
        raise ValueError("net balances could not be fully settled")
    return payments
