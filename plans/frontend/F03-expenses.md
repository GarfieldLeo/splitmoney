# F03 — Expense list and editor

## Progress

This section is the authoritative implementation and verification record for F03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After F01–F02 and B05, build the expense list and everyone/selected-target editor.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Make recording and correcting an expense straightforward on a phone, including everyone and explicit-person splits.

## Prerequisites

F01–F02 and B05. Use B08 for live balance refresh when available; the expense flow itself can be completed first.

## Deliverables

`app/static/js/expenses.js`, reusable amount/user-selection components if useful, and `tests/browser/expenses.spec.js`.

## Instructions

1. Show newest expenses first with payer, amount, participant summary, and created date formatted locally. Include loading, no-expenses, and fetch-failure/retry states. Dates are display values; do not send browser-local dates as server timestamps.
2. Provide a prominent Add expense action. Default payer to the selected user, allow any group member as payer, and default the split to Everyone.
3. Separate Everyone from Selected people explicitly. Everyone sends null and shows: "Includes everyone in the group, including people who join later." Selected people uses a labeled checkbox list and requires at least one checked person; do not send an accidental empty array that the API would interpret as everyone.
4. Use a text amount input with `inputmode="decimal"` so the client preserves exact decimal strings. Validate positive dollars and at most two decimals without `parseFloat` arithmetic. Backend errors remain authoritative.
5. Editing must load the stored payer, target mode, selected UUIDs, and exact amount. An explicit set equal to all current users stays explicit. Send a partial PATCH; switching to Everyone sends `target_user_ids: null`.
6. Add delete confirmation showing payer and amount. On successful create/edit/delete, reload expenses and balance data or invalidate the overview cache. Do not optimistically claim a new balance before the API confirms success.
7. Preserve form values on error. Disable pending submit to prevent double taps. If a request's outcome is unknown after a connection drop, instruct the user to check the refreshed list before retrying; do not automatically replay money mutations.
8. Keep forms usable with a phone keyboard. Use accessible field-level validation and a form-level error summary. Route changes must not leave stale async results overwriting the active screen.

## Verification and acceptance

- Record `$60.00` paid by Alice for everyone; list shows the exact amount and Everyone.
- Record an explicit Bob/Cara split excluding the payer, edit only its amount, and confirm targets persist.
- Edit explicit targets to Everyone and back. A zero-selection selected-mode form cannot submit.
- Amounts with three decimals, zero, negative values, and invalid payer references show errors and do not create rows.
- Delete cancellation preserves the record; confirmed delete refreshes totals.
- Simulate server/network failure: inputs remain and no success message appears. Double tap while pending sends one request.
- Long names and many checkboxes fit a 320px layout; labels remain associated with inputs.
