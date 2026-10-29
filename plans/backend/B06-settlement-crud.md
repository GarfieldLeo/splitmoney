# B06 — Settlement CRUD

## Progress

This section is the authoritative implementation and verification record for B06. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After B01–B05, implement settlement services and participant validation with API tests.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
