# Q01 — Deterministic fixtures and cross-feature API regression

## Progress

This section is the authoritative implementation and verification record for Q01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Added deterministic fixture data and isolated cross-feature HTTP workflows. The full backend suite passes 149 tests, including the independent QA run; Q03 links this evidence instead of repeating it.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

- Added [ledger.json](../../tests/fixtures/ledger.json) with the contract's fixed Alice, Bob, Cara, and Dan UUIDs.
- Added `ledger_fixture_data` and `seed_ledger_users` fixtures in [conftest.py](../../tests/conftest.py). Fixed IDs enter tests only through this explicit database seeder; HTTP-created users are identified from response IDs.
- Added [test_ledger_workflows.py](../../tests/test_ledger_workflows.py) covering the full Q02 numerical sequence through HTTP, selected targets and payer exclusion, future-member everyone splits, UUID-ordered odd cents, rename references, payment deletion and overpayment, error atomicity, persistence and database isolation, GET side effects, simultaneous login, and concurrent write/delete integrity.
- Used a temporary SQLite path in every workflow; the API continues generating primary keys.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_ledger_workflows.py tests/test_balances_api.py tests/test_users_api.py -q` | Project Python 3.11 virtual environment; each API fixture uses a temporary SQLite file | 31 passed. |
| 2026-10-29 | `.venv/bin/python -m pytest -q` | Project Python 3.11 virtual environment; full test suite | 149 passed, 1 Starlette/httpx deprecation warning. An earlier run exposed a test assumption about which concurrent login spelling wins; the assertion now uses the canonical returned username, and the rerun passed. |
| 2026-10-29 | `git diff --check` | Working tree | Passed with no whitespace errors. |
| 2026-10-29 | Initial `python -m pytest tests/test_ledger_workflows.py -q` | Shell default Python 3.9.7 | Could not import the app because the repository requires Python 3.11+ (`datetime.UTC`); reran with the project's `.venv` Python 3.11. |
| 2026-10-29 | Independent QA: `uv venv /tmp/splitmoney-q01-qa-venv --python 3.11`; `uv pip install --python /tmp/splitmoney-q01-qa-venv/bin/python -r requirements.lock`; `/tmp/splitmoney-q01-qa-venv/bin/python -m pytest -q` | Fresh Python 3.11.6 environment installed from lock; isolated temporary databases | **Passed:** 149 tests; one Starlette deprecation warning. Reviewed fixture isolation, integer-cent conservation, explicit sender/recipient assertions, read side effects, persistence, and concurrency tests. |

No browser checks were run; those belong to Q03. The optional local demo seed script was omitted.

### Decisions and deviations

- No shared contract changes were needed. Existing entity tests already cover single-route validation and CRUD; this step concentrates on cross-feature HTTP outcomes.
- The optional `scripts/seed_demo.py` deliverable was omitted because it is not required for the automated QA step. API workflow tests seed their own temporary files, so a persistent local database seed command would add an unrelated entry point.

### Remaining work and blockers

No Q01 implementation or acceptance work remains; independent QA passed.

**Next action:** Proceed to Q02 and Q03.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Confirmed B01–B08 prerequisites and reviewed the shared contract, Q02 numerical sequence, and existing API tests. Starting isolated fixture and workflow implementation. |
| 2026-10-29 | Complete | Added fixture helpers and cross-feature workflows; focused suite passed (31 tests), full suite passed (149 tests), and `git diff --check` passed. Ready for independent review. |

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
