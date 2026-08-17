import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== APP IPC HANDLER (2026-08-16 TODAY SUNDAY) DEPARTMENT SALES SUMMARY ===")
cur.execute("""
    SELECT
      COALESCE(d.name, 'Dept ' || ti.merchandise_code, 'Uncategorized') as department,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON d.id = CAST(ti.merchandise_code AS INTEGER)
    WHERE t.business_date BETWEEN '2026-08-16' AND '2026-08-16'
      AND ti.item_type = 'cstore'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
    ORDER BY total_sales DESC
""")
rows = cur.fetchall()

print(f"{'Department':<20} | {'Qty':<8} | {'Sales':<12}")
print("-" * 45)
for dept, unique_items, qty, sales in rows:
    print(f"{dept:<20} | {int(qty):<8} | ${sales:>9.2f}")

conn.close()
