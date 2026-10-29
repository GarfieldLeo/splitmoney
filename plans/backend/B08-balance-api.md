# B08 — Database aggregation and balance API

## Progress

This section is the authoritative implementation and verification record for B08. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Not started
- **Last updated:** 2026-10-29
- **Current summary:** Plan written; this step has not been implemented or verified.

### Completion checklist

- [ ] Implement all deliverables and instructions in this step.
- [ ] Execute the required tests and acceptance checks; record actual results below.
- [ ] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

None yet. Record completed sub-tasks and the relevant file paths as implementation proceeds.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| — | Not run | — | No implementation or verification evidence yet. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

None yet. Record the reason for any change to this plan and update the shared contract if cross-feature behavior changes.

### Remaining work and blockers

All implementation and acceptance work described below remains. No blocker has been identified; prerequisites still need to be checked before starting.

**Next action:** After B03–B07, load a consistent database snapshot and connect it to the balance functions.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Expose the current group ledger, calculated from a consistent snapshot of all three tables.

## Prerequisites

B03–B07, including expense and settlement routes for integration tests.

## Deliverables

`app/services/balances.py`, `app/routes/balances.py`, `tests/test_balances_api.py`, and registration of `GET /api/balances`.

## Instructions

1. Implement database-facing functions `query_expense_contributions(connection, users)` and `query_settlement_contributions(connection, users)` that load records once and delegate arithmetic to B07. Keep SQL out of the pure calculation module.
2. Open one explicit read transaction, load users/expenses/settlements through that same connection, and calculate against that snapshot. Do not combine data from three independently timed requests/connections.
3. Combine contribution results, resolve names, format cents as strings, and emit the shared balance response: per-user components, net, total expenses, total recorded settlements, and suggested payments.
4. Return every user, including zero balances. An empty database is a valid response with empty arrays and `"0.00"` totals.
5. Recompute on each GET for this small group; no cache or materialized balance table. GET never inserts suggested payments or updates records.
6. Surface unexpected data-integrity failures through a generic server error and server logs. Do not silently skip invalid records or expose database internals.
7. Keep OpenAPI schemas accurate, especially decimal-string amounts and nullable targets. Document signs and dynamic everyone membership in route descriptions.

## Integration tests and acceptance

- Create all records through HTTP and verify the complete Alice/Bob/Cara sequence in Q02.
- Expense edits/deletes and settlement edits/deletes immediately change balances.
- Add a fourth user after an everyone expense and assert historical shares recalculate; an explicit three-user expense remains limited to those three.
- Rename a user: names change, amounts and UUID relationships do not.
- Two identical GETs return identical data and leave all stored rows/timestamps unchanged.
- Monetary conservation and applying suggestions to zero balances hold on API output, parsed back to cents.
- Empty DB, one user, zero activity, one-cent remainders, payer excluded, and overpayment are covered.
- `python -m pytest` passes for the entire backend suite.
