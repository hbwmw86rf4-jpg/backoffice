import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT 
        SUM(ti.total_amount) as sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15'
      AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) IN (14, 15, 17, 23, 88888, 99998, 99999)
""")
pt = cur.fetchone()[0] or 0

cur.execute("""
    SELECT 
        SUM(ti.total_amount) as sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15'
      AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 17, 23, 88888, 99998, 99999)
""")
merch = cur.fetchone()[0] or 0

print(f"2026-08-15 App CStore Total: ${pt + merch:.2f}")
print(f"True Merchandise Total: ${merch:.2f}")
print(f"Pass-through / Lottery Total: ${pt:.2f}")

conn.close()
