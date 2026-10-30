# Shared product and API contract

## Goal

Give backend, frontend, and QA one concrete set of behaviors. The initial plan leaves edge cases open; the decisions below are the proposed defaults for implementation.

**Pending approved change (2026-10-29):** [BR-001](bug_reports.md#br-001--enforce-logged-in-identity-and-ownership-on-modifications-and-deletion) requires logged-in identity and ownership checks on modifications and deletion. The payer is the expense/payment owner; profile changes are self-only. This supersedes the unrestricted-mutation policy below for future implementation. The current application still follows the original contract; implementation is explicitly deferred, and remaining identity/payer-change decisions are tracked in that report.

## Identity and group membership

- Use UUID strings for every primary key and stored user reference. API responses also supply usernames for presentation. Do not use usernames as foreign keys: renaming a person must preserve history.
- Trim usernames; allow 1–40 Unicode characters, rejecting control characters. Compute `username_key = unicodedata.normalize("NFKC", username).casefold()` after trimming; reject an empty normalized key. Persist a unique key, rather than relying on SQLite's ASCII-oriented `NOCASE` behavior.
- Preserve display casing. Logging in as `ALICE` returns existing `Alice` without renaming her. Creating or renaming to a key owned by someone else returns `409`.
- Username login creates a user if missing. No password or session token; the frontend remembers the selected UUID locally. Server routes intentionally allow trusted group members to edit any record.
- Phone: optional string, trim it, treat blank as null, maximum 40 characters. Do not imply phone verification or send messages.
- Null or empty expense targets mean **everyone currently in the users table**, including people added after the expense. Explain this in the UI and README. Explicit targets mean exactly that stored set; the payer participates only if included.
- Block deletion with `409` when a user pays an expense, is an explicit target, or is either side of a settlement. Also block deletion of any user while an everyone expense exists, since membership affects that expense. Delete the relevant records first. Renaming is allowed.
- Approximately 20 users is sizing context, not a hard product limit.

## Money and timestamps

**Pending approved change (2026-10-29):** [BR-002](bug_reports.md#br-002--cap-each-expense-at-10000000-and-retain-exact-money-arithmetic) sets a future inclusive cap of **$100,000.00 per expense**. It does not cap aggregate totals or change payment limits. The larger maximum below remains the current implementation until this deferred change is completed.

- USD only; positive amounts, maximum `$999,999,999.99` per record, at most two fractional digits. Reject zero, negative, malformed, NaN, infinity, and more than two decimals; do not silently round inputs.
- JSON input/output amounts are decimal strings: `"12.34"`. Store integer `amount_cents`; arithmetic is integer only. This deliberately refines the original proposal of floating-point dollar values to prevent balance drift.
- UUIDs are generated on creation. Timestamps are UTC ISO 8601 strings with a `Z` suffix. Preserve `created_at` on updates and refresh `modified_at`.
- Equal splits assign `total_cents // n` to each participant. Give the remaining cents to the first participants in ascending UUID order. Deduplicate explicit targets before splitting. This is deterministic across queries and renames.

## Data tables (exactly three application tables)

| Table | Columns |
| --- | --- |
| `users` | `id TEXT PRIMARY KEY`, `username TEXT NOT NULL`, `username_key TEXT NOT NULL UNIQUE`, `phone TEXT NULL` |
| `expenses` | `id TEXT PRIMARY KEY`, `payer_id TEXT NOT NULL REFERENCES users(id)`, `target_ids TEXT NULL` (JSON array of UUID strings), `amount_cents INTEGER NOT NULL CHECK(amount_cents > 0)`, `created_at TEXT NOT NULL`, `modified_at TEXT NOT NULL` |
| `settlements` | `id TEXT PRIMARY KEY`, `payer_id TEXT NOT NULL REFERENCES users(id)`, `target_user_id TEXT NOT NULL REFERENCES users(id)`, `amount_cents INTEGER NOT NULL CHECK(amount_cents > 0)`, `created_at TEXT NOT NULL`, `modified_at TEXT NOT NULL`, `CHECK(payer_id <> target_user_id)` |

Normalize empty target arrays to SQL NULL. Validate UUIDs inside the JSON list in the service layer within the write transaction; SQLite cannot enforce foreign keys inside JSON. Index expense payer and settlement participant columns. No extra join table, auth table, or group table is needed.

## HTTP conventions

- Prefix routes with `/api`. Request and response bodies use JSON. Validation failures use `422`, missing records use `404`, reference/uniqueness conflicts use `409`.
- Successful create: `201`; login lookup/create: `200`; reads/patches: `200`; successful delete: `204` with no body.
- Error body: `{"error":{"code":"user_in_use","message":"This person is used by existing records."}}`. Normalize FastAPI validation errors to the same envelope, using `validation_error`; optional `fields` details may be added. Never send SQL or stack traces to clients.
- PATCH means partial update; reject empty patches and unknown fields. Required fields cannot be null. Expense `target_user_ids` and user `phone` can be explicitly null to reset them.
- All request models reject unknown fields. Lists are bare JSON arrays. Sort users by normalized username then UUID; expenses and settlements by `created_at DESC, id ASC`.
- Common response shapes:

```json
{
  "user": {"id":"uuid", "username":"Alice", "phone":null},
  "expense": {
    "id":"uuid", "payer_id":"uuid", "payer_username":"Alice",
    "target_user_ids":null, "target_usernames":null, "amount":"60.00",
    "created_at":"2026-10-29T12:00:00Z", "modified_at":"2026-10-29T12:00:00Z"
  },
  "settlement": {
    "id":"uuid", "payer_id":"uuid", "payer_username":"Bob",
    "target_user_id":"uuid", "target_username":"Alice", "amount":"15.00",
    "created_at":"2026-10-29T12:00:00Z", "modified_at":"2026-10-29T12:00:00Z"
  }
}
```

These are examples of three separate entity shapes, not a wrapper returned by every route. For explicit targets, return parallel target UUID/name arrays in UUID order; null arrays indicate everyone.

| Route | Request / behavior |
| --- | --- |
| `GET /api/health` | `{"status":"ok"}` |
| `POST /api/login` | `{"username":"Alice"}` -> user, creating if absent |
| `GET /api/users` | List users |
| `POST /api/users` | `{"username":"Alice","phone":null}` -> user |
| `GET /api/users/{id}` | One user |
| `PATCH /api/users/{id}` | Any of `username`, `phone` |
| `DELETE /api/users/{id}` | Delete if unreferenced under membership rules |
| `GET /api/expenses` | List expenses |
| `POST /api/expenses` | `{"payer_id":"uuid","target_user_ids":null,"amount":"60.00"}` |
| `GET /api/expenses/{id}` | One expense |
| `PATCH /api/expenses/{id}` | Any of `payer_id`, `target_user_ids`, `amount` |
| `DELETE /api/expenses/{id}` | Delete expense |
| `GET /api/settlements` | List recorded payments |
| `POST /api/settlements` | `{"payer_id":"uuid","target_user_id":"uuid","amount":"15.00"}` |
| `GET /api/settlements/{id}` | One payment |
| `PATCH /api/settlements/{id}` | Any of `payer_id`, `target_user_id`, `amount` |
| `DELETE /api/settlements/{id}` | Delete payment |
| `GET /api/balances` | Read current totals and suggested payments; never writes |

Default omitted expense targets to everyone. Settlement amounts can exceed the current debt, since the ledger records real payments; calculations then reverse the resulting credit/debt as appropriate. Suggestions never impose a cap on actual recorded payments.

## Balance signs and response

For each person calculate:

```text
expense_paid  = amounts of expenses this person paid
expense_share = this person's allocated expense shares
settlement_sent / settlement_received = actual recorded payments
net = expense_paid - expense_share + settlement_sent - settlement_received
```

Positive net means **should receive**; negative means **should pay**. A debtor sending a payment moves their negative balance toward zero, and the recipient's positive balance toward zero.

The original `(money_in, money_out)` requirement is represented explicitly by contribution functions: expense `money_out = expense_paid`, `money_in = expense_share`; settlement `money_out = settlement_sent`, `money_in = settlement_received`. For expenses, `money_in` is the allocated benefit, not a literal cash receipt. Keep the descriptive names in public API fields so users do not have to infer that distinction. Combining contributions gives `net = sum(money_out) - sum(money_in)`.

```json
{
  "users":[{
    "user_id":"alice-uuid", "username":"Alice", "expense_paid":"60.00",
    "expense_share":"30.00", "settlement_sent":"0.00",
    "settlement_received":"15.00", "net":"15.00"
  }],
  "totals":{"expenses":"90.00","settlements":"15.00"},
  "suggested_payments":[{
    "from_user_id":"cara-uuid", "from_username":"Cara",
    "to_user_id":"alice-uuid", "to_username":"Alice", "amount":"15.00"
  }]
}
```

This response is a shape illustration; the complete numerical fixture is in [Q02](qa/Q02-mock-user-flow.md). Include all users, even those with zero activity. Empty database returns empty arrays and zero totals. Sort response users by username; suggestions by the algorithm's deterministic order.

Build debtors by descending absolute negative net and creditors by descending positive net, with UUID tie-breaks. Use two pointers, transfer the smaller outstanding amount, and advance each exhausted side. Skip zeros. This provides a valid simplified payment set; it does not promise the globally fewest possible transfers. Work on copies of input balances.

## Frontend boundaries

Use native HTML/CSS/JS modules and `fetch`, same origin as FastAPI. Pages/tabs: Overview, Expenses, Payments, People. Use accessible labels, USD formatting, loading/empty/error states, and explicit delete confirmation. Remember selected user UUID in `localStorage`, validate it against current users on reload, and return to login when it no longer exists. Use `textContent` for names. Do not insert untrusted names into HTML templates.

The name-entry screen says that anyone in the group can select a username. Everyone-split forms say that future members are included. All post-mutation views reload canonical data from the API; a network failure preserves the form, shows an actionable error, and never shows a false success.
