# Q02 — Mock user flow and numerical acceptance script

## Progress

This section is the authoritative implementation and verification record for Q02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After the backend/frontend tracks and Q01, run the primary mock journey on a disposable database.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
2. Shares: Alice `$3.34`, Bob `$3.33`, Cara `$3.33`; nets Alice `+$6.66`, Bob `-$3.33`, Cara `-$3.33`.
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
