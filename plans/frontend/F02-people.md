# F02 — People management

## Progress

This section is the authoritative implementation and verification record for F02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After F01 and B04, implement the people list and add/edit forms.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

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
