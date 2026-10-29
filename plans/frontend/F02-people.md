# F02 — People management

## Progress

This section is the authoritative implementation and verification record for F02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** People CRUD, Unicode-codepoint validation, and pending-write protection pass focused browser coverage against the live API. A pending add/edit/delete now disables competing People controls until the mutation and canonical user refresh finish, preventing a late response from replacing another editor.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented the lazy People view and scoped stylesheet in `app/static/js/people.js` and `app/static/people.css`. Added `tests/browser/people.spec.js` coverage for create, normalized duplicate conflicts, edit and phone clearing, current-user rename, protected and confirmed deletion, deletion of the selected user, safe rendering of HTML-like usernames, pending/network recovery, and mobile/keyboard behavior. Username and phone limits now count Unicode codepoints to match the API. Added cross-feature login and People boundary coverage in `tests/browser/unicode-users.spec.js`.

Q03's touch-target audit raised `.people-action` from a 42px to 44px minimum. Q03's final browser matrix will verify the rendered size; this CSS adjustment has not yet been measured in-browser.

The same contrast review changed empty phone text to the shared muted token, which now meets the normal-text target against the paper background.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/people.spec.js tests/browser/expenses.spec.js tests/browser/qa-regression.spec.js tests/browser/unicode-users.spec.js --workers=1 --reporter=line --output /tmp/splitmoney-qa-combined` | Chromium, isolated live API and temporary SQLite files | **Passed:** 28 tests, including the independent pending-person editor regression and Unicode boundary coverage. Pending action lock prevents competing editors until canonical reload. |
| 2026-10-29 | `node --check app/static/js/people.js && node --check tests/browser/people.spec.js` | Local Node.js runtime | Passed; both modules parse. |
| 2026-10-29 | `npm run test:browser -- tests/browser/people.spec.js --workers=1` | Playwright Chromium; each browser test used the shared fixture's temporary SQLite database and live FastAPI server | Passed: 8 F02 browser tests, including add/duplicate, empty-name validation, rename persistence, phone cleanup, protected deletion, selected-user deletion, retry after failed mutation/list refresh, text-only rendering, and 320/390/430px keyboard checks. |
| 2026-10-29 | `npm run test:browser -- --workers=1` | Same isolated real-API browser fixture; all browser specs present at the time | Passed: 25 tests across expenses, login/shell, and people. |
| 2026-10-29 | `npm run test:browser -- --workers=1` | Same isolated real-API browser fixture; final current browser specs after F03 coverage was added | Passed: 28 tests across expenses, login/shell, and people. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/people.spec.js --reporter=line`; `npm run test:browser -- tests/browser/qa-regression.spec.js --reporter=line` | Chromium and live API, temporary databases | **People suite passed:** 8 tests. **Unicode regression failed:** login truncates 21 emoji to 20 because `maxlength=40` counts UTF-16 units. People has the same limit and additionally uses JavaScript `.length`; the API permits 40 Unicode characters. Concurrent Playwright jobs also collided in shared trace output; use distinct output directories for parallel runs. |
| 2026-10-29 | `npm run test:browser -- tests/browser/unicode-users.spec.js --reporter=line --workers=1 --output=/tmp/splitmoney-unicode-output` | Chromium, isolated live API server | **Passed:** 2 tests cover 21/40 codepoint names across login/create/edit, 41-codepoint rejection, and phone limits at 40/41 codepoints. |
| 2026-10-29 | `npm run test:browser -- tests/browser/login.spec.js tests/browser/people.spec.js tests/browser/qa-regression.spec.js --reporter=line --workers=1 --output=/tmp/splitmoney-unicode-existing-output` | Chromium, isolated live API server | **Passed:** 17 login, People, and QA regression tests, including the independent 21-emoji regression. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/qa-regression.spec.js -g 'Unicode usernames' --reporter=line --output /tmp/splitmoney-qa-unicode`; same file with `-g 'pending person' --output /tmp/splitmoney-qa-pending-person` | Chromium, live API; delayed person POST while opening another editor | **Unicode passed. Pending person failed:** completing the first save replaces the page and discards the second draft. |
| 2026-10-29 | `node --check app/static/js/people.js && node --check tests/browser/people.spec.js` | Local Node.js runtime | Passed; People view and browser regression modules parse. |
| 2026-10-29 | `npm run test:browser -- tests/browser/people.spec.js tests/browser/qa-regression.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-f02-pending-output -g 'pending person|retrying after selected-person deletion'` | Chromium; isolated live API and temporary SQLite database | Passed: 3 selected tests. The People lock held while POST and canonical user GET requests were gated; Add, fields, Cancel, Edit, and Delete stayed disabled, and both fresh user data and controls returned afterward. QA’s pending-person regression and selected-person-delete retry also passed. |
| 2026-10-29 | `npm run test:browser -- tests/browser/people.spec.js --workers=1 --reporter=line --output=/tmp/splitmoney-f02-people-full-output` | Chromium; isolated live API and temporary SQLite database | Passed: all 9 People browser tests, including create/duplicate/edit, rename, protected/selected deletion, canonical-refresh recovery, pending-write locking, safe text rendering, and mobile keyboard layout. |

An initial run exposed a DOM insertion error while rendering validation alerts; the form now inserts alerts and retries beside its direct-child action group. The first 320px max-name run also exposed intrinsic width in the People list; the feature stylesheet now constrains its grid column and row/person/name widths. The final checks above passed after these fixes. The 390px case uses a 40-character current username and checks 320px, 390px, and 430px widths.

### Decisions and deviations

No shared-contract changes. A saved write followed by a failed canonical users refresh keeps the entered values and offers a reload without replaying the write. Retrying the users refresh after deleting the current user still reconciles the selected UUID through the shell and returns to login.

### Remaining work and blockers

No remaining F02 work. The independent QA pending-person regression now passes with competing People controls disabled for the full mutation and canonical refresh.

**Next action:** None; F02 is complete.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | In progress | Started after reviewing B04 and the F01 shell/API/session contracts; implementing the lazy People view and browser tests. |
| 2026-10-29 | Complete | Added people CRUD view and styles; all 8 feature browser tests and the final 28-test browser suite passed using the real API and isolated SQLite fixtures. |
| 2026-10-29 | In progress | Independent QA reopened the step after finding that supplementary Unicode names are incorrectly limited by UTF-16 units. |
| 2026-10-29 | Complete | Replaced UTF-16 limits with codepoint checks, removed truncating maxlength attributes, and passed the Unicode regression plus focused login/People/QA browser suite. |
| 2026-10-29 | In progress | Independent QA found a late person-save response could replace another editor; added a per-view write lock covering Add/Edit/Delete controls and the canonical users refresh. |
| 2026-10-29 | Complete | Passed all 9 People browser tests and QA’s pending-person regression with the write lock held through the canonical user refresh. |

## Goal

Let group members inspect, add, rename, update phone numbers, and safely delete people.

## Prerequisites

F01 and B04 for live verification. Follow the shared contract's deletion and dynamic membership behavior.

## Deliverables

`app/static/js/people.js`, necessary shared styles/components, and `tests/browser/people.spec.js`.

## Instructions

1. Load and render the users list with current-person identification and an empty state. Phone numbers are optional plain text, not a message-sending action.
2. Add create and edit forms with username and optional phone. Trim/validate for helpful feedback, but always render backend validation/conflict messages. Keep UUIDs internal to form state.
3. Explain near Add person that adding a person changes past expenses marked Everyone. Let the user review the normal add form; no special approval workflow is needed.
4. PATCH only changed fields. Clearing phone sends null. Rename must refresh the local current-person label if that UUID is selected.
5. Add delete with an explicit confirmation naming the person. For `409 user_in_use`, explain that linked expenses/payments or everyone expenses must be removed first. Keep the person visible on failure.
6. If the current selected person is successfully deleted, clear local selection and return to login. Deleting an unrelated person keeps the selection.
7. After mutations, reload canonical user data and mark overview/expense/payment views for refresh. New users may alter historical shares; renames alter labels everywhere.
8. Add form focus handling: focus the first field when opening an editor and return focus to a sensible control after closing it. Preserve inputs on network failure and disable save while pending.

## Verification and acceptance

- Add Alice, add Bob, reject `ALICE` as a duplicate via direct create, and show a useful error.
- Rename Bob to Robert and update/clear phone. Reload and verify persistence.
- Rename current user without losing selection; selection follows UUID.
- Delete an unused user; cancel a delete; show protected-delete failure for a referenced user without removing their row.
- A name containing HTML-like text renders as text and executes no markup/script.
- Verify on a 390px viewport and with keyboard navigation. No important control depends on hover.
