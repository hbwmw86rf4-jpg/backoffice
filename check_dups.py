import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Check for duplicate transactions on 2026-08-15
cur.execute("""
    SELECT transaction_id, register_id, COUNT(*) as cnt, SUM(total_amount)
    FROM transactions
    WHERE business_date = '2026-08-15'
    GROUP BY transaction_id, register_id
    HAVING COUNT(*) > 1
""")

dups = cur.fetchall()
print(f"Found {len(dups)} duplicate transaction_id + register_id combos on 2026-08-15.")
if dups:
    print(dups[:10])

# Check total sales if we only count DISTINCT transactions (using id)
# But wait, transaction_items joins to transaction_id. If a transaction is duplicated, its items might be duplicated!
cur.execute("""
    SELECT COUNT(*) FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15'
""")
print(f"Total transaction_items on 2026-08-15: {cur.fetchone()[0]}")

conn.close()
