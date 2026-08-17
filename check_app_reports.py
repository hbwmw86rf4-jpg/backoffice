import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== 2026-08-15 MERCHANDISE SALES BY DEPARTMENT IN DATABASE ===")
cur.execute("""
    SELECT d.id, d.name, COUNT(ti.id) as item_count, SUM(ti.total_amount) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON ti.merchandise_code = CAST(d.id AS TEXT) OR ti.merchandise_code = d.id
    WHERE t.business_date = '2026-08-15' AND ti.item_type != 'fuel'
    GROUP BY d.id, d.name
    ORDER BY total_sales DESC
""")
rows = cur.fetchall()

grand_total = 0.0
for dept_id, name, count, total in rows:
    total_val = total or 0.0
    grand_total += total_val
    print(f"Dept {str(dept_id):<5} | {str(name):<20} | Items: {count:<6} | Total: ${total_val:>9.2f}")

print(f"{'-'*60}")
print(f"TOTAL MERCHANDISE SALES: ${grand_total:,.2f}")

conn.close()
