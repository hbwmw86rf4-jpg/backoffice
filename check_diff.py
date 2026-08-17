import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get total for 2026-08-15
cur.execute("""
    SELECT 
        CAST(ti.merchandise_code AS INTEGER) as dept,
        d.name,
        SUM(ti.total_amount) as sales,
        SUM(ti.quantity) as qty
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON d.id = CAST(ti.merchandise_code AS INTEGER)
    WHERE t.business_date = '2026-08-15'
      AND ti.item_type = 'cstore'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
    ORDER BY dept
""")

rows = cur.fetchall()
print("=== 2026-08-15 App DB Totals ===")
app_total = 0
for r in rows:
    print(f"{r[1]} (Dept {r[0]}): ${r[2]:.2f}")
    app_total += r[2]
print(f"Total: ${app_total:.2f}")

conn.close()
