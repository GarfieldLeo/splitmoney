# F03 — Expense list and editor

## Progress

This section is the authoritative implementation and verification record for F03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Explicit ambiguous-write refresh includes balances. Pending monetary writes disable competing expense/editor actions until canonical refresh completes, preventing an earlier save from replacing a newer draft. Exact-value browser assertions now wait for successful PATCH responses and canonical refresh status, avoiding stale test reads while preserving all expected values.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

- Added lazy-loaded expense list and editor with explicit Everyone/Selected people modes, default selected payer, exact amount validation, partial PATCH payloads, user-facing loading/retry/error states, and stale-context guards in `app/static/js/expenses.js`.
- Added route-scoped responsive styles in `app/static/expenses.css`; the module loads its stylesheet without changing the shared shell.
- Added isolated real-backend browser coverage in `tests/browser/expenses.spec.js` for expense create/list/edit/delete, explicit/everyone semantics, validation, stale users/routes, ambiguous writes, refresh failures, double submission, retry, and 320px layouts.
- Exact-value assertions now await the matching PATCH response and `Expense updated.` after canonical refresh before reading the API. Q03 trace review showed the prior immediate `page.request` could begin during the PATCH; expected amounts and target IDs remain unchanged.
- Locked Add/Edit/Delete and editor controls while a monetary write and its canonical refresh are pending, preventing a delayed response from replacing another in-progress draft.
- Q03's touch-target audit raised `.expense-action` and `.expense-target-choice` from a 42px to 44px minimum; the final mobile Chromium, narrow Chromium, and mobile WebKit checks measured the affected controls at or above 44px.
- Q03's contrast review moved expense dates to the shared muted token and strengthened the keyboard outline on text/select inputs; the final browser checks confirmed a visible 3px solid focus outline, and authored-color contrast ratios were measured above the relevant thresholds.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/people.spec.js tests/browser/expenses.spec.js tests/browser/qa-regression.spec.js tests/browser/unicode-users.spec.js --workers=1 --reporter=line --output /tmp/splitmoney-qa-combined` | Chromium, isolated live API and temporary SQLite files | **Passed:** 28 tests, including the independent pending-expense editor regression and focused recovery tests. Source review confirmed competing actions are locked through canonical refresh. |
| 2026-10-29 | `npx playwright test tests/browser/expenses.spec.js` (first run) | Chromium; isolated FastAPI server and temporary SQLite database per browser test | 8 passed, 1 failed because the test assumed participant labels would be alphabetical; API contract orders them by UUID. Updated the assertion to accept either canonical UUID order. |
| 2026-10-29 | `node --check app/static/js/expenses.js && node --check tests/browser/expenses.spec.js` | Node.js module syntax checks | Passed. |
| 2026-10-29 | `npx playwright test tests/browser/expenses.spec.js` | Chromium; isolated FastAPI server and temporary SQLite database per browser test | 12 passed. Covers the F03 browser scenarios, including explicit targets equal to all current users remaining explicit, amount-only PATCH, future-member Everyone mode, empty-selection rejection, invalid payer response, confirmed/canceled delete, canonical balance refresh failure without duplicate submit, ambiguous POST response without automatic replay, pending double tap, retry, 320px layout, and stale-route protection. |
| 2026-10-29 | `npx playwright test tests/browser/login.spec.js tests/browser/people.spec.js` | Chromium; isolated FastAPI server and temporary SQLite database per browser test | 16 passed, confirming the shared F01/F02 shell and navigation still work. |
| 2026-10-29 | `.venv/bin/python -m pytest -q` | Backend suite | 149 passed; one Starlette/httpx deprecation warning. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/expenses.spec.js --reporter=line --output /tmp/splitmoney-qa-expenses` | Chromium, live API and temporary SQLite databases | **Passed:** 12 tests. Source review found that the ambiguous-write Refresh list path fetches only users and expenses but claims that balances were refreshed. Fix and verify that the message matches the operation. |
| 2026-10-29 | `npx playwright test tests/browser/expenses.spec.js --reporter=line --output=/tmp/splitmoney-qa-f03` | Chromium; isolated FastAPI server and temporary SQLite database per browser test | **Passed:** 12 tests. The ambiguous-write retry regression counts the balances request, forces the first balance read to fail and confirms no success text appears, retries successfully, and confirms the expense POST count remains one. |
| 2026-10-29 | `node --check app/static/js/expenses.js && node --check tests/browser/expenses.spec.js`; `git diff --check` | JavaScript syntax and whitespace checks | Passed. |
| 2026-10-29 | Independent QA: focused expense suite and `npm run test:browser -- tests/browser/qa-regression.spec.js -g 'pending expense' --reporter=line --output /tmp/splitmoney-qa-pending` | Chromium, temporary live API; delayed POST while opening a second draft | **Expense suite passed:** 12 tests including corrected balance refresh. **Pending editor regression failed:** first save completion replaces the view and discards the second draft. |
| 2026-10-29 | Initial Q03 matrix: `npm run test:browser -- --workers=2 --reporter=line --output=/tmp/splitmoney-q03-final` | Narrow Chromium and mobile WebKit; live API, temporary per-test SQLite | **Race failures retained in Q03 history:** exact reads after `Save changes` overlapped PATCH requests. WebKit trace confirmed the external API GET started while the PATCH was still pending; no business value or assertion was weakened. Added matching response and canonical status waits. |
| 2026-10-29 | `npm run test:browser -- tests/browser/expenses.spec.js -g 'records explicit targets|explicit split that currently includes everyone' --project=narrow-chromium --project=mobile-webkit --workers=1 --reporter=line --output=/tmp/splitmoney-q03-race-fix` | Narrow Chromium and mobile WebKit; isolated live API | **Passed:** 4 targeted split-edit cases. Each now awaits PATCH 200 and canonical update announcement before checking exact target IDs and amounts; the final full matrix will cover remaining tests. |
| 2026-10-29 | `npx playwright test tests/browser/expenses.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-f03-final` | Chromium; isolated FastAPI server and temporary SQLite database per browser test | **Passed:** 13 tests. The new pending-write regression confirms Add/Edit/Delete, Amount, and Cancel are disabled until the create plus canonical refresh finish; they re-enable afterward, and the expense appears exactly once. |
| 2026-10-29 | `npx playwright test tests/browser/qa-regression.spec.js -g 'pending expense save' --workers=1 --reporter=line --output=/tmp/splitmoney-f03-qa-final` | Chromium; isolated FastAPI server and temporary SQLite database | **Passed:** 1 QA-owned regression. A blocked create cannot discard or duplicate the existing expense when a competing Add action is unavailable. |
| 2026-10-29 | `node --check app/static/js/expenses.js && node --check tests/browser/expenses.spec.js`; `git diff --check` | JavaScript syntax and whitespace checks | Passed. |

All F03 acceptance and regression checks pass. Earlier F03, F01/F02, and backend results remain recorded above.

### Decisions and deviations

No shared-contract changes were needed. The expense view refreshes balances after successful mutations and on an explicit ambiguous-write refresh. Initial expense loading depends on people and expenses so an unrelated balance-read failure does not block the expense list. An explicit retry reports failure if either the expense or balance read fails.

### Remaining work and blockers

No remaining F03 work or blockers.

**Next action:** None.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Reviewed the shared contract, F01 shell context, API client, existing people module conventions, and isolated browser fixture. Began F03 implementation. |
| 2026-10-29 | Complete | Implemented the Expenses route and styles, added 12 isolated browser scenarios, and verified F03 (12 browser), F01/F02 (16 browser), and backend (149) suites. One initial test assertion incorrectly expected alphabetic participant order; the final suite passes with the API’s documented UUID order. |
| 2026-10-29 | In progress | Independent QA passed the focused suite but reopened the step for an inaccurate balance-refresh confirmation in the ambiguous-write recovery path. |
| 2026-10-29 | Complete | Explicit ambiguous-write refresh now fetches both expenses and balances; the new regression proves failure is reported accurately, later recovery succeeds, and no monetary write is replayed. The isolated F03 browser suite passes 12/12. |
| 2026-10-29 | In progress | Independent QA found that a pending expense save could replace a newer draft. Add/Edit/Delete and editor controls are now locked during monetary writes, and a focused regression checks the lock/re-enable behavior. Browser verification hit a shared `appServer` fixture teardown timeout after normal UI completion; rerun after its signal-exit handling is corrected. |
| 2026-10-29 | Complete | After the shared fixture teardown fix, the focused F03 suite passes 13/13 and the QA-owned pending-save regression passes 1/1. The pending-write lock prevents record/editor changes from replacing a draft through the canonical refresh period. |

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
