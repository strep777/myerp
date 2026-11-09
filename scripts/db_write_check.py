import sqlite3

conn = sqlite3.connect("F:/erp/data/smoke.db", timeout=10)
print("journal", conn.execute("pragma journal_mode").fetchone())
print("checkpoint", conn.execute("pragma wal_checkpoint(TRUNCATE)").fetchone())
conn.execute(
    "insert into audit_logs (user_id, username_snapshot, action, entity_type, entity_no, summary, detail, ip, created_at) "
    "values (1, 'test', 'TEST', 'test', 'x', 'direct write', '{}', '127.0.0.1', datetime('now'))"
)
conn.commit()
print("write ok", conn.execute("select count(*) from audit_logs").fetchone())
conn.close()
