# B01 — App and test scaffolding

## Progress

This section is the authoritative implementation and verification record for B01. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Added the isolated FastAPI factory, static placeholder, shared JSON error handlers, pinned dependency install, README, and per-test temporary database fixture. Verified all six B01 tests both in `.venv` and a clean Python 3.11 environment; verified the documented Uvicorn command starts and serves health. The scaffold does not open or create a database on import.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented the factory, per-instance database configuration, health route, root/static serving, and JSON handlers in `app/__init__.py`, `app/config.py`, `app/errors.py`, `app/main.py`, and `app/static/index.html`. Added isolated `TestClient` fixtures and health/config/validation-envelope coverage in `tests/conftest.py` and `tests/test_health.py`. Added Python metadata and an exact dependency lock in `pyproject.toml` and `requirements.lock`, setup/run/test/reset instructions in `README.md`, and SQLite/database sidecar ignores in `.gitignore`.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_health.py` | Project `.venv`, Python 3.11.6 | **Passed:** 6 tests, including health JSON, root HTML, static mount, API 404 envelope, validation envelope compatible with B02 `ErrorEnvelope`, and independent app database paths. One Starlette deprecation warning recommends `httpx2`; required `httpx` TestClient works. |
| 2026-10-29 | `uv venv /tmp/splitmoney-b01-venv --python 3.11`; `uv pip install --python /tmp/splitmoney-b01-venv/bin/python -r requirements.lock`; `/tmp/splitmoney-b01-venv/bin/python -m pytest tests/test_health.py` | Fresh Python 3.11.6 environment installed from the checked-in lock | **Passed:** lock installed 22 pinned packages and all 6 tests passed. Same Starlette deprecation warning. |
| 2026-10-29 | `.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`, then `curl -i http://127.0.0.1:8000/api/health` | Project `.venv`; default database path | **Passed:** Uvicorn started, health returned HTTP 200 and `{"status":"ok"}`, and server shut down cleanly. |
| 2026-10-29 | Initial validation-envelope test run | Project `.venv` | **Failed during test development:** a local postponed annotation was interpreted as a query parameter. The harness now uses an embedded body parameter; the final runs above pass. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_health.py -q`; Uvicorn reload startup on port 18765 and `curl /api/health`; separate factory configuration probe | Project `.venv`, Python 3.11; temporary paths and environment variable | **Passed:** 6 tests; live health returned `{"status":"ok"}`; explicit path overrides environment and factory construction did not create either database. Validation errors validate against B02's `ErrorEnvelope`. One Starlette deprecation warning. |

The clean-environment lock install and required server startup were both exercised. No other B01 acceptance check remains unrun.

### Decisions and deviations

Pinned direct dependencies in `pyproject.toml`; generated `requirements.lock` with `uv pip compile` so transitive versions are pinned for fresh installs. Exposed both `app.state.config.database_path` and `app.state.database_path` for straightforward downstream database helpers. Validation issues use the shared `loc`/`msg`/`type` shape and are checked against B02's `ErrorEnvelope`. The placeholder test checks stable page structure and branding so F01 can replace its copy. No shared contract changes or scope deviations.

### Remaining work and blockers

No B01 work remains. B03 can attach database initialization to the app lifecycle and read the configured path from `app.state.config.database_path` (also available directly at `app.state.database_path`). The current app intentionally has no database startup hook.

**Next action:** Proceed to B02/B03 integration; B03 owns database initialization and lifecycle wiring.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | In progress | Reviewed the shared contract, B01 requirements, and B02 boundary. Confirmed Python 3.11 and compatible FastAPI/Uvicorn/pytest/httpx packages are available in the project `.venv`; no `AGENTS.md` applies. |
| 2026-10-29 | Complete | Implemented the scaffold and documentation; six tests passed in both project and clean environments, and Uvicorn/health startup passed. Recorded the one corrected test-harness failure and the non-blocking Starlette deprecation warning above. |

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
