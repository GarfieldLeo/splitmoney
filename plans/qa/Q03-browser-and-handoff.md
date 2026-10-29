# Q03 — Browser automation, mobile QA, and handoff

## Progress

This section is the authoritative implementation and verification record for Q03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** The README, four-project Playwright matrix, installed-wheel verification, 44px touch-target fixes, contrast/focus corrections, and final layout review are complete. The final matrix passed 222 of 224 tests with zero failures and two intentional desktop-only skips. Trace-confirmed immediate API-read races now wait for PATCH success and canonical UI completion without changing expected values. Physical keyboard coverage remains conditional and unavailable, documented as a limitation.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Updated [README.md](../../README.md) with fresh setup/run/test/reset steps, scope semantics, and all four browser project commands. Added [final-qa.spec.js](../../tests/browser/final-qa.spec.js) for named controls, headings/status descriptions, focus return, per-route mobile/desktop screenshots, 20-person scroll reachability, 44px touch targets, reduced-height viewport simulation, and stale selection after external deletion. Raised expense, payment, and People action/target controls from 42px to 44px. Darkened shared muted/placeholder/navigation/date/detail text and the focus outline; focused text and select inputs now get a solid outline. Stacked impact notices and fixed desktop navigation after visual review. Clarified the conditional physical-device check in F01, refreshed the Q01 summary, installed Playwright WebKit, and completed the four-project matrix.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | Independent QA: `npx playwright test tests/browser/final-qa.spec.js --workers=2 --reporter=line --output=/tmp/splitmoney-qa-final-independent`; installed-package smoke from `/tmp` | Four configured Chromium/WebKit projects; installed wheel in fresh Python 3.11 environment with temporary database | **Passed:** 14 tests, 2 intentional desktop skips. Health, root, CSS, and Overview JavaScript returned 200 from the installed package. Independently inspected the mobile Payments screenshot; layout and navigation were legible. Reviewed README, matrix and package configuration. The reduced-height viewport is a simulation; no physical software keyboard was tested. |
| 2026-10-29 | Initial full matrix: `npm run test:browser -- --workers=2 --reporter=line --output=/tmp/splitmoney-q03-final` | Node.js 21.6.2, Playwright 1.64.1; 390×844 Chromium/WebKit, 320×844 Chromium, 1280×800 Chromium | **219 passed, 3 failed, 2 skipped** out of 224. Failures were all in immediate API reads after expense PATCH clicks: one narrow Chromium split-edit case and two mobile WebKit split/amount edit cases. The two skips are the 20-person mobile scroll check and short-height keyboard simulation, intentionally skipped in desktop Chromium. Trace evidence and corrected synchronization are recorded below; this initial result is retained as history. |
| 2026-10-29 | `npx playwright install webkit` | Playwright 1.64.1 on macOS arm64 | **Passed:** WebKit 27.2 installed. The first CDN connection reset at 10%; Playwright retried its fallback download endpoint and completed. This only installs a browser binary; no tests were launched. |
| 2026-10-29 | `python3 -m pip wheel --no-deps --no-build-isolation --wheel-dir /tmp/splitmoney-q03-wheel-final-source .`; inspect wheel entries | Python 3.11; `splitmoney-0.1.0-py3-none-any.whl`, SHA-256 `8d988f4c769fcef7d84194f3e312aafa8a06eee90b6d9bf905e6ad739c102808` | **Passed:** final-source wheel has 38 files, including `schema.sql`, all 8 JavaScript modules, all 5 CSS assets, root HTML, 44px touch/focus updates, stacked impact notices, and fixed desktop navigation. |
| 2026-10-29 | Fresh `/tmp/splitmoney-q03-final-installed` Python 3.11 environment: install `requirements.lock`, install final-source wheel; run Uvicorn from `/tmp` and request health, `/`, CSS, and JavaScript assets | No checkout on import path; `/tmp/splitmoney-q03-final-wheel.sqlite3` | **Passed:** installed module loaded from `/private/tmp/splitmoney-q03-final-installed/lib/python3.11/site-packages/app/__init__.py`; health, root, final CSS and JS returned 200, packaged schema initialized exactly `users`, `expenses`, and `settlements`. |
| 2026-10-29 | `/tmp/splitmoney-q03-installed/bin/python -m pytest -q` | Fresh Python 3.11 environment populated from `requirements.lock`; checkout tests use temporary SQLite files | **Passed:** 149 tests; one Starlette `httpx` deprecation warning. |
| 2026-10-29 | CSS contrast audit and focus-style update; calculate foreground/background ratios against the authored palette | Source CSS and final mobile/desktop live-browser screenshots | **Passed:** muted text on canvas 5.19:1 and paper 5.76:1; placeholders on white 5.82:1; overview kicker on its tinted card 5.19:1; focus outline on canvas 4.80:1 and paper 5.33:1. Text pairs exceed 4.5:1 and focus outline exceeds 3:1. Earlier values for these pairs ranged from 2.82:1 to 4.44:1. |
| 2026-10-29 | CSS geometry checks in the initial four-project run | Chromium 390×844 and 320×844 touch profiles; 44px minimum action/target assertions | **Passed in both mobile Chromium projects:** navigation, expense choices/actions, payment actions, and People actions meet 44px minimums. The 20-person list remains scroll-reachable and selected; the 390×520 short-height simulation keeps Save reachable above the bottom nav. No software keyboard was opened. |
| 2026-10-29 | Trace review for `tests/browser/expenses.spec.js` failures | Playwright WebKit trace at `/tmp/splitmoney-q03-final/expenses-an-explicit-split-dac95--stays-explicit-when-edited-mobile-webkit/trace.zip` | **Cause confirmed:** in the failed amount-edit case the Save click began at monotonic 103924.230, the test's immediate API GET began at 103968.737, and PATCH was still in flight from 103965.904 until about 103971.994. The read could precede the commit. Tests now wait for the matching PATCH 200 and `Expense updated.` canonical-refresh status before exact API assertions; no expected value was changed. |
| 2026-10-29 | Desktop navigation and shared impact-note visual review; CSS correction | 1280×800 Chromium; initial screenshots in `/tmp/splitmoney-q03-final/final-qa-final-live-ledger-32159-review-across-primary-pages-desktop-chromium/`; final screenshots below | **Issue confirmed and resolved:** the desktop nav had been static after long Overview content; it is fixed with reserved bottom padding. Expenses/Payments/People impact notices now put their heading on its own line, preventing compressed words. Refreshed screenshots were reviewed and the final matrix passed. |
| 2026-10-29 | Final full matrix: `npm run test:browser -- --workers=2 --reporter=line --output=/tmp/splitmoney-q03-final-source` | Node.js 21.6.2; Playwright 1.64.1; 390×844 mobile Chromium, 320×844 narrow Chromium, 1280×800 desktop Chromium, 390×844 mobile WebKit; isolated live backend/SQLite per test | **Passed:** 222 tests, 2 intentional skips, 0 failures (224 total). All 56 tests passed for each project except the two mobile-only Q03 checks intentionally skipped in desktop Chromium: 20-person scroll reachability and the 520px reduced-height simulation. The simulation passed at 390×520 and 320×520; no software keyboard was opened. Slow/error responses, stale route/user races, and duplicate-write protections passed in the existing suite. |
| 2026-10-29 | Final Q03 live-ledger screenshot review | Representative three-person ledger; mobile Chromium and desktop Chromium; artifacts in `/tmp/splitmoney-q03-final-source/final-qa-final-live-ledger-32159-review-across-primary-pages-{mobile-chromium,desktop-chromium}/` | **Passed visually:** Overview, Expenses, Payments, and People screenshots captured on each device profile. Root reviewed the refreshed mobile Payments and desktop Overview screenshots after the impact-note and persistent desktop navigation fixes; no further visual changes requested. Artifacts remain in `/tmp`, outside the repository. |
| 2026-10-29 | Final render/interaction checks | All four browser projects; primary routes and editor forms | **Passed:** one H1 per route, named form controls/links/buttons, current-route navigation, no horizontal overflow, 44px mobile navigation/action controls, focus return after cancellation, 3px visible focus outline on amount fields, status announcements, and decimal input mode. Twenty-person list/target rows remain scroll-reachable and the last target remains selectable. Static authored-color ratios recorded above meet 4.5:1 normal text and 3:1 focus indicator thresholds. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

