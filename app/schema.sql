CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    phone TEXT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    payer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_ids TEXT NULL CHECK (
        CASE
            WHEN target_ids IS NULL THEN 1
            WHEN json_valid(target_ids) THEN json_type(target_ids) = 'array'
            ELSE 0
        END
    ),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY NOT NULL,
    payer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    CHECK (payer_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_payer_id
    ON expenses(payer_id);

CREATE INDEX IF NOT EXISTS idx_settlements_payer_id
    ON settlements(payer_id);

CREATE INDEX IF NOT EXISTS idx_settlements_target_user_id
    ON settlements(target_user_id);
