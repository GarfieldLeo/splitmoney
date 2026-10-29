# F04 — Balances, payments, and settlement editor

## Progress

This section is the authoritative implementation and verification record for F04. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Implemented the Overview balances dashboard and Payments CRUD/review editor against the live API. The focused real-backend browser suite passes all ten scenarios, including the primary balance journey, payment review/CRUD, network handling, refresh coalescing, user switching, and 320px layout.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

- Added the Overview balance summary, complete group component breakdown, live suggestions, and review-only payment form in app/static/js/overview.js; added responsive styles in app/static/overview.css.
- Added recorded payment list/create/edit/delete, exact-string validation, self-payment checks, refresh/retry handling, pending write locks, and reusable suggestion editor in app/static/js/settlements.js; added responsive styles in app/static/settlements.css.
- Added real-backend browser coverage in tests/browser/balances-and-payments.spec.js for the Q02 step-7 balances, suggestion cancel/record, manual overpayment, edit/delete reversals, validation, refresh preservation/coalescing, pending saves, ambiguous writes, switching users, empty state, and 320px layout.
- Q03's touch-target audit raised `.settlement-action` from a 42px to 44px minimum. Q03's final browser matrix will verify the rendered size; this CSS adjustment has not yet been measured in-browser.
- Q03's contrast review moved payment dates and Overview component labels/kickers to the shared muted token; final browser review remains pending.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/balances-and-payments.spec.js tests/browser/qa-regression.spec.js --workers=1 --reporter=line --output /tmp/splitmoney-qa-f04`; after fix, QA regression `-g 'group balance labels' --output /tmp/splitmoney-qa-group-cents` | Chromium, isolated live API and temporary SQLite files; injected large aggregate balance | **Initial:** 14 passed, 1 failed: group labels rounded `100000000000000.01` to `.02`. **After correction:** focused group-label regression passed. All 10 F04 scenarios passed, including personal receive/pay wording, payment direction, review/cancel, overpayment, refresh and pending locks. |
| 2026-10-29 | node --check app/static/js/overview.js && node --check app/static/js/settlements.js && node --check tests/browser/balances-and-payments.spec.js | Node.js module syntax checks | Passed. |
| 2026-10-29 | npx playwright test tests/browser/balances-and-payments.spec.js (initial run) | Chromium; isolated FastAPI server and temporary SQLite database per browser test | 7 passed, 2 failed. One assertion targeted the wrong heading semantics and one fixture username exceeded the 40-character limit; corrected both. |
| 2026-10-29 | npx playwright test tests/browser/balances-and-payments.spec.js (overlapped F03 browser run) | Chromium; four F04 workers plus a concurrent four-worker F03 run | Run was stopped after all nine cases hit app-server teardown timeouts under browser contention. One broad accessible-label selector collision found in the 320px test was scoped to the editor. Final serial rerun remains. |
| 2026-10-29 | npx playwright test tests/browser/balances-and-payments.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-f04-final-rerun | Chromium; isolated FastAPI server and temporary SQLite database per browser test | 10 passed. The first serial run had 9 pass and one incorrect recipient expectation in the mobile suggestion test; corrected it and reran all ten successfully. Covers the exact +$15/+15/-$30 fixture, canceled and recorded suggestions, settled state, manual overpayment, edit/delete reversals, invalid/self payment, external refresh, failed refresh preserving form, foreground/manual request coalescing, accepted and ambiguous write outcomes without replay, pending-action locks after refresh, switching users, empty states, and 320px overflow. |

The final serial focused browser suite and syntax checks passed. Earlier assertion/test-contention failures and their corrections are retained above.

### Decisions and deviations

No shared-contract changes were needed. Suggested payments are reloaded before opening the review form, and mutations reload canonical people, recorded payments, and balances. A shared editor is used in both Overview and Payments.

### Remaining work and blockers

No F04 implementation or acceptance work remains. No blocker was identified.

**Next action:** Independent integration review by the coordinator; reopen this step if that review finds a defect.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | In progress | Began F04 after confirming its prerequisites and the shell feature-module contract. |
| 2026-10-29 | In progress | Implemented the two feature modules and responsive styles, added ten real-API browser scenarios, and corrected issues found during initial and contended runs. |
| 2026-10-29 | Complete | Final serial F04 browser suite passed all ten scenarios; feature modules, responsive styles, editor lifecycle protections, and progress evidence are complete. |

## Goal

Explain the current ledger and let people record the real payments that settle it, including editing/deleting recorded payments.

## Prerequisites

F01–F03 and B06–B08.

## Deliverables

`app/static/js/overview.js`, `app/static/js/settlements.js`, and `tests/browser/balances-and-payments.spec.js`.

## Instructions

1. Fetch `/api/balances` and render the selected person's state as "You should receive $X", "You should pay $X", or "You're settled up". Use text/sign labels as well as color. Display total expenses and each user's net in a group breakdown.
2. Provide component details for each person: paid expenses, own expense share, payments sent, and payments received. Label these using the contract names; users should not need to infer ledger sign conventions.
3. Render suggestions as "Cara pays Alice $15.00" with a Record payment action. Loading/viewing a suggestion never records it. A settled group shows a meaningful empty state.
4. Clicking Record payment opens a reviewable form prefilled with sender, recipient, and exact amount; saving calls `POST /api/settlements`. Use plain record-keeping wording, not wording that claims a bank transfer occurred.
5. Support adding a payment manually with selected user as default sender, an explicit recipient, and decimal-string amount. Block self-payment in the UI. Explain that it should represent money already sent.
6. Payments tab lists newest recorded payments with sender, recipient, amount, and date. Implement edit of either person or amount and confirmed delete with the same pending/error behavior as expenses.
7. Refresh balances, suggestions, and recorded payments after every successful mutation. Do not keep a suggestion as a permanent debt record; its amount may change after any expense or payment change.
8. On opening/prefilling a suggestion, refresh balance data if stale and show the current values. Do not silently change a form already being edited. Allow intentional partial payment or overpayment per the API contract.
9. Add an explicit Refresh control and refresh when the page returns to foreground, avoiding overlapping requests and stale render races. If other people changed data, the refreshed view should show it without a page reload. Real-time subscriptions are out of scope.

## Verification and acceptance

- The primary Q02 fixture shows Alice receive `$15`, Bob receive `$15`, Cara pay `$30` after Bob's partial payment.
- Suggested-payment action opens a form; cancel leaves the ledger unchanged; save records exactly one payment.
- After recording all suggestions, all people show zero and the suggestion list is empty.
- Edit and delete a payment; balances revert correctly. Manual overpayment is accepted and the direction of the resulting credit/debt is displayed correctly.
- One-user and empty-expense states are understandable; network error shows retry while preserving any active form.
- Switching users changes the personal summary but never changes group data.
- No stale dashboard remains after people, expense, or payment mutations.
