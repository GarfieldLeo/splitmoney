# B04 — User CRUD and username login

## Progress

This section is the authoritative implementation and verification record for B04. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** User service and `/api/login`/user CRUD routes are implemented and registered. Focused B04 coverage and the full repository suite pass.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented the user service, API routes, package initializers, route registration in `app/main.py`, and 19 API tests. Login and direct creation share the contract's normalized username key; login preserves the existing display name and uses a write transaction. User deletion checks expense payers, explicit target JSON, everyone expenses (including a stored empty target array), and both settlement participants in one write transaction. Rename changes only the user row.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_users_api.py` | Project `.venv`, Python 3.11.6, file-backed temporary SQLite DBs via app fixture | **Passed:** 19 tests. Covers user CRUD and public fields, phone cleanup, stable ordering, case/padding-insensitive login, concurrent same-name login, direct duplicate and rename conflicts, invalid payload/path validation envelope, missing IDs, all six deletion protections, UUID reference preservation on rename, and deletion without collateral row removal. One Starlette `httpx` deprecation warning. |
| 2026-10-29 | `.venv/bin/python -m pytest` | Project `.venv`, Python 3.11.6, all repository tests | **Passed:** 112 tests. Includes B04 routes registered in the real app factory and the existing DB, health, money, validation, balance, and regression tests. One Starlette `httpx` deprecation warning. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_users_api.py -q` and concurrent Unicode login/API probes | Project `.venv`, file-backed temporary database; 16 concurrent `Straße`/`STRASSE` variants | **Passed:** 19 tests; logins converged on one UUID, duplicate direct creation returned 409, and uppercase UUID paths worked for read, rename, and delete. Reviewed atomic reference checks, empty-array everyone protection, and UUID-preserving rename. One Starlette deprecation warning. |

The tests run in this environment are recorded above; the deprecation warning is from Starlette's use of `httpx` in `TestClient`.

### Decisions and deviations

No contract deviation. A stored empty target array is treated as an everyone expense during deletion checks, consistent with the contract's null-or-empty semantics and the DB helper's decoding behavior.

### Remaining work and blockers

No B04 work remains. B01–B03 prerequisites are complete, and the focused plus full test commands passed.

**Next action:** B05 can build on the registered router and user schema.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Added service/routes, app router registration, and API coverage; focused tests passed. Final verification found the stored `[]` everyone edge case, which was fixed and covered by a regression test. |
| 2026-10-29 | Complete | Focused B04 suite passed 19 tests and full repository suite passed 112 tests. |

## Goal

Create and maintain people, return the same person for case-insensitive login, and protect records from unsafe user deletion.

## Prerequisites

B01–B03.

## Deliverables

`app/services/users.py`, `app/routes/users.py`, `tests/test_users_api.py`, and router registration.

## Instructions

1. Implement list/get/create/patch/delete services and the user routes from the shared contract. Return only public user fields; never expose `username_key` as an editable API property.
2. Implement `POST /api/login`: normalize the name, look up its key, return that existing record, or create a UUID user with null phone. Do not change display casing on a login lookup.
3. Perform lookup/create atomically and handle uniqueness conflicts so two logins using the same normalized name converge on one user. A duplicate direct `POST /users` instead returns `409 username_taken`.
4. Rename only the user row. Existing records reference UUIDs and should display the current name when fetched in later steps. A no-op rename to the user's own normalized key is allowed.
5. Before deleting, check payer/explicit target expense references and both settlement participant columns. Also block deletion if any everyone expense exists. Execute check and delete in one write transaction. Parse target JSON for membership; never use substring matching.
6. Return `404 user_not_found` for a missing ID and `409 user_in_use` for protected deletes. Keep list sorting stable as defined by the contract.

## API tests and acceptance

- Full user CRUD, optional phone cleanup, invalid input, missing IDs, duplicate names, and rename conflicts.
- `Alice`, ` alice `, and `ALICE` login return the same UUID and unchanged display name.
- Repeated logins and two concurrent same-name logins leave one user. Tests use a file-backed test database rather than a separate in-memory database per connection.
- Directly seed expenses/settlements to test deletion protections before their endpoints exist: payer, explicit target, sender, recipient, and membership under everyone expenses.
- A user with no relevant references can be deleted; no rows disappear implicitly.
- After user rename, UUID references in seeded records remain intact.
- `python -m pytest tests/test_users_api.py` passes.
