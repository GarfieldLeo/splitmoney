# UX enhancement review

This is the single source of truth for these UX proposals and their progress. The review documents current behavior and proposed future changes; it does not authorize or claim fixes. Priorities express UX impact, not an implementation schedule. Approved defects and their status live in [bug reports](bug_reports.md); review candidates below are not approved bug reports.

## Evidence and scope

On 2026-10-29, a real local app was exercised with Playwright Chromium at a 390 × 844 mobile viewport, against a fresh temporary SQLite database and a Uvicorn server on a free port. The temporary server and database were removed afterward; the normal ledger was not used. Screenshots are full-page captures, so the fixed navigation appears at the viewport position at capture time, sometimes over content in the stitched image. That alone does not establish that content is unreachable. Screenshots show app state, not a redesign.

1. **Identify and add people.** The [username screen](ux-screenshots/01-login.png) explains that anyone can select a name and there are no private accounts. Alice continues, then adds Bob and Carol on [People](ux-screenshots/02-people.png). Everyone-split membership is explained there.
2. **Record an expense.** Alice opens Expenses, enters $60.00, selects Everyone and [creates the expense](ux-screenshots/03-add-expense.png). The [record](ux-screenshots/04-expense-recorded.png) shows Alice paid $60.00. This is a shared cost, not a payment between members. For three people the shares are $20 each; Alice should receive $40, Bob and Carol each should pay $20.
3. **See what Bob should pay.** After switching to Bob, [Overview](ux-screenshots/05-bob-overview-before.png) shows his $20 balance. Suggestions further down show Bob pays Alice $20 and Carol pays Alice $20. These are simplified group settlement suggestions, not necessarily a statement of the original bilateral expenses.
4. **Record a payment already made.** Bob opens [Review suggested payment](ux-screenshots/06-suggestion-review.png); sender, recipient and $20 are prefilled, and the screen says nothing is sent from the app. After recording, [Overview](ux-screenshots/07-bob-overview-after.png) says Bob is settled, Alice should receive $20 and Carol should pay $20. Recorded payments total $20. The screen still shows a review instruction despite the editor being closed.
5. **Edit and separately record a payment.** The [Payments list](ux-screenshots/08-payments-list.png) shows Bob paid Alice $20. In [Edit payment](ux-screenshots/09-edit-payment.png), Bob changes it to $15; the list subsequently reports $15 total. A separate [manual payment](ux-screenshots/10-add-payment.png) records Bob paying Alice $5. The [resulting overview](ux-screenshots/11-overview-after-edit-and-payment.png) again has Bob settled, Alice owed $20 and Carol owing $20. API responses confirmed two payments ($15 and $5) and the final balances. The intermediate $15 edit was confirmed in the list; its intermediate overview was not captured.

