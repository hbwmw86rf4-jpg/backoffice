import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT ti.merchandise_code, COUNT(*), SUM(ti.total_amount)
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-16'
      AND CAST(ti.merchandise_code AS INTEGER) = 1
    GROUP BY ti.merchandise_code
""")

print("Breakdown of merchandise_code for Dept 1:")
for row in cur.fetchall():
    print(row)

conn.close()
