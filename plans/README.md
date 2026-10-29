# Splitmoney implementation plans

Turn the goals in [`../init_plan`](../init_plan) into small, independently verifiable changes. These files are the single source of truth for the planned work and its implementation progress. Each step's Progress section records its current implementation status, verification evidence, decisions, and any remaining limitations.

User-approved defects and subsequent requirement changes are tracked in [bug_reports.md](bug_reports.md). BR-001 records the pending requirement to restrict modifications and deletion to the logged-in user and permitted record owner. It supersedes unrestricted editing as a future requirement; implementation is deferred, and the existing completion evidence describes the original contract.

## Product goal

A single shared expense group for roughly 20 people. Anyone enters a username to join or return, records expenses and payments, and sees who should pay whom. Use FastAPI, SQLite, and mobile-friendly HTML/CSS/JavaScript served by the same application.

## How to use these plans

1. Read [the shared contract](00-shared-contract.md) before implementing any step.
2. Select one numbered file. Its prerequisites identify the earlier steps required.
3. Implement only that file's deliverables, including its tests or verification.
4. Run its acceptance checks and the existing relevant tests before moving on.
5. Update the step's Progress section with completed work, changed files, verification evidence, remaining work, and the next action before handing off or stopping. If a contract changes, update both the contract and affected plans in the same change.

Each step is intended to be one focused implementation change. Paths mentioned inside steps are relative to the repository root. Individual backend steps include tests; the QA phase adds cross-feature and browser coverage.

## Progress tracking rules

- Each step's **Progress** section is the authoritative record of that step's current status, work completed, verification, decisions, blockers, and next action. This index is a navigation/dependency guide; it deliberately does not duplicate completion checkboxes or statuses.
- Use statuses **Not started**, **In progress**, **Blocked**, or **Complete**. A blocked step must name the actual blocker and what resolves it. Unmet prerequisites belong in remaining work until they actually prevent ongoing implementation.
- When starting a step, review its prerequisites, change its status to In progress, and update its date and summary. Keep remaining work specific enough that someone else can resume without reading chat history.
- During implementation, record completed sub-tasks and changed file paths; add the exact test command or manual scenario, environment/fixture, actual result, and any supporting artifact links. Record failures and checks not run honestly. Do not mark a test passed based on planned outcomes.
- Before each handoff or stopping point, update the current summary, remaining work/blockers, next action, and dated progress log. Keep the summary current; retain significant historical outcomes in the log/evidence rather than overwriting them with a misleading final pass.
- Mark Complete only when the entire step and its required acceptance checks are satisfied. A required unavailable check remains outstanding; optional coverage limitations must be explicit. Reopen a completed step if later changes invalidate its acceptance evidence.
- Keep QA results inside the relevant QA step's Progress section. Logs and screenshots can live in supporting files, but do not create a separate status tracker or QA report with competing conclusions. Backend/frontend step evidence belongs in its own step; QA steps link it instead of copying its status.
- The shared contract is authoritative for cross-feature behavior; each step file owns its implementation instructions and progress. Update both in the same change when decisions affect the contract. Revise plans that no longer match the agreed implementation, recording why in Decisions and deviations. `init_plan` remains the original brief; chat messages and commit messages do not replace the plan records.

## Agent execution and review

Implementation is assigned one step per GPT-6 Luna subagent with extra-high reasoning. An independent GPT-6.1 Terra subagent with high reasoning reviews and tests each completed step. The coordinating agent manages dependencies, checks integration, and sends defects back for correction. Record each review's actual result in the step's Progress section; a reviewer must not edit that section while its implementing agent is still updating it.

## Backend track

- [B01 — App and test scaffolding](backend/B01-app-scaffold.md)
- [B02 — Money and request validation](backend/B02-money-and-validation.md)
- [B03 — SQLite tables and transaction helpers](backend/B03-sqlite-schema.md)
- [B04 — User CRUD and username login](backend/B04-users-and-login.md)
- [B05 — Expense CRUD](backend/B05-expense-crud.md)
- [B06 — Settlement CRUD](backend/B06-settlement-crud.md)
- [B07 — Pure split and debt calculation functions](backend/B07-balance-math.md)
- [B08 — Database aggregation and balance API](backend/B08-balance-api.md)

## Frontend track

- [F01 — Mobile shell, API client, and login](frontend/F01-shell-and-login.md)
- [F02 — People management](frontend/F02-people.md)
- [F03 — Expense list and editor](frontend/F03-expenses.md)
- [F04 — Balances, payments, and settlement editor](frontend/F04-balances-and-settlements.md)

## QA track

- [Q01 — Deterministic fixtures and cross-feature API tests](qa/Q01-api-regression.md)
- [Q02 — Mock user flow with expected results](qa/Q02-mock-user-flow.md)
- [Q03 — Browser automation, mobile QA, and handoff](qa/Q03-browser-and-handoff.md)

## Dependency order

```text
B01 -> B02 -> B03 -> B04 -> B05 -> B06 -> B07 -> B08
          shared contract + B01 -> F01 -> F02 -> F03 -> F04
B08 + F04 -> Q01 -> Q02 -> Q03
```

The linear backend order is the simplest execution order, not a requirement that all files depend on every earlier file. B07 is pure logic and can be implemented after B02. Frontend work can use the mock contract before the API routes exist. Replace mocks with real API calls before marking a frontend step complete in the full application.

## Completion criteria

- All three entities support create, read, edit, and delete through the API and UI.
- Username login works regardless of casing; references survive a rename.
- Everyone and selected-person splits, historical settlements, and suggested payments are correct to the cent.
- Database state survives a restart; the documented database-file reset works while the server is stopped.
- Automated backend and browser tests pass; the mock flow and mobile checks are completed.
- A fresh checkout can be installed and run using the README alone.

## Scope boundaries

The original implemented scope is one group, one currency (USD), equal splits, no passwords, no notification sending, no payment processor, and no multi-group permissions. Selecting a username currently provides identification, not security. [BR-001](bug_reports.md#br-001--enforce-logged-in-identity-and-ownership-on-modifications-and-deletion) changes the future identity/ownership requirements; its policy decisions and implementation remain pending. Phone numbers are optional stored profile data. Suggestions are not recorded payments until someone explicitly records them.
