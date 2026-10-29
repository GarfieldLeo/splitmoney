# F01 — Mobile shell, API client, and login

## Progress

This section is the authoritative implementation and verification record for F01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** Review the shared API contract and B01 hosting, then build the mobile shell and API client.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Create the usable mobile navigation and name-entry experience, with a shared API layer and clear loading/error handling.

## Prerequisites

B01 for static hosting and `plans/00-shared-contract.md` for API shapes. B04 is required for live login; otherwise use browser-test network fixtures until B04 is available.

## Deliverables

`app/static/index.html`, `app/static/styles.css`, `app/static/js/api.js`, `app/static/js/app.js`, `app/static/js/session.js`, and `tests/browser/login.spec.js` (browser test setup is finalized in Q03).

## Instructions

1. Build a semantic HTML shell with viewport metadata, a header, a main content region, and Overview/Expenses/Payments/People navigation. Use hash routes so refresh works without server-side routing. Keep modules small; no frontend build framework is needed.
2. Use a narrow mobile layout that expands cleanly on desktop. Provide at least 44px touch targets, readable labels, visible keyboard focus, good contrast, and safe-area padding around bottom navigation. Avoid horizontal scrolling at 320px width.
3. Implement `api.js` with same-origin fetch, JSON request bodies, handling for empty `204` responses, and a typed/structured error object from the shared error envelope. Preserve status codes. A network failure must be distinguishable from a validation error.
4. Add a name-entry form calling `POST /api/login`. Display the trusted-group explanation. Disable duplicate submission while pending; on success store the returned UUID in `localStorage` and load the overview.
5. On startup, fetch users and validate the remembered UUID. If absent/deleted, clear it and show login. If the fetch fails, show retry rather than assuming the person was deleted. Resolve current display names from fetched data after a rename.
6. Add a Switch user control that clears local selection and returns to name entry without deleting records. Never encode the selected UUID as backend authorization; this is a convenience preference.
7. Provide reusable inline error/status components and loading/empty states. Announce asynchronous success/failure through an appropriate live region. Use `textContent` for user-supplied names.
8. Initially show honest empty/placeholder states on feature tabs; subsequent steps replace them. Test mocks must be isolated to browser fixtures, never shipped as a production API fallback.

## Verification and acceptance

- Fresh visit, successful new-name login, case-insensitive returning login, reload, switch user, and removed remembered user work.
- Failed login leaves the typed name available; retry works without duplicate navigation.
- Unknown routes return to a valid tab; direct hash route reload works.
- `204`, validation errors, and network failures are handled by the API client without JSON parse crashes.
- Keyboard-only login/navigation works; labels and errors are accessible; mobile keyboard does not hide the primary action.
- Browser checks can run against fixtures before the full API, and against B04 once available.

## Boundary

No expense or payment forms yet. Do not create a password screen or imply an authenticated session.
