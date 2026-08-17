import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== 2026-08-16 (TODAY SUNDAY) SALES BY DEPARTMENT IN DATABASE ===")
cur.execute("""
    SELECT ti.merchandise_code, d.name, COUNT(ti.id) as item_count, SUM(ti.total_amount) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON ti.merchandise_code = CAST(d.id AS TEXT) OR ti.merchandise_code = d.id
    WHERE t.business_date = '2026-08-16' AND ti.item_type != 'fuel'
    GROUP BY ti.merchandise_code, d.name
    ORDER BY total_sales DESC
""")
rows = cur.fetchall()

for code, name, count, total in rows:
    total_val = total or 0.0
    print(f"Code {str(code):<5} | Dept Name: {str(name):<20} | Items: {count:<6} | Total: ${total_val:>9.2f}")

print("\n=== SAMPLE ITEMS FOR TOP DEPARTMENTS ON 2026-08-16 ===")
cur.execute("""
    SELECT ti.merchandise_code, d.name, ti.description, ti.total_amount
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON ti.merchandise_code = CAST(d.id AS TEXT) OR ti.merchandise_code = d.id
    WHERE t.business_date = '2026-08-16' AND ti.item_type != 'fuel'
    ORDER BY ti.total_amount DESC
    LIMIT 30
""")
sample_items = cur.fetchall()
for code, name, desc, amt in sample_items:
    print(f"Code {str(code):<5} | Dept: {str(name):<18} | ${amt:>7.2f} | {desc}")

conn.close()
