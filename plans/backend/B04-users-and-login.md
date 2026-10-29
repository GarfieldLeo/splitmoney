# B04 — User CRUD and username login

## Progress

This section is the authoritative implementation and verification record for B04. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After B01–B03, implement user services and case-insensitive login with API tests.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
