import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT
      COALESCE(SUM(ti.total_amount), 0) as cstore_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-16' AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 17, 22, 23, 88888, 99994, 99998, 99999)
""")

print("New C-Store Sales Total for 8/16:", cur.fetchone()[0])
conn.close()