The bottom navigation offers Overview, Expenses, Payments and People; the active destination is highlighted. The current name selection is a browser preference, not verified login. [BR-001](bug_reports.md#br-001--enforce-logged-in-identity-and-ownership-on-modifications-and-deletion) is an approved future requirement, with payer-as-owner for expense/payment modification and self-only profile changes. Authentication, enforcement, and payer-change policy remain unresolved and unimplemented.

## Proposed improvements

### P1 — Bring the selected person's next step into view

**Goal:** Let Bob find whom the group suggests he pay without scrolling past every person's detailed accounting. On the captured 390px screen the personal total is near the top, while the relevant suggestion follows all three group cards. The gap grows with the group.

**Proposal:** Place suggestions involving the selected person immediately after their balance, with explicit “You pay Alice $20” / “Carol pays you $20” wording; offer the full group suggestions and detailed component breakdown below. Label them as a possible way to settle the group, not a direct debt history. Preserve access to all group information and a clear settled/no-suggestion state.

**Suggested acceptance checks:** In the example, Bob sees his $20 total and Alice suggestion together without traversing other people's details; Alice sees incoming suggestions; a settled person sees an accurate empty personal state while other group suggestions remain available. Check long names, 320px and 390px screens, keyboard focus, and screen-reader reading order.

### P1 — Make recording a payment safe and unmistakable

**Goal:** Prevent users from treating a suggestion as a transfer, or accidentally recording the same transfer twice when the outcome is unclear.

**Proposal:** Retain the existing explanation that money must already have been sent, and use a concise review summary (“Bob paid Alice $20”) directly above the confirmation. After success, close the review and remove its stale instruction; show the recorded result and updated balance. For an uncertain response, preserve the entry and guide the user through checking the refreshed list before a safe retry; do not enable an immediate second submission while that outcome is being reconciled. The lost-response duplicate risk is an **unselected review candidate**, not a tracked bug. For an aggregate suggestion that exceeds the current per-payment limit, another **unselected review candidate**, show a usable partial amount and explain how to record the remainder, rather than prefill an amount that cannot be saved.

**Suggested acceptance checks:** Opening or cancelling a suggestion creates no record; saving exactly once creates one record and updates the balance. Verify the instruction disappears after success. Simulate a server-accepted payment with its response lost: the user can inspect the canonical list and cannot accidentally create a duplicate while checking. Verify partial payment and a suggestion above the applicable payment-record limit without suggesting that the app sends money.

### P1 — Support the pending identity and ownership policy

**Goal:** Make permissions understandable once [BR-001](bug_reports.md#br-001--enforce-logged-in-identity-and-ownership-on-modifications-and-deletion) is implemented, without claiming the current username screen provides security.

**Proposal:** Design a verified sign-in and recovery journey after the identity method is chosen. Explain why an action is unavailable and whose record it is; expose edit/delete for the authenticated payer of an expense or payment and self-only profile changes, consistent with server enforcement. Explain any payer-change consequence once that policy is decided. Keep current trusted-group disclosure until the actual behavior changes.

**Suggested acceptance checks:** An unauthenticated person can understand how to sign in; expired sessions preserve unsaved work where feasible and provide a recovery path. Alice can edit her own payer records but cannot change Bob's, including via direct requests; Bob's records remain unchanged. Test existing records and the eventually chosen payer-change rule. These are future checks, not results of this review.

### P1 — Explain expense amount limits and validation

**Goal:** Help users enter a valid amount before losing time on a rejected save. The current expense form asks for a positive amount with up to two decimals but does not show the requested maximum.

**Proposal:** When [BR-002](bug_reports.md#br-002--cap-each-expense-at-10000000-and-retain-exact-money-arithmetic) is implemented, applying the approved $100,000.00 **per-expense** cap, display it beside the amount, retain the entered value on error, and explain the exact correction. Use consistent client and server validation; do not silently round. Do not imply this expense-specific requirement also changes payment limits.

**Suggested acceptance checks:** $100,000.00 is accepted; $100,000.01, zero, negative and more than two fractional digits are rejected with understandable feedback and no record created or changed. Test create and edit and direct API requests. This is a pending requirement, not current behavior.

### P2 — Make changes to a payment's effect visible

**Goal:** Give users confidence when correcting a payment, especially because a changed amount can reopen a balance or create a credit.

**Proposal:** In edit, show the original record and a concise preview of the proposed change in sender, recipient and amount. After saving, show a confirmation with a link back to the refreshed overview; explain that payments larger than a current suggestion are allowed and may reverse the balance. Keep record editing distinct from actually sending money.

**Suggested acceptance checks:** Changing Bob's $20 to $15 clearly identifies the $5 reduction; after save, Overview shows Bob should pay $5 and Alice should receive $25 before any further payment. Cancel changes nothing; a larger payment shows the resulting credit accurately. Check error recovery and preservation of entered values.

### P2 — Clarify Everyone and the impact of adding a person

**Goal:** Help a group avoid surprise changes to historical balances. The present expense and People screens already warn that future members join past Everyone expenses; this is consequential and easy to overlook.

**Proposal:** Offer a plain-language choice between “Everyone, including future members” and selected current people. Before adding a person, summarize that their addition changes shares of existing Everyone expenses, with an opportunity to cancel. Do not silently turn a dynamic split into a fixed one.

**Suggested acceptance checks:** The choice clearly states who is included and whether future members change it; selected people include the payer only when selected. Add a fourth person to the $60 example and verify each share becomes $15 for Everyone, while an explicitly selected split stays unchanged. Cancelling the person addition changes nothing.

### P2 — Improve mobile wayfinding and focus

**Goal:** Keep the active task and next control easy to locate when forms open inside long pages. Fixed navigation can cover the captured viewport at a given scroll position; full-page screenshots cannot establish an actual access failure.

**Proposal:** When opening an editor, move focus to its heading or first field and bring the editor into view; ensure navigation and software keyboard do not obscure focused fields or primary actions. Provide a clear way back to the originating context. Retain labelled navigation and visible focus.

**Suggested acceptance checks:** At 320px and 390px, tab through every field and save/cancel action, including after scrolling, with no control hidden behind navigation; check a physical phone keyboard and safe areas. Screen readers announce the editor and destination. Verify the refresh flow preserves an open form.

### P2 — Make uncertain changes easy to reconcile

**Goal:** Avoid misleading stale information after a network interruption. The reported lost-response People deletion is an **unselected review candidate**: a stale row can leave the user unsure whether deletion happened.

**Proposal:** Explain uncertainty in everyday terms, refresh the relevant list, and show the outcome without discarding unsaved input. Provide a retry only once the user can tell what remains to be done. Apply the same clear, accessible error pattern to other unexpected input failures; the malformed Unicode server error is also an **unselected review candidate**.

**Suggested acceptance checks:** Simulate a deletion accepted by the server but with its response lost; refreshed People reflects the canonical state and gives a clear next step without a false failure or duplicate action. Invalid text produces a useful error and preserves the form; no internal error details appear.

## Progress and next action

- **2026-10-29:** Reviewed the contract, approved bug report, README and browser fixture; performed and visually inspected the isolated mobile journey above. Screenshots and proposals are recorded here. At 390px, the expense and payment submit buttons were reachable after scrolling; CSS reserves bottom space and scroll padding for navigation. The existing 320px overview/payment layout test passed; it checks horizontal overflow, not physical keyboard or complete focus behavior. No product code, tests, schema or live ledger were changed.
- **Status:** Review complete; proposals and acceptance checks are pending user prioritization and separate implementation. BR-001 remains open. [BR-002](bug_reports.md#br-002--cap-each-expense-at-10000000-and-retain-exact-money-arithmetic), the expense cap, remains open. Candidate failures are not approved bug reports.
- **Next:** Agree on UX priorities and identity/payer-change decisions, then implement and verify selected work in a separately authorized change. Validate physical keyboard/safe-area behavior and accessibility with actual devices and assistive technology; this review used emulation only.
