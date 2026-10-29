# Splitmoney

Splitmoney is a shared expense ledger for one trusted group. It runs FastAPI and SQLite in one local application and serves a mobile-friendly interface from the same origin. It records USD expenses and actual payments, calculates each person's balance, and suggests ways to settle the current total.

Anyone can select any username. This identifies a person in the shared ledger; it is not a password or an access-control boundary. Do not store information that requires private accounts.

## Requirements and install

Use Python 3.11 or newer. From the repository root, create and activate a virtual environment, then install the exact Python dependencies from the checked-in lock:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
```

To run browser tests, install Node.js 20 or newer, then install the checked-in Playwright package and its Chromium/WebKit browser binaries:

```sh
npm ci
npx playwright install chromium webkit
```

The browser tests launch their own Uvicorn process and use a fresh temporary SQLite database per test. They do not use the ledger configured for normal app use.

## Configure and run

Run these commands from the repository root. The default database is `data/splitmoney.sqlite3`. Set `SPLITMONEY_DB_PATH` to choose a different file; relative paths are resolved from the server's working directory.

```sh
export SPLITMONEY_DB_PATH="$PWD/data/splitmoney.sqlite3"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The health endpoint is `/api/health`. Data remains in the configured SQLite file when the server restarts. Keep this host bound to localhost unless you intend to expose the trusted group's shared ledger on your network.

FastAPI's interactive API reference is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), with the OpenAPI document at [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json). The API includes `POST /api/login`; user CRUD at `/api/users`; expense CRUD at `/api/expenses`; recorded-payment CRUD at `/api/settlements`; and read-only balances and suggestions at `GET /api/balances`.

## How balances work

The app stores one currency: USD. Expense and payment amounts must be positive and have at most two decimal places. Expenses split equally among the included people. Any leftover cents go to participants in ascending UUID order, so the same ledger always produces the same split.

An expense marked **Everyone** includes every current group member. Adding someone later also includes them in past Everyone expenses and changes those expense shares. A selected-people expense keeps exactly its chosen members; the payer shares the cost only when selected. The UI explains the membership effect when an expense or person is added.

A positive balance means the group should pay that person back. A negative balance means that person should pay the group. Suggested transfers are recommendations based on current balances. They do not send money or create payment records; record a payment only after money has actually been paid.

Phone numbers are optional group profile details. Splitmoney does not verify them or send messages. The group is sized for about 20 people, with no hard member limit.

There is no persistent demo-data command. Add group members from the People screen; the deterministic fixture at `tests/fixtures/ledger.json` is reserved for automated tests.

## Tests

With `.venv` activated, run the backend suite:

```sh
python -m pytest
```

After `npm ci` and the Playwright browser installation, run the browser suite across all four configured projects (serially):

```sh
npm run test:browser -- --workers=1 --output=/tmp/splitmoney-browser-all
```

The projects are `mobile-chromium` (390 × 844, touch emulation), `narrow-chromium` (320 × 844, touch emulation), `desktop-chromium` (1280 × 800), and `mobile-webkit` (390 × 844, touch emulation). Run one project with:

```sh
npx playwright test --project=mobile-chromium --workers=1 --output=/tmp/splitmoney-browser-mobile
```

Replace the project name and output directory to run another project. Each Playwright output directory contains its own traces, screenshots, and test results; use a different output path for concurrent or independent runs. Browser and viewport emulation checks layout and touch interactions, but it does not reproduce a phone's software keyboard. No physical phone is included in this QA environment, so keyboard visibility, decimal-entry behavior, and real-device safe-area behavior remain unverified until checked on a phone.

## Reset local ledger

Reset only when the server is stopped. From the repository root with `.venv` activated, resolve and print the exact configured path using the same code as the app. This handles `~` and relative paths the way the application does:

```sh
db_path="$(python -c 'from app.config import resolve_config; print(resolve_config().database_path)')"
printf 'Configured database: %s\n' "$db_path"
```

After checking that printed path, remove the database and its SQLite journal, WAL, and shared-memory sidecars:

```sh
rm -f -- "$db_path" "$db_path-journal" "$db_path-wal" "$db_path-shm"
```

The next server start creates a fresh schema. Reset permanently removes all users, expenses, and recorded payments in that file. Any browser's remembered selected UUID will then be invalid and will return to the username form. Do not run this command while the server is using the database.

The initial schema has no migration framework. Schema changes need an explicit migration; resetting is appropriate only when discarding the existing ledger is acceptable.
