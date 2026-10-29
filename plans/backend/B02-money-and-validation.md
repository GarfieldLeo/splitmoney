# B02 — Money and request validation

## Progress

This section is the authoritative implementation and verification record for B02. Update it in the same change as the work; follow the [tracking rules](../README.md#progress-tracking-rules).

- **Status:** Complete
- **Last updated:** 2026-10-29
- **Current summary:** Exact cent conversion, identity normalization, strict request/response schemas, PATCH presence rules, and B02 unit tests are implemented. The isolated acceptance suite passes.

### Completion checklist

- [x] Implement all deliverables and instructions in this step.
- [x] Execute the required tests and acceptance checks; record actual results below.
- [x] Update affected documentation/contracts and record any deviations or limitations.

### Completed work and changed files

Implemented exact money conversion and formatting in `app/money.py`; Unicode username, phone, and UUID helpers in `app/identity.py`; strict request, response, health, error, and balance schemas in `app/schemas.py`; and focused tests in `tests/test_money.py` and `tests/test_validation.py`. The response models keep cents internal and public amounts as decimal strings. PATCH models preserve omitted versus explicit-null fields, reject empty patches, and reject null required values. Explicit target IDs are canonicalized, deduplicated, sorted, and empty lists become null.

### Verification evidence

| Date | Command or manual scenario | Environment / data | Result and evidence |
| --- | --- | --- | --- |
| 2026-10-29 | `.venv/bin/python -m pytest tests/test_money.py tests/test_validation.py` | Python 3.11.6; project `.venv` with pytest 9.2.0 and Pydantic v2 | Passed: **59 passed** in 0.04s. One Starlette deprecation warning from the installed FastAPI test-client dependency; no B02 test failures. |
| 2026-10-29 | `.venv/bin/python -m compileall -q app/money.py app/identity.py app/schemas.py tests/test_money.py tests/test_validation.py` | Same project virtual environment | Passed: all owned modules and tests compiled. |
| 2026-10-29 | Independent QA: `.venv/bin/python -m pytest tests/test_money.py tests/test_validation.py -q` and direct validation probes | Project `.venv`; Unicode fullwidth name, leading-zero money, null/empty targets and self-settlement | **Passed:** 59 tests; probes confirmed normalization, exact cents, target reset presence, and self-settlement rejection. One Starlette deprecation warning. |

Replace the placeholder with actual results, including failures and unexecuted checks. Link supporting logs/screenshots where useful; this table remains the authoritative summary.

### Decisions and deviations

No contract deviations. `validate_settlement_participants(payer_id, target_user_id)` is provided so a service can check a one-sided settlement PATCH after merging the omitted participant from storage. Aggregate balance and suggested-payment schemas accept values larger than the per-record amount ceiling.

### Remaining work and blockers

No B02 work remains. The full application API suite depends on later CRUD and database steps.

**Next action:** B03 and CRUD steps can import the helper and schema names recorded in this module.

### Progress log

| Date | Status | Update |
| --- | --- | --- |
| 2026-10-29 | Not started | Added the plan and its progress record; no implementation claimed. |
| 2026-10-29 | In progress | Reviewed contract and dependencies; started money, identity, and strict schema helpers. |
| 2026-10-29 | Complete | Added request/response schemas and 59 unit assertions; isolated B02 tests and compile check passed. |

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
