import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get total items in transaction_id '0' vs other transactions
cur.execute("""
    SELECT t.transaction_id, COUNT(ti.id), SUM(ti.total_amount), SUM(ti.quantity)
    FROM transactions t
    JOIN transaction_items ti ON t.id = ti.transaction_id
    WHERE t.business_date = '2026-08-15'
    GROUP BY t.id
    ORDER BY SUM(ti.total_amount) DESC
    LIMIT 10
""")

print("Largest transactions on 2026-08-15:")
for r in cur.fetchall():
    print(r)

conn.close()
