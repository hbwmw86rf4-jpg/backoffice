import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get cstore totals for 2026-08-16 grouped by "Is Merchandise" vs "Pass-through"
cur.execute("""
    SELECT 
        CAST(ti.merchandise_code AS INTEGER) as dept,
        SUM(ti.total_amount) as sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-16'
      AND ti.item_type = 'cstore'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
""")
rows = cur.fetchall()

merch_total = 0
passthrough_total = 0

for r in rows:
    dept = r[0]
    sales = r[1]
    # Departments 14 (Instant Lottery), 15 (Machine Lotto), 17 (Gas Card), 23 (Paid Out), 88888 (Car Wash), 99998 (Cash Card)
    if dept in [14, 15, 17, 23, 88888, 99998, 99999]:
        passthrough_total += sales
    else:
        merch_total += sales

print(f"2026-08-16 (Today):")
print(f"App CStore Total (Everything): ${merch_total + passthrough_total:.2f}")
print(f"True Merchandise Total: ${merch_total:.2f}")
print(f"Pass-through / Lottery Total: ${passthrough_total:.2f}")

conn.close()
