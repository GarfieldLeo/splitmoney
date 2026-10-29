# B05 — Expense CRUD

## Progress

This section is the authoritative implementation and verification record for B05. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Expense service and CRUD routes are implemented and registered. All 15 focused API tests and the full 127-test suite pass.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented `app/services/expenses.py` with transactional reference validation, canonical target persistence, current-name response serialization, exact cents conversion, stable list ordering, immutable creation timestamps, and CRUD operations. Added the five `/api/expenses` routes in `app/routes/expenses.py` and registered them in `app/main.py`. Added 15 API tests covering CRUD, target semantics, unknown references, partial and combined edits, current names after rename, timestamps, ordering, validation, boundary amounts, and delete behavior.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_expenses_api.py -q` | Project `.venv`, Python 3.11.6, file-backed temporary SQLite DBs via the shared client fixture | **Passed:** 15 tests. Covers list/create/get/patch/delete, everyone and explicit target semantics, unknown references and atomic failures, patch merging, controlled timestamps, renamed display names, deterministic ordering, amount validation/boundary, and error envelopes. One Starlette `httpx` deprecation warning. |
| 2026-10-29 | `.venv/bin/python -m pytest -q` | Same environment and fixtures; complete repository suite | **Passed:** 127 tests. One Starlette `httpx` deprecation warning. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_expenses_api.py -q` and direct API sequence | Project `.venv`, file-backed temporary SQLite database | **Passed:** 15 tests; independent sequence confirmed uppercase UUID canonicalization, deduplicated explicit targets remaining fixed after a new member, omitted versus null target patches, current name after rename, unchanged creation timestamp, and no partial update for an invalid payer. Reviewed reference checks and writes in the same transaction. One Starlette deprecation warning. |

This table is the authoritative B05 verification summary.

### Decisions and deviations

No shared contract changes or deviations were needed.

### Remaining work and blockers

No B05 work remains. The route registration and endpoint tests passed in the complete repository suite.

**Next action:** B06 can implement settlement CRUD using the same database, schema, and route conventions.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Confirmed the shared contract, prerequisites, and existing DB/schema helpers; began B05 implementation. |
| 2026-10-29 | Complete | Added the expense service and five routes, registered the router, and added 15 API tests. Focused tests passed (15); the full suite passed (127). |

## Goal

Record one payer and an exact USD amount, split with everyone by default or a selected set of people, and support editing/deleting the record.

## Prerequisites

B01–B04.

## Deliverables

`app/services/expenses.py`, `app/routes/expenses.py`, `tests/test_expenses_api.py`, and route registration.

## Instructions

1. Add the five expense CRUD routes. Accept UUIDs in public requests. Store integer cents and canonical target JSON; use existing money/schema helpers.
2. On create, default omitted, null, or empty targets to everyone. For explicit targets, validate every user exists and retain the selected set even if it equals today's full membership. Explicit membership must not grow when a new user joins.
3. Require a valid payer; do not automatically add the payer to explicit targets. Check all references inside the same write transaction as the insert/update.
4. For PATCH, combine stored values with supplied fields and validate the resulting record before writing. Changing only the amount must preserve targets and payer; explicit null targets must reset to everyone.
5. Implement get/list serializers that resolve **current** display names from UUIDs. Avoid a query for every individual target when listing records; fetch the small user map once.
6. Set UUID and timestamps on create; keep created timestamp immutable on update. Sort lists consistently. Read/list/get must not alter timestamps.
7. Return `404 expense_not_found` for missing records, `422 invalid_reference` for unknown body user references, and the shared validation envelope for invalid amounts/fields.

## API tests and acceptance

- Create/get/list/update/delete and empty-list response.
- Omitted/null/empty targets all return null; explicit subsets are canonicalized and preserved.
- Unknown payer/targets fail without inserting or partially changing records.
- Editing payer, targets, and amount individually and together works; omitted and null targets behave differently.
- Renaming a payer or target is reflected in expense responses without changing record IDs.
- Created timestamp remains stable and modified timestamp updates; use a controlled clock if needed rather than flaky sleep assertions.
- Delete returns empty `204`; subsequent get returns `404`.
- Boundary values and duplicate target IDs are covered; amount remains an exact decimal string.
- `python -m pytest tests/test_expenses_api.py` passes.
