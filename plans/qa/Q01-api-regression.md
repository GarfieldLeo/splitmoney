# Q01 — Deterministic fixtures and cross-feature API regression

## Progress

This section is the authoritative implementation and verification record for Q01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After the backend track, create isolated deterministic fixtures and the primary API workflow test.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Test complete ledger behavior across modules using reusable, isolated data, beyond the per-step unit tests.

## Prerequisites

B01–B08. Read the shared contract and the numerical scenarios in Q02. Frontend is not required for this step.

## Deliverables

`tests/fixtures/ledger.json`, shared seed helpers in `tests/conftest.py`, `tests/test_ledger_workflows.py`, and an optional `scripts/seed_demo.py` for local UI QA.

## Fixture design

Use deterministic UUIDs in pure/DB tests so remainder and tie-order expectations are exact:

| Person | UUID | Phone |
| --- | --- | --- |
| Alice | `00000000-0000-0000-0000-000000000001` | null |
| Bob | `00000000-0000-0000-0000-000000000002` | null |
| Cara | `00000000-0000-0000-0000-000000000003` | null |
| Dan (membership scenario only) | `00000000-0000-0000-0000-000000000004` | null |

Integration tests using HTTP creation must map names to the UUIDs returned by the API; production APIs must not accept client-chosen primary keys just for tests. Calculate tied transfer ordering using the returned IDs. Keep fixture notes clear about which tests use seeded IDs and which use generated IDs.

## Instructions

1. Add a helper to create a temporary SQLite database, start the app, and create people/expenses/payments from a scenario. Every test receives independent state; never reset the developer's default database.
2. Add the primary Q02 sequence as one workflow test, asserting balances after every mutation. Assert exact strings and sender/recipient IDs, not merely response status.
3. Add independent tests for selected-person splits, excluded payer, dynamic everyone membership, odd cents, rename, blocked deletion, payment reversal, and overpayment.
4. Verify all error paths leave table counts and previous balances unchanged. Include a failing PATCH whose amount is valid but participant is invalid, and a user rename collision.
5. Verify persistence by stopping/recreating the app on the same temporary file. Verify a second temporary file starts empty.
6. Add a read-side-effect check: GET list/detail/balances calls cannot change records, timestamps, or payment counts.
7. Add a small simultaneous-login test and a write-integrity test checking that final records reference only existing users under concurrent operations. Avoid timing-dependent expected winners; either permitted ordering is acceptable, dangling references are not.
8. If adding a demo seed script, require an explicit non-default target database path, refuse to seed a nonempty DB, and print what was created. Do not silently erase data. Include a restart/reload instruction for a running app.

## Acceptance and evidence

- `python -m pytest` passes from a clean environment.
- No test depends on wall-clock sleeps, list ordering not specified by the contract, or state left by another test.
- Conservation assertions use integer cents: sums of shares equal totals, sum of nets is zero, applying suggestions zeros all nets.
- Record the command, environment, and actual result in this step's Progress → Verification evidence section during execution; leave unexecuted checks explicitly marked as not run.

## Boundary

This step does not replace browser verification. No real phone numbers, external accounts, or payment service integrations are needed.
