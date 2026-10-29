# F04 — Balances, payments, and settlement editor

## Progress

This section is the authoritative implementation and verification record for F04. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After F01–F03 and B06–B08, render real balances and add the payment review form.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
