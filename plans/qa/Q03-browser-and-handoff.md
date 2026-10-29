# Q03 — Browser automation, mobile QA, and handoff

## Progress

This section is the authoritative implementation and verification record for Q03. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After the implementation tracks and Q01–Q02, configure isolated Playwright runs and execute the browser matrix.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
