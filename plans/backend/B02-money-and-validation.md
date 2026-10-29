# B02 — Money and request validation

## Progress

This section is the authoritative implementation and verification record for B02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

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

**Next action:** After B01, implement exact amount parsing/formatting and their unit tests.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |

## Goal

Centralize exact money conversion, username normalization, and request rules before persistence and endpoint code use them.

## Prerequisites

B01 and the shared contract.

## Deliverables

`app/money.py`, `app/schemas.py`, `app/identity.py`, `tests/test_money.py`, and `tests/test_validation.py`.

## Instructions

1. Implement `parse_amount(value: str) -> int`. Accept a decimal string with one or two optional fractional digits; reject other types, exponent notation, malformed values, whitespace, signs, more than two decimals, nonpositive values, and values above the contract maximum. Convert with exact decimal arithmetic, never binary floats.
2. Implement `format_amount(cents: int) -> str`, including signed balances: `0 -> "0.00"`, `-1 -> "-0.01"`. Input validation of positive record amounts is separate from formatting negative balances.
3. Implement a username helper returning trimmed display name and normalized uniqueness key. Follow NFKC + casefold; validate both the display value and resulting key. Keep phone cleanup in one helper.
4. Define strict Pydantic create and patch models for users, expenses, settlements, and login using the exact contract field names. UUID validation should happen at the request boundary. Canonicalize valid UUID strings before storage.
5. For PATCH, use field-presence tracking (`model_fields_set` / `exclude_unset`) so omitted targets remain unchanged while explicit `null` resets to everyone. Reject empty patches, prohibited null values, and unknown fields.
6. Deduplicate explicit target IDs and sort them canonically. Normalize `[]` to null. Validate that settlement payer and recipient differ after canonicalization. Database existence checks belong to later services.
7. Define response schemas and the error envelope now so the frontend can consume a stable contract. Do not serialize internal cents accidentally as public dollar amounts.

## Unit tests and acceptance

- Amounts: `"1"`, `"1.2"`, `"0.01"`, and the maximum succeed; zero, negatives, booleans/numbers, `"1e2"`, `"NaN"`, `"Infinity"`, `"1.001"`, and an amount above the maximum fail.
- Formatting round-trips valid amounts; negative and very large aggregate balances format exactly.
- `Alice`, ` alice `, and `ALICE` share a key; include non-ASCII casefold/NFKC examples. Empty/control-character names fail.
- Blank phone becomes null; long phone fails.
- UUID validation, target deduplication, self-settlement rejection, unknown-field rejection, and omitted-versus-null PATCH behavior are covered.
- `python -m pytest tests/test_money.py tests/test_validation.py` passes with no database required.
