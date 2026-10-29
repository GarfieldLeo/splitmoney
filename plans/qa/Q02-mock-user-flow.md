# Q02 — Mock user flow and numerical acceptance script

## Progress

This section is the authoritative implementation and verification record for Q02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Independent QA passed all five live-API journeys, including backend restart and the numerical and mobile viewport scenarios. The remaining error, duplicate-submit, focus, literal-text and long-name checkpoints are covered by independently run feature suites linked below. Physical mobile keyboard coverage remains conditional and unavailable, as tracked in Q03.

### Completion checklist

- [x] Implement the five UI-led journey flows and same-database backend restart support.
- [x] Execute the remaining failure-injection, duplicate-submit, keyboard/focus, literal-text, and long-name checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Added `tests/browser/group-journey.spec.js` with five UI-led flows and API/display assertions after every successful ledger mutation. Extended `tests/browser/fixtures.js` with `appServer.restart()` for a real FastAPI process restart against the existing per-test SQLite file. After correcting accessible locators and the odd-cent settlement expectation, all five flows passed. The primary journey confirmed process restart and persisted selection/records; the remaining flows covered membership/target edits, payments, invalid/duplicate inputs, and mobile layouts.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `node --check tests/browser/group-journey.spec.js && node --check tests/browser/fixtures.js`; targeted `git diff --check` | Local Node.js runtime | Passed; both modules parse and the tracked plan diff has no whitespace errors. Rechecked the fixture after adding signal-aware shutdown. |
| 2026-10-29 | `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-q02-journey-20261029-a` | Isolated Playwright run, interrupted after coordinator announced exclusive browser-test scheduling | Stopped the Q02 Playwright parent process before a test completed. This produced no pass/fail result and is not counted as verification. Rerun with a unique output directory when the coordinator releases the serial browser slot. |
| 2026-10-29 | `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-q02-journey-final-20261029-b` | Chromium; per-test FastAPI server and disposable SQLite; exclusive serial Q02 slot | **0/5 passed.** Test issues: `Paid by` needed an exact accessible-name match; suggestion review uses the `Review suggested payment` heading; the Everyone form hint is hidden in Selected mode. Expected protected-delete HTTP 409 responses were also emitted to the browser console. The odd-cent trace showed UUID-ordered shares/net values matching the contract; no product failure observed. These were corrected in the test. |
| 2026-10-29 | `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-q02-journey-final-20261029-c` | Chromium; per-test FastAPI server and disposable SQLite; exclusive serial Q02 slot | **2/5 passed:** explicit-target/membership and overpayment/deletion. Three remaining test-locator mismatches: primary/odd-cent submission matched suggestion buttons as well as the form submit; mobile expected `Add a payment` rather than `Review suggested payment`. Fixed by matching the submit button exactly and using the review heading. |
| 2026-10-29 | `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-q02-journey-final-20261029-d` | Chromium; isolated FastAPI process and SQLite database per test; exclusive serial slot | **4/5 passed.** Primary journey passed through backend restart and confirmed the same selected UUID, records, totals, and zero nets after reload. Explicit-target/membership, overpayment/deletion, and validation/mobile flows passed, including 390px and 320px no-overflow checks. Odd-cent shares and zero-net result were correct; only the test's fixed `$10.00` settlement-total assertion was wrong. Correct total is `$10.00` less Alice's UUID-assigned share (`$6.66` or `$6.67`). Updated test to assert UUID-derived expected transfer amounts and exact cumulative totals. |
| 2026-10-29 | `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-q02-journey-final-20261029-e` | Chromium; isolated FastAPI process and SQLite database per test; exclusive serial slot | **5/5 passed in 12.3s.** Exact UUID-derived odd-cent transfer totals and every intermediate net/count passed. Primary restart/persistence, target/membership edits, overpayment/deletion safety, validation, and 390px/320px no-overflow flows all passed. Test traces and `browser-errors.json` attachments were captured per test; expected protected-delete 409 responses were accounted for and no unexpected browser errors or failed requests occurred. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/group-journey.spec.js --workers=1 --reporter=line --output /tmp/splitmoney-qa-q02` | Chromium; isolated live FastAPI and disposable SQLite databases; actual process restart | **Passed:** 5/5 in 12.2s. Reviewed exact intermediate amounts, payment direction, record counts, UUID-based odd cents and restart checks. |
| 2026-10-29 | Independent checkpoint review of feature suites | Real API browser fixtures, with controlled failed-request interception | **Passed:** [F01](../frontend/F01-shell-and-login.md) covers login GET/POST failure, retry and keyboard navigation; [F02](../frontend/F02-people.md) covers focus after editor close, literal HTML-like names, and long names at 320/390/430px; [F03](../frontend/F03-expenses.md) covers failed GET, ambiguous POST, preserved input and one delayed submission, plus long target names at 320px; [F04](../frontend/F04-balances-and-settlements.md) covers failed refresh, ambiguous POST and delayed payment submission. Physical software keyboard on a device was not tested; Q03 records that limitation. |

### Decisions and deviations

The odd-cent flow's total settlement is not the expense total. It equals `$10.00` minus Alice's share, which is `$6.66` when Alice receives the extra cent and `$6.67` otherwise. The test derives the remainder recipient from UUID order and checks every suggested amount and post-payment net in integer cents; no product contract changed.

### Remaining work and blockers

No Q02 work remains. Feature-suite evidence above covers the extra checkpoints; physical-device keyboard verification is conditional and remains an explicit Q03 limitation.

**Next action:** Proceed to Q03 browser and handoff verification.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Began Q02 after confirming the Q01 isolated live-API browser fixture and stable F01–F03 views. F04 is still in progress; drafted journey work may proceed while awaiting its final payment UI contract. |
| 2026-10-29 | In progress | Drafted five live-API browser journeys and added isolated backend restart support to `tests/browser/fixtures.js`. Syntax checks pass. A browser run started before the coordinator's serialized-job notice, was stopped before completion, and supplied no verification evidence; waiting for F04 handoff and the Q02 slot. |
| 2026-10-29 | In progress | Released the Q02 browser-test slot to the coordinator after drafting and syntax-checking the suite. Fixed server teardown to handle signal exits and reran static checks. The next action is Q02 execution after F04's serial browser run is green. |
| 2026-10-29 | In progress | F04 handed off and the coordinator released the exclusive Q02 slot. The first completed run exposed selector/heading assumptions; the second passed two flows and exposed three remaining selector assumptions. Corrected those test locators; no product or balance defect has been observed. Rerunning Q02 now. |
| 2026-10-29 | In progress | Third serial run passed 4/5, including the backend restart and mobile/error checkpoints. The odd-cent flow verified UUID-based shares and zero nets; its only failure was a fixed `$10.00` settlement-total expectation. Replaced it with integer-cent assertions derived independently from Alice's UUID-assigned share and checked each suggestion against expected debtor/creditor nets. Running the final serial verification. |
| 2026-10-29 | In progress | Final serial run passed all five Q02 flows (12.3s). Primary restart/persistence and all numeric, count, membership, deletion, validation, and 390px/320px checks passed. Released the browser slot. Failed-request injection, delayed duplicate-submit, keyboard/focus, literal-text, and long-name checks remain unverified and are called out for independent QA. |
| 2026-10-29 | Complete | Independent QA reran all five journeys and linked independently verified feature-suite evidence for the remaining checkpoints. Actual physical keyboard coverage remains unavailable and is tracked in Q03. |

## Goal

Exercise the app as a small real group would, with exact expected balances and clear checks for login, expense correction, and payments.

## Prerequisites

B01–B08, F01–F04, and Q01 fixture helpers. Run on a disposable QA database only. Use separate browser contexts or Switch user to simulate multiple people.

## Deliverables

Implement the primary journey in `tests/browser/group-journey.spec.js`. Execute the independent edge scenarios manually or with browser tests and record results in this step's Progress → Verification evidence section, linking failures/screenshots where useful.

## Balance convention

Positive = person should receive; negative = person should pay. Record a payment only after the mock sender is treated as having sent the money. Suggestions are recommendations until saved.

## Primary journey: three friends share costs

Start with a fresh disposable database and add all three people **before** recording the first expense.

| Step | User action | Expected UI/API result | Alice net | Bob net | Cara net |
| --- | --- | --- | --- | --- | --- |
| 1 | Enter `Alice`; add Bob and Cara on People | Three users; Alice selected; no records | $0.00 | $0.00 | $0.00 |
| 2 | Switch user; enter ` aLiCe ` | Same Alice UUID, still three people | $0.00 | $0.00 | $0.00 |
| 3 | Alice records `$60.00`, paid by Alice, Everyone | Each share `$20.00`; expense total `$60.00` | +$40.00 | -$20.00 | -$20.00 |
| 4 | Bob records `$30.00`, paid by Bob, Everyone | Each owes another `$10.00`; expense total `$90.00` | +$30.00 | $0.00 | -$30.00 |
| 5 | Edit Bob's expense to `$36.00` | Each owes `$12.00` on it; total `$96.00` | +$28.00 | +$4.00 | -$32.00 |
| 6 | Correct Bob's expense back to `$30.00` | Previous totals restored | +$30.00 | $0.00 | -$30.00 |
| 7 | Bob records actual payment `$15.00` to Alice | Payment total `$15.00`; Cara owes both creditors | +$15.00 | +$15.00 | -$30.00 |
| 8 | Cara opens suggested `$15.00` to Alice, then cancels | No record created; totals unchanged | +$15.00 | +$15.00 | -$30.00 |
| 9 | Cara records `$15.00` to Alice | Payment total `$30.00`; only Cara-to-Bob remains | $0.00 | +$15.00 | -$15.00 |
| 10 | Cara records `$15.00` to Bob | Payment total `$45.00`; no suggestions | $0.00 | $0.00 | $0.00 |
| 11 | Delete Cara-to-Bob payment after confirmation | Debt reappears | $0.00 | +$15.00 | -$15.00 |
| 12 | Re-record that payment | Settled again | $0.00 | $0.00 | $0.00 |
| 13 | Rename Bob to Robert; set then clear phone | Payment/expense labels update; references survive | $0.00 | $0.00 | $0.00 |
| 14 | Reload browser and restart backend | Same selected UUID, records, and settled totals | $0.00 | $0.00 | $0.00 |

At step 7 the only suggested transfers are Cara -> Alice `$15.00` and Cara -> Bob `$15.00`; tie order depends on their UUIDs. Before step 7 Alice's component totals are paid `$60`, share `$30`, sent `$0`, received `$0`. After step 7 received becomes `$15`. Bob's are paid `$30`, share `$30`, sent `$15`, received `$0`.

At the end there are two expenses and three payments: Bob -> Alice `$15`, Cara -> Alice `$15`, Cara -> Robert `$15`. A canceled form must not create a fourth payment. Check API counts as well as screen text.

## Independent scenario A: explicit targets and payer exclusion

Reset only the disposable QA database. Create Alice, Bob, Cara.

1. Alice pays `$24.00`, selecting Bob and Cara only. Expected net: Alice `+$24`, Bob `-$12`, Cara `-$12`.
2. Edit amount to `$30.00` without changing targets. Expected net: `+$30`, `-$15`, `-$15`; selected target set stays Bob/Cara.
3. Switch this expense to Everyone. Expected net: Alice `+$20`, Bob `-$10`, Cara `-$10`.
4. Delete the expense. All nets zero and expense list empty.

## Independent scenario B: membership changes

1. Create Alice/Bob/Cara and Alice's `$60` Everyone expense. Nets: `+$40`, `-$20`, `-$20`.
2. Add Dan. Historical shares become `$15` each; nets Alice `+$45`, others `-$15` each. UI must have explained this behavior when choosing Everyone and adding a person.
3. Attempt to delete Dan. Expect `409` and visible explanation because an Everyone expense exists.
4. Edit the expense to an explicit Alice/Bob/Cara set. Shares return to `$20` each; Dan net is zero.
5. Delete Dan now. It succeeds because he has no remaining references. Other balances do not change.

## Independent scenario C: odd cents

1. Use Q01 deterministic IDs to create the three friends; Alice pays `$10.00` for Everyone.
2. With the Q01 ordering Alice/Bob/Cara, shares are Alice `$3.34`, Bob `$3.33`, Cara `$3.33`; nets are Alice `+$6.66`, Bob `-$3.33`, Cara `-$3.33`. With generated IDs, the first UUID receives `$3.34`; cumulative settlements equal `$10.00` minus Alice's share (`$6.66` or `$6.67`).
3. Record each suggested payment. All nets become exactly `$0.00` with no one-cent remainder.
4. With generated browser IDs, derive the remainder recipient from ascending UUIDs instead of assuming Alice receives it.

## Independent scenario D: correction, overpayment, and deletion safety

1. Two users, Alice pays `$20` for Everyone: Alice `+$10`, Bob `-$10`.
2. Bob records `$15` to Alice: Alice `-$5`, Bob `+$5`; suggestion Alice -> Bob `$5`.
3. Edit payment to `$10`: both zero. Delete payment: balances return to `+$10`, `-$10`.
4. Attempt to delete Alice or Bob while the expense remains: blocked. Delete expense, then both users can be deleted. Deleting the selected person returns to name entry.

## Error and mobile checkpoints

- Try duplicate username create, zero amount, three-decimal amount, no selected participants, and self-payment. Verify actionable errors and unchanged record counts.
- Simulate a failed GET: retry is visible. Simulate a failed POST: form stays filled, no success is claimed, and no automatic mutation replay occurs.
- Double tap Save during a delayed response: exactly one request and one record.
- At 390px and 320px widths, complete login, target selection, expense save, suggestion review, and payment save without horizontal scrolling.
- Check keyboard navigation, focus after editor close, names rendered as literal text, and long usernames wrapping.

## Acceptance

Primary journey automation passes with real API calls. All independent scenarios and checkpoints have recorded pass/fail results; numerical mismatches or duplicate writes block completion. Do not claim QA is complete based only on mocked API responses.
