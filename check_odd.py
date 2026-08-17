import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT ti.description, ti.unit_price, ti.quantity, ti.total_amount, t.transaction_id, ti.upc
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date IN ('2026-08-15', '2026-08-16')
      AND CAST(ti.merchandise_code AS INTEGER) = 15
    LIMIT 20
""")

print("Items sold under Dept 15:")
for row in cur.fetchall():
    print(row)

cur.execute("""
    SELECT ti.description, ti.unit_price, ti.quantity, ti.total_amount, t.transaction_id, ti.upc
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date IN ('2026-08-15', '2026-08-16')
      AND CAST(ti.merchandise_code AS INTEGER) = 17
    LIMIT 20
""")

print("\nItems sold under Dept 17:")
for row in cur.fetchall():
    print(row)

conn.close()
