# B03 — SQLite tables and transaction helpers

## Progress

This section is the authoritative implementation and verification record for B03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Added the three-table SQLite schema, non-destructive startup initialization, per-operation read/write transaction contexts, UUID/timestamp and target JSON helpers, and isolated persistence tests. All 7 B03 tests and all 92 repository tests pass.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Added the exact three-table schema and indexes in `app/schema.sql`; connection, initialization, UUID, timestamp, and target JSON helpers in `app/db.py`; startup lifecycle wiring in `app/main.py`; and schema package-data configuration in `pyproject.toml`. Added constraint, transaction rollback, connection configuration/closure, repeated-startup persistence, database isolation, and helper tests in `tests/test_db.py`. Updated `README.md` to clarify that future schema changes require an explicit migration or deliberate reset.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_db.py` | Project `.venv`, Python 3.11.6, SQLite through stdlib `sqlite3`; temporary file databases | **Passed:** 7 tests. Covers idempotent app startup and retained data, exactly three application tables, relational and CHECK constraints, target JSON check, full rollback, per-connection foreign keys and busy timeout, closed connections, isolated paths, UUID/timestamp helpers, and canonical target JSON helpers. One Starlette deprecation warning from `TestClient` using `httpx`. |
| 2026-10-29 | `.venv/bin/python -m pytest` | Same environment; all repository tests | **Passed:** 92 tests. One Starlette deprecation warning from `TestClient` using `httpx`. An earlier full-suite run had 90 pass and 2 B01 static-serving failures while `app/static/index.html` was temporarily absent during parallel F01 work; F01 restored the file and this final run passed. |
| 2026-10-29 | Initial `.venv/bin/python -m pytest tests/test_db.py` | Same environment | **Failed during test development:** a uniqueness assertion used a display-like `ALICE` value as the persisted key even though the schema uniquely constrains the normalized key. The test fixture was corrected to insert the same key, and the final B03 run above passed. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_db.py tests/test_qa_regression.py -q`; direct exception rollback and target JSON round-trip probes | Project `.venv`, temporary SQLite files; snapshot test uses WAL to permit concurrent commit | **Passed:** 8 tests. The reader retained its initial snapshot across a writer commit, and a new reader saw the commit. A raised exception rolled back a write. Reviewed lifecycle persistence, constraints, foreign-key and timeout settings, and helper behavior. One Starlette deprecation warning. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

No shared contract deviations. The initial schema uses SQLite JSON1 `json_valid` and `json_type` checks, available in the tested Python 3.11 runtime. Initialization only creates absent objects; future schema changes require an explicit migration or a deliberate data reset, documented in `README.md`.

### Remaining work and blockers

No B03 work remains. The `main.py` lifespan initializes the configured path on each application startup and preserves data across app closure/reopen.

**Next action:** B04 can register the user routes and use the exported connection and helper interfaces.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Confirmed B01 and B02 are complete and began B03 implementation. |
| 2026-10-29 | Complete | Added schema, transaction helpers, startup integration, target JSON helpers, package data, reset/migration guidance, and 7 persistence tests. Required B03 tests passed, and the final full suite passed with 92 tests. |

## Goal

Create the three tables and reliable database primitives with isolated tests and safe rollback behavior.

## Prerequisites

B01–B02. Use the table definitions in the shared contract.

## Deliverables

`app/db.py`, `app/schema.sql`, database initialization in the app lifespan, and `tests/test_db.py`.

## Instructions

1. Initialize the schema idempotently on startup; create the configured database's parent directory when needed. Use explicit schema SQL with `CREATE TABLE IF NOT EXISTS`, indexes, and check constraints.
2. Use stdlib `sqlite3`, parameterized SQL, `sqlite3.Row`, foreign keys enabled on **every** connection, and a bounded busy timeout. Use one connection per operation/request; do not share one connection across request threads. Synchronous FastAPI route functions are suitable here.
3. Add a context manager for reads and an explicit write transaction context (`BEGIN IMMEDIATE`) that commits once on success, rolls back on exception, and always closes. Reference validation and the associated write must share this transaction to avoid delete/create races.
4. Serialize `target_ids` as JSON arrays of canonical UUIDs or SQL NULL. Add a JSON validity/array check if supported by the chosen SQLite runtime; retain application reference checks regardless.
5. Restrict relational deletes instead of cascading away history. Target-array and everyone-membership restrictions will be enforced in user service code.
6. Add helpers for UUID creation and UTC timestamp formatting. Creating a record should use the same timestamp value for its created/modified fields.
7. Keep initialization non-destructive. Do not introduce a public reset endpoint; the manual reset procedure belongs in README.

## Tests and acceptance

- Startup twice preserves existing data and does not create extra application tables.
- Foreign key, positive-amount, unique username-key, and distinct settlement participant constraints work.
- A failed multi-statement write rolls back the entire transaction.
- Connections enforce foreign keys consistently and release file handles after use.
- Independent temporary databases do not leak users or records to each other.
- Tests verify data survives closing and reopening an app with the same file.
- `python -m pytest tests/test_db.py` passes.

## Boundary

No HTTP CRUD yet. No migration framework is necessary for this initial empty database; document that later schema changes require an explicit migration or deliberate reset.