Q03 treats the actual-phone keyboard check as conditional on device availability, matching this step's explicit "when available" instruction. No physical phone or usable simulator is available in this environment. F01 now records automated narrow/mobile viewport coverage separately and leaves hardware behavior unverified; Q03's reduced-height test is labeled as a simulation. The touch-target fixes raise the affected controls to the F01 44px target. The contrast updates preserve the existing color palette while meeting WCAG's normal-text and focus-indicator ratios. Desktop navigation stays visible while scrolling; impact-note headings remain readable at narrow widths. No product/API logic changed.

### Remaining work and blockers

No required Q03 work remains. The real-device keyboard check is conditional on availability, and no physical phone or usable simulator is available in this environment. Automated mobile projects and reduced-height viewport checks passed but do not establish hardware software-keyboard behavior. F01–F04 independent gates and Q02 independent QA have passed.

**Next action:** Hand off the frozen Q03 source and evidence for the final independent gate.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Reviewed the shared contract, prerequisites, and implementation progress records. Confirmed backend/Q01 evidence and existing frontend/browser coverage; waiting for Q02 to release the exclusive browser slot before changing the shared Playwright config or running the matrix. |
| 2026-10-29 | In progress | Q02 released the browser slot. Added Node engine metadata, the four-project matrix, README commands, and Q03 live-ledger/accessibility coverage; built and smoke-tested the installed wheel outside the checkout. Initial matrix ran 224 tests (219 pass, 3 race failures, 2 desktop-only skips). Trace confirmed immediate API reads overlapped expense PATCHes, so F03 assertions now await PATCH 200 and the canonical update announcement. Root visual review also identified compressed impact-note headings and static long-page desktop navigation; both layout issues are corrected ahead of the final matrix. |
| 2026-10-29 | Complete | The four-project matrix passed 222/224 with zero failures and two documented desktop-only skips. Exact expense assertions wait for acknowledged writes and canonical completion. Touch geometry, focus, headings, labels, mobile scrolling, all four route screenshots, and refreshed desktop/mobile layouts passed review. Physical-device keyboard behavior remains unverified because no physical phone or usable simulator was available. README, package metadata, installed-wheel checks, and Q03 evidence are complete for independent handoff. |

