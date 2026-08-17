import sqlite3
import xml.etree.ElementTree as ET
import os
import glob

sys_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
if not os.path.exists(sys_path):
    print("DB not found")

conn = sqlite3.connect(sys_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get total merchandise for a day (say 2026-08-15)
cur.execute("""
    SELECT 
        SUM(ti.total_amount) as sum_total_amount,
        SUM(ti.quantity * ti.unit_price) as sum_qty_price
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15'
      AND ti.item_type = 'cstore'
""")
row = cur.fetchone()
print(f"2026-08-15: SUM(total_amount) = {row['sum_total_amount']}, SUM(qty * price) = {row['sum_qty_price']}")

# Let's break it down by department
cur.execute("""
    SELECT 
        CAST(ti.merchandise_code AS INTEGER) as dept,
        SUM(ti.total_amount) as sum_total_amount,
        SUM(ti.quantity * ti.unit_price) as sum_qty_price
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15'
      AND ti.item_type = 'cstore'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
    ORDER BY dept
""")
rows = cur.fetchall()
for r in rows:
    print(f"Dept {r['dept']}: sum(total)={r['sum_total_amount']} sum(qty*price)={r['sum_qty_price']}")

# Let's look at one specific transaction to see what XML says
cur.execute("""
    SELECT t.id, t.transaction_id
    FROM transactions t
    WHERE t.business_date = '2026-08-15'
    LIMIT 1
""")
txn = cur.fetchone()
print("Sample TXN:", dict(txn) if txn else None)

conn.close()
