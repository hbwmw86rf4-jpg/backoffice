import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT ti.upc, ti.description, ti.quantity, ti.total_amount
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-16'
      AND ti.merchandise_code = '001'
    LIMIT 10
""")

print("UPCs for merchandise_code '001':")
for row in cur.fetchall():
    print(row)

conn.close()
