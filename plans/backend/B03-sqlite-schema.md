# B03 — SQLite tables and transaction helpers

## Progress

This section is the authoritative implementation and verification record for B03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After B01–B02, create the SQLite schema and transaction helpers with isolated tests.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
