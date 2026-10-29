# B06 — Settlement CRUD

## Progress

This section is the authoritative implementation and verification record for B06. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Settlement CRUD is registered and implemented with atomic reference validation, merged PATCH validation, current participant names, and timestamp preservation. Focused and full test suites pass.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

- Added `app/services/settlements.py` with create, list, get, patch, and delete operations, reference validation, transaction handling, cent conversion, and current participant names.
- Added `app/routes/settlements.py` with all five `/api/settlements` routes and registered the router in `app/main.py`.
- Added `tests/test_settlements_api.py` covering CRUD, partial updates, timestamps, current names after rename, invalid references and amounts, self-payment validation, overpayment without expenses, canonical UUID path parsing, list order, and both user deletion restrictions.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `python -m pytest tests/test_settlements_api.py` | Default Python 3.9.7; project requires Python >=3.11 | Could not load the app because `typing.TypeAlias` is unavailable in this interpreter; no tests collected. |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_settlements_api.py` | Project virtualenv, Python 3.11.6 | Passed: 10 tests. One Starlette deprecation warning from the installed `httpx` test client. |
| 2026-10-29 | `.venv/bin/python -m pytest` | Project virtualenv, Python 3.11.6 | Passed: 137 tests, including settlement, expense, user, database, validation, and balance tests. One Starlette deprecation warning from the installed `httpx` test client. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_settlements_api.py -q` and direct API sequence | Project `.venv`, temporary file-backed database | **Passed:** 10 tests; independent sequence confirmed sender/recipient direction, maximum payment with no debt, atomic rejection of both one-sided self-payment patches, deletion protection for both participants, and current sender name after rename. Reviewed merged validation and reference checks within the write transaction. One Starlette deprecation warning. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

None yet. Record the reason for any change to this plan and update the shared contract if cross-feature behavior changes.

### Remaining work and blockers

No implementation or verification work remains. The configured default shell Python is 3.9.7, but the repository virtualenv uses the required Python 3.11.6 and passes the full suite.

**Next action:** Independent review and downstream balance/QA integration.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | In progress | Confirmed B01–B05 prerequisites and began B06 implementation. |
| 2026-10-29 | Complete | Implemented and registered settlement CRUD; focused tests passed (10), and the complete suite passed (137). |

## Goal

Store actual payments from one person to another and allow correction or deletion independently of suggested payments.

## Prerequisites

B01–B05.

## Deliverables

`app/services/settlements.py`, `app/routes/settlements.py`, `tests/test_settlements_api.py`, and route registration.

## Instructions

1. Implement all five settlement CRUD routes. `payer_id` is the person who **sent** money; `target_user_id` is the recipient. Keep those meanings consistent in service names, responses, and tests.
2. Validate both users exist, differ, and the amount is positive. Persist cents, UUID, and UTC timestamps using the common helpers and write transaction.
3. For partial updates, validate the final payer/recipient pair after merging old and new fields; a patch changing only one party may create an invalid self-payment.
4. Return both UUIDs and current usernames. Renames must not rewrite payment history or lose references.
5. Permit partial payments, overpayments, and payments when the current ledger has no debt. Do not query suggested payments as an authorization rule.
6. Apply consistent status codes, missing-record errors, ordering, and timestamp semantics from expense CRUD.

## API tests and acceptance

- Full CRUD; changing sender, recipient, and amount.
- Self-payment rejected on create and on a one-field update that would create it.
- Missing body references return `422 invalid_reference`; missing settlement path IDs return `404 settlement_not_found`.
- Zero/negative/overprecision amounts fail atomically.
- Overpayment and payment with no existing expense are accepted.
- User deletion is blocked for either participant until payments are deleted.
- Current usernames are returned after a rename; created timestamp stays unchanged.
- `python -m pytest tests/test_settlements_api.py` passes.
