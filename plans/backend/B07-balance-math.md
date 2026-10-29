# B07 — Pure split and debt calculation functions

## Progress

This section is the authoritative implementation and verification record for B07. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Implemented the pure integer-cent split, contribution, balance, and payment suggestion helpers. B07's isolated unit suite passes; the typed interfaces are ready for B08.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented `app/balances.py` with frozen input/result dataclasses, exact equal splitting, validated expense and settlement contributions, balance combination, and deterministic debtor-to-creditor suggestions. Added `tests/test_balances.py` with the listed numeric scenarios and 100 seeded generated ledgers. Interfaces were sent to the root agent for B08 integration.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_balances.py` | macOS, Python 3.11.6; isolated pure unit suite | **Passed:** 20 tests in 0.06 seconds. One pre-existing Starlette/httpx deprecation warning from `fastapi.testclient`; no failures. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_balances.py -q` and direct ledger probe | Project `.venv`; 2-cent split over three people with duplicate targets and a 5-cent overpayment | **Passed:** 20 tests; remainder followed UUID order, overpayment reversed balances, suggested transfers zeroed all nets, and supplied user order was unchanged. One Starlette deprecation warning. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

No contract changes or deviations. B07 uses typed dataclasses for database row adaptation and validates UUIDs, duplicate users, dangling references, and contribution conservation at the pure-function boundary.

### Remaining work and blockers

No remaining B07 implementation or acceptance work. B02's request validators are not imported; the balance module remains independent of FastAPI, SQLite, and unfinished application code.

**Next action:** B08 can adapt database rows into `ExpenseInput` and `SettlementInput`, then pass the returned contribution maps into `combine_balances` and net values into `suggest_payments`.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | In progress | Began the pure module and isolated test suite after reviewing the shared contract and B08 integration requirements. |
| 2026-10-29 | Complete | Implemented the B07 helpers and 20 isolated acceptance/invariant tests; `.venv/bin/python -m pytest tests/test_balances.py` passed. |

## Goal

Implement exact, deterministic calculation functions independent of FastAPI and SQLite.

## Prerequisites

B02 and the balance sections of the shared contract. No running server or database required.

## Deliverables

`app/balances.py` and `tests/test_balances.py`.

## Instructions

1. Define small typed internal structures for user UUIDs, expense inputs, settlement inputs, per-user contributions, and suggested transfers. All money is integer cents.
2. Implement `split_cents(total_cents, participant_ids) -> dict[user_id, cents]`. Deduplicate/sort IDs, distribute the remainder in UUID order, and reject an empty participant set or invalid total. Do not mutate inputs.
3. Implement `expense_contributions(users, expenses)`: initialize every user with zero, resolve everyone targets against supplied current users, then accumulate payer totals and allocated shares. Return each user's expense `money_out` (paid) and `money_in` (share).
4. Implement `settlement_contributions(users, settlements)`: accumulate sender `money_out` (sent) and recipient `money_in` (received). Reject unknown users as an internal data-integrity error instead of silently dropping money.
5. Implement `combine_balances(users, expense_contributions, settlement_contributions)` using `net = paid - share + sent - received`. Retain the component amounts for the public response.
6. Implement `suggest_payments(net_by_user)`: require zero-sum input; sort debtors/creditors using contract order, then run two pointers and return positive transfers. Work on copies; zeros never generate transfers.
7. Document the sign convention in docstrings. The simplification algorithm is deterministic but does not claim globally minimum transfer count.

## Unit test cases

- `1000` cents split across three sorted UUIDs gives `334, 333, 333`; two cents across three gives `1, 1, 0`; both sums are exact.
- One participant, repeated IDs, empty participants, unknown references, and no users/no records.
- One `$60` expense paid by Alice among Alice/Bob/Cara -> nets `+4000, -2000, -2000`.
- Add Bob's `$30` expense for those three -> `+3000, 0, -3000`.
- Bob sends Alice `$15` -> `+1500, +1500, -3000`; suggestion direction is Cara to creditors, never the reverse.
- A payer excluded from explicit targets receives the full expense credit and no share.
- Include isolated zero users, tied balances, multiple debtors/creditors, partial settlements, overpayments, and already settled totals.
- In every valid scenario: shares sum to expenses, all nets sum to zero, applying suggestions zeros every net, and no transfer is zero/negative/self-directed.
- Test generated deterministic small ledgers (seeded standard-library random is sufficient) to check invariants across many combinations; no extra property-testing dependency is required.
- Calling functions twice gives identical results and leaves supplied objects unchanged.

## Acceptance

`python -m pytest tests/test_balances.py` passes without HTTP or database fixtures.
