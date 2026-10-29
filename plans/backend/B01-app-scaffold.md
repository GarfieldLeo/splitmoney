# B01 — App and test scaffolding

## Progress

This section is the authoritative implementation and verification record for B01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** Review the scaffold prerequisites, then configure Python dependencies and the app factory.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Start a FastAPI server, serve the future static frontend, and run isolated tests from a fresh checkout.

## Prerequisites

Read `plans/00-shared-contract.md`. No application implementation is required. The repository currently contains `init_plan`; empty `app/static/`, `tests/`, or a local `.venv` may already exist from initial setup.

## Deliverables

`pyproject.toml`, `app/__init__.py`, `app/main.py`, `app/config.py`, `app/static/index.html`, `tests/conftest.py`, `tests/test_health.py`, and initial `README.md`.

## Instructions

1. Configure Python >=3.11, FastAPI, Uvicorn, and test dependencies pytest and httpx. Resolve compatible versions in a clean virtual environment and record the exact reproducible install approach in README; do not depend on globally installed packages.
2. Implement `create_app(database_path=None)` and export `app = create_app()`. Resolve database location from an explicit argument, then `SPLITMONEY_DB_PATH`, then a local `data/splitmoney.sqlite3`. Avoid opening or mutating a database merely by importing modules.
3. Add `GET /api/health` with the contract response. Serve `GET /` as `index.html`; mount assets under `/static`, keeping API routes separate.
4. Install a shared JSON error helper/exception handler for application errors and request-validation errors. Preserve `404` for unknown API routes; don't redirect them to HTML.
5. Add a minimal accessible HTML placeholder with viewport metadata. Do not build feature screens yet.
6. Configure tests to construct a fresh app per test using a pytest temporary database path and TestClient as a context manager, so startup/shutdown execute. Later steps will attach database initialization to that lifecycle.
7. Ignore local SQLite files, sidecar files, and the data directory. Keep secrets, virtual environments, and generated test artifacts out of Git.

## Verification and acceptance

- `python -m pytest tests/test_health.py` passes: health response, `/` HTML, static asset serving, and missing API route returning `404`.
- `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` starts using the README commands.
- Two app instances can be configured with different database paths without sharing configuration.
- README explains install, run, test, and the chosen configuration variable. It identifies username selection as a trusted-group feature, not authenticated access control.

## Boundary

Do not add tables or CRUD endpoints in this step.
