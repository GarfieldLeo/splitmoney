"""Independent cross-cutting regression checks."""

import sqlite3

from app.db import initialize_database, read_connection, write_transaction


def test_read_transaction_keeps_snapshot_across_concurrent_commit(tmp_path):
    path = tmp_path / "ledger.sqlite3"
    initialize_database(path)
    # WAL allows a concurrent writer to commit while the reader holds a snapshot.
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
    with write_transaction(path) as connection:
        connection.execute("INSERT INTO users VALUES ('a', 'Alice', 'alice', NULL)")

    with read_connection(path) as reader:
        assert reader.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
        with write_transaction(path) as writer:
            writer.execute("INSERT INTO users VALUES ('b', 'Bob', 'bob', NULL)")
        assert reader.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1

    with read_connection(path) as reader:
        assert reader.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