## Goal

Verify the integrated application on mobile-sized browsers and leave reproducible run, test, and reset instructions.

## Prerequisites

Backend and frontend tracks plus Q01–Q02. Browser tests drafted during frontend work are consolidated here.

## Deliverables

`package.json`, `playwright.config.js`, reusable browser test fixtures, completed `tests/browser/*.spec.js`, final `README.md`, and the completed Progress record in this file. Use Playwright only as a development/testing dependency; the frontend itself remains plain HTML/CSS/JS.

## Instructions

1. Add a reproducible Playwright setup and one command to launch tests. Start Uvicorn against a temporary database on a dedicated local port with a health readiness check. Never let tests attach to an arbitrary developer server/database.
2. Isolate test databases per worker or run the ledger browser suite serially with a fresh database per test. Reset by replacing the disposable file while its test server is stopped; do not add an unauthenticated production reset endpoint.
3. Run the primary journey against real API calls. Use fixtures/mocked requests only for deliberate loading/error-state coverage; label those tests clearly.
4. Cover login/reload/switch user; people CRUD/conflicts; expense CRUD/targets; payment CRUD/suggestions; canceled confirmations; API validation display; pending double-tap behavior; and stale local selection after a user was deleted elsewhere.
5. Browser matrix: mobile Chromium at 390x844, a narrow 320px viewport, desktop Chromium at 1280x800, and WebKit at a mobile viewport. Use touch emulation where appropriate. Record unavailable browser/OS coverage explicitly; emulation does not prove real-device keyboard behavior.
6. Manually check on an actual phone when available: virtual keyboard, decimal input, bottom-navigation safe area, scrolling to all participants, editor focus, and save actions. If no physical device is available, record that limitation without claiming a pass.
7. Verify a screen-reader-friendly structure: correct headings, form labels, keyboard focus, status announcements, and debts described in words rather than color alone. Inspect contrast and visible focus. Add lightweight automated accessibility checks only if useful; manual checks remain necessary.
8. Simulate slow and failed responses. Check that delayed responses cannot overwrite a newer route/user selection, mutation retries are not automatic, and a double tap while pending creates one record.
9. Verify a fresh install using README only. Document Python setup, dependency installation, Uvicorn command, localhost URL, test commands, optional demo fixture setup, environment configuration, and data-file location.
10. Document reset: stop the server, identify the configured SQLite path, remove that database and any SQLite sidecars, then restart to recreate tables. State that this removes all users/expenses/payments and local selected UUIDs will be invalidated. Never include a reset command aimed at an ambiguous path.
11. Explain USD-only equal splits, optional phones, Everyone membership semantics, trusted-group identity, settlement direction, and the difference between suggestions and recorded payments. Include local-network testing instructions only if needed, with explicit host/port configuration.

## QA evidence format

Use this file's Progress → Verification evidence section to record execution date, commit or working-tree reference, setup/test commands, browser versions/viewports, automated results, manual scenario results, and any actual limitations. Include failed scenarios with reproduction steps and resolved results. Link Q01/Q02 evidence for their detailed results instead of duplicating a second report. Never prefill pass marks from the expected outcomes in the plan.

## Final acceptance gate

- Backend suite passes and browser journey passes against the real backend.
- Three entities have verified create/read/edit/delete UI flows; blocked deletes show useful messages.
- Monetary invariants and all Q02 expected balances hold.
- Mobile layouts have no horizontal overflow, important controls are reachable, and errors preserve user input.
- Persistence, renames, dynamic membership, empty states, and missing-current-user recovery are verified.
- Documentation works from a fresh checkout. SQLite files, temporary screenshots, dependency folders, and demo data are not accidentally committed.
- Any unavailable physical-device/browser checks are listed as limitations; unresolved correctness failures block completion.
