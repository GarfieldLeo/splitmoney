# Bug reports

This file is the single source of truth for user-approved bugs and their progress. Review candidates stay outside this file until the user chooses to add them. Recording a bug does not authorize implementing a fix.

## BR-001 — Enforce logged-in identity and ownership on modifications and deletion

- **Status:** Open — implementation deferred at the user's request.
- **Priority:** High.
- **Reported / approved:** 2026-10-29, by the user.
- **Affected areas:** Backend identity, user/expense/payment mutation APIs, persisted record ownership, and frontend action visibility.

### Goal

Only a logged-in user may modify or delete data, and only within that user's permitted ownership. A user must not edit or delete another user's profile. **The payer is the owner:** only the user identified by an expense's `payer_id` may modify or delete that expense. Use the payment's `payer_id` (sender) as its owner as well.

The user clarified this policy on 2026-10-29: ownership follows the payer, rather than the person who submitted the record. No separate creator field is required.

### Current behavior and evidence

The application currently implements the original trusted-group policy: choosing a username stores a selected UUID in the browser, without a server-authenticated session. Mutation routes do not establish an acting user or check ownership:

- [`../app/routes/users.py`](../app/routes/users.py): profile PATCH and DELETE accept a target UUID without an authenticated actor.
- [`../app/routes/expenses.py`](../app/routes/expenses.py): expense PATCH and DELETE do not check whether the acting user is the payer.
- [`../app/routes/settlements.py`](../app/routes/settlements.py): payment PATCH and DELETE do not check record ownership.
- [`../app/schema.sql`](../app/schema.sql): expenses and payments already store `payer_id`, which supplies ownership under the clarified policy.
- [`../app/static/js/session.js`](../app/static/js/session.js): the selected UUID is a browser preference, rather than proof of identity.

Existing reference checks prevent deleting people used by records; they do not establish permission to modify or delete someone else's data. This report records a newly approved requirement that supersedes unrestricted editing in the original contract. No fix has been implemented.

### Reproduction / mock user flow

Use disposable test data, never the live ledger.

1. Create Alice and Bob; choose Alice as the current user.
2. Send `PATCH /api/users/{bob_id}` with a new username or phone. The current route permits the change.
3. Create a second unreferenced person and send DELETE for that person while acting as Alice. The current route permits deletion.
4. Create an expense with Bob as its payer. Select Alice and PATCH or DELETE that expense. The current route permits the mutation.
5. Repeat the expense request without a logged-in browser selection. The server has no authenticated session to reject it.

Expected after remediation: unauthorized changes fail and leave stored data unchanged; permitted self/payer-owner actions succeed, subject to existing validation and reference protections.

### Implementation requirements for a future fix

1. Agree on a server-verifiable identity mechanism. Username selection alone lets anyone claim another person's identity; merely sending a user UUID does not solve this requirement.
2. Use the stored `payer_id` as the owner for expenses and payments, including existing records. Creating a record on behalf of someone else does not give its submitter ownership.
3. Enforce permission checks on every PATCH and DELETE route on the server. Define unauthenticated/forbidden response semantics consistently, and preserve existing validation and reference checks for authorized requests.
4. Check authorization against the record's current stored payer before applying any PATCH, including a payer change. A caller must not gain permission by supplying their own UUID as the new payer. Document whether an authorized payer change transfers ownership or is disallowed.
5. Update the frontend to show only permitted actions and handle rejected or expired sessions. UI visibility must be backed by server enforcement.
6. Update the shared contract, affected backend/frontend plans, and QA flows when implementing the chosen policy.

### Policy decisions still needed

- How users establish and retain a verifiable login.
- Whether payer changes transfer ownership or are disallowed once a record exists.
- Whether any administrator exceptions exist; none are assumed by this report.

### QA acceptance checks

- Unauthenticated PATCH/DELETE requests fail for users, expenses, and payments, without changing any data.
- Alice can modify her own profile; Alice cannot modify/delete Bob's profile, including when she guesses or directly supplies Bob's UUID.
- Alice can modify/delete an expense whose payer is Alice. Bob cannot, even if he submitted it or is a split participant. Alice cannot modify/delete an expense whose payer is Bob, even if she submitted it.
- Only the payment's payer/sender may modify/delete it; a recipient or unrelated user cannot.
- A client cannot spoof another actor or acquire ownership by PATCHing someone else's record to set themselves as payer. Authorized payer changes follow the agreed transfer policy.
- Ownership survives rename, logout/login, and restart; existing records use their stored payer as owner.
- Mock flow covers Bob attempting Alice's actions in the UI and through direct API requests; the original records remain unchanged after rejection.

### Progress

- **2026-10-29:** Recorded the user-approved requirement and current implementation evidence. No application code or live data changed. Implementation and QA acceptance checks are pending; the steps above describe future work, not completed tests.
- **2026-10-29 clarification:** The user chose payer-as-owner. Updated the policy and QA checks; a separate creator field and legacy-owner backfill are unnecessary.
- **Remaining work:** Resolve verifiable identity and payer-change policy, then implement and verify in a separately authorized change.
- **Next action:** Keep this report open. Present additional review candidates to the user for selection before adding them here.
