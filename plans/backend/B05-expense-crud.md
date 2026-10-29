# B05 — Expense CRUD

## Progress

This section is the authoritative implementation and verification record for B05. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After B01–B04, implement expense create/read operations and target validation first.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
