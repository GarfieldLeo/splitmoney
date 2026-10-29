# F01 — Mobile shell, API client, and login

## Progress

This section is the authoritative implementation and verification record for F01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** In progress
- **Last updated:** 2026-10-29
- **Current summary:** Implemented the mobile shell, same-origin API client, UUID-backed local selection, retryable startup validation, and extensible route rendering. Login applies the 40-character username limit by Unicode codepoint and passes supplementary-character regressions. The combined independent frontend QA gates and Q02 journey have passed. Automated narrow/mobile viewport checks and the 44px touch-target/focus treatment are recorded; physical software-keyboard behavior is unavailable and remains explicitly unverified.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [ ] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented `app/static/index.html`, `app/static/styles.css`, `app/static/js/api.js`, `app/static/js/session.js`, `app/static/js/ui.js`, and `app/static/js/app.js`. Added the per-test live FastAPI browser fixture and login/API checks in `tests/browser/fixtures.js` and `tests/browser/login.spec.js`, plus `package.json`, `package-lock.json`, and `playwright.config.js` for the early browser harness. Added Node and Playwright output ignores to `.gitignore`.

Q03's contrast review darkened the shared muted text, inactive navigation, placeholder, eyebrow, and focus colors, and gave focused text/select inputs a solid three-pixel outline. Q03's browser assertions will verify the rendered focus style; hardware keyboard behavior remains unavailable.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/people.spec.js tests/browser/expenses.spec.js tests/browser/qa-regression.spec.js tests/browser/unicode-users.spec.js --workers=1 --reporter=line --output /tmp/splitmoney-qa-combined` | Chromium, isolated live API; formatter cases include large aggregate decimal strings | **Passed:** 28 tests, including exact USD formatter and Unicode login coverage. Physical mobile keyboard remains unverified. |
| 2026-10-29 | `npm run test:browser -- --reporter=line` | Node 21.6.2, Playwright 1.64.1, Chromium; each test starts Uvicorn with a separate temporary SQLite database | **Passed:** 8 browser tests. Real API coverage verified new and case-insensitive returning login, reload, switching users, and removed UUID handling. Network failures, retry behavior, API 204/422/network errors, routing, and stale render guards were also covered. |
| 2026-10-29 | `.venv/bin/python -m pytest` | Project `.venv`, Python 3.11.6 | **Passed:** 137 tests. One existing Starlette deprecation warning recommends `httpx2`; it does not affect the test result. |
| 2026-10-29 | `npx playwright test tests/browser/login.spec.js -g 'fit 320px' --reporter=line` | Chromium, 320px viewport; login submitted with Enter | **Passed:** no horizontal overflow; four navigation links each measured at least 44px wide and high. A temporary screenshot was visually inspected after the test identified and helped correct an 8px header overflow. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/login.spec.js --reporter=line` and shell/session/API client review | Playwright Chromium with isolated live FastAPI servers | **Passed:** 8 browser tests; reviewed session recovery, API errors and stale-render guards. The 320px keyboard test uses desktop Chromium and Enter; it does not exercise an actual mobile software keyboard, so that acceptance check remains unverified. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/qa-regression.spec.js --reporter=line` | Chromium, temporary live API | **Failed:** a valid 21-emoji username is truncated to 20 by the 40 UTF-16-unit HTML maxlength. The contract allows 40 Unicode characters. People has the same issue; fix and rerun the regression. |
| 2026-10-29 | Independent QA: `npm run test:browser -- tests/browser/qa-regression.spec.js -g 'Unicode usernames' --reporter=line --output /tmp/splitmoney-qa-unicode` | Chromium, temporary live API | **Passed:** 21-emoji names are preserved and accepted in login and People after the codepoint fix. |
| 2026-10-29 | `npm run test:browser -- tests/browser/unicode-users.spec.js --reporter=line --workers=1 --output=/tmp/splitmoney-unicode-output` | Chromium, isolated live API server | **Passed:** 2 new cross-feature regressions verified 21- and 40-codepoint emoji login names, 41-codepoint rejection, People create/edit persistence, and 40/41-codepoint phone handling. |
| 2026-10-29 | `npm run test:browser -- tests/browser/login.spec.js tests/browser/people.spec.js tests/browser/qa-regression.spec.js --reporter=line --workers=1 --output=/tmp/splitmoney-unicode-existing-output` | Chromium, isolated live API server | **Passed:** 17 existing login, People, and QA regression tests, including the independent 21-emoji regression that had failed before the fix. |

The browser helper intercepts selected failure responses only to exercise retry/error states; successful login, listing, deletion, and casing behavior use the live B04 API. Actual mobile software keyboard behavior is not covered by the browser suite.

### Decisions and deviations

Added the Playwright harness during F01 rather than waiting for Q03 because the live login endpoint was available and browser verification was part of this step. The harness uses a temporary database per test and can be extended by Q03. No shared API behavior changed. The root integration owner expanded Python package data to include the frontend CSS and JavaScript; Q03 verified the final wheel includes those assets and serves them from an installed environment outside the checkout.

### Remaining work and blockers

F01 browser checks, the combined independent frontend QA gate, Q02's five journeys, and Q03's four-project integrated matrix passed. Automated viewport checks and Q03's 390×520/320×520 reduced-height simulations verify narrow-layout reachability; they do not emulate a software keyboard. The F01 mobile-keyboard acceptance remains unverified because the physical-device check is conditional on a phone or suitable simulator and neither is available here. Q03 verified the final wheel's CSS/JavaScript/schema assets and installed-app serving from outside the checkout. Keep F01 open for that device check; no hardware pass is claimed.

**Next action:** When a physical phone or suitable simulator is available, verify that the mobile software keyboard does not hide the primary action and record the result.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Reviewed the shared contract and B01 static hosting. Started the frontend shell with B04 still pending; browser fixtures will validate login until the real endpoint is available. |
| 2026-10-29 | Complete | Implemented the shell and integration hooks. Eight Chromium browser tests passed against isolated live FastAPI servers; all 137 Python tests passed. Confirmed 320px layout, direct hash routing, startup retry/deletion behavior, and stale-render protection after a user switch. |
| 2026-10-29 | In progress | Independent QA passed eight browser tests and reviewed the shell; reopened because the required actual mobile software keyboard behavior has not been tested. |
| 2026-10-29 | In progress | F02 testing exposed header overflow at 390px with a long selected username. Coordinator adjusted flex shrinking and name truncation; awaiting regression checks at 320/390/430px. |
| 2026-10-29 | In progress | Corrected login’s UTF-16 username limit and verified the new 21/40/41-codepoint regression plus the independent QA test. Actual mobile software keyboard behavior remains unverified. |
| 2026-10-29 | In progress | Clarified that hardware software-keyboard coverage is conditional on an available device. F02–F04 views are integrated; Q03 owns final responsive viewport simulation and wheel verification. The absence of a physical phone is recorded as a limitation, not a pass. |
| 2026-10-29 | In progress | F01 browser and independent QA checks passed; the final Q03 matrix passed 222 tests with two intentional desktop-only skips and no failures. Q03 verified packaged assets and refreshed the mobile/desktop shell screenshots. Keep the mobile software-keyboard acceptance open because the conditional real-device check is unavailable; no hardware coverage is claimed. |

## Frontend module integration

Feature modules live under `app/static/js/`. The shell loads `overview.js`, `expenses.js`, `settlements.js`, and `people.js` lazily when their route opens. A module exports `renderView(contentRoot, context)` (or a default renderer); `app.js` also exports `registerView(route, renderer)` for explicit registration. Renderers should build DOM nodes and set user-controlled text with `textContent` or the shared `element()` helper.

The frozen renderer `context` provides `route`, `api`, `session`, `getCurrentUser()`, `getSelectedUserId()`, `refreshUsers()`, `isCurrent()`, `refreshData()`, `setStatus(message, tone)`, `announce(message, tone)`, `element()`, `inlineError()`, `loadingPanel()`, and `formatUsd()`. After each asynchronous request, check `context.isCurrent()` before changing the page. It becomes false after a route change or user switch. `refreshUsers()` updates a renamed selected user, returns `{state: "stale"}` if selection changed mid-request, and returns the shell to username entry if a successful users list no longer includes the selected UUID. Request failures throw an `ApiError` and do not clear the selected UUID.

The shared `api` object covers `request`, login, users, expenses, settlements, and balances. Helpers use same-origin fetch, JSON bodies, preserve HTTP status and error-envelope details, return `undefined` for 204, and distinguish network failures with `error.network === true`. Stable shell selectors are `#content-root`, `#primary-navigation`, `.nav-item[data-route]`, `#account-name`, `#switch-user`, and the login field `#username`.

## Goal

Create the usable mobile navigation and name-entry experience, with a shared API layer and clear loading/error handling.

## Prerequisites

B01 for static hosting, `plans/00-shared-contract.md` for API shapes, and B04 for live login verification. B04 is complete.

## Deliverables

`app/static/index.html`, `app/static/styles.css`, `app/static/js/api.js`, `app/static/js/app.js`, `app/static/js/session.js`, reusable `app/static/js/ui.js`, `tests/browser/login.spec.js`, and the Playwright harness/configuration (`tests/browser/fixtures.js`, `playwright.config.js`, `package.json`, and `package-lock.json`). Q03 may extend this harness.

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
- Browser checks run successful login/reload/deletion scenarios against the live B04 API; route interceptions are limited to controlled network and error cases.

## Boundary

No expense or payment forms yet. Do not create a password screen or imply an authenticated session.
