import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get total app sales for 2026-08-16
cur.execute("""
    SELECT 
        CAST(ti.merchandise_code AS INTEGER) as dept,
        SUM(ti.total_amount) as sales,
        SUM(ti.quantity) as qty
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-16'
      AND ti.item_type = 'cstore'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
    ORDER BY dept
""")

app_totals = cur.fetchall()

print("App Totals for 2026-08-16:")
for r in app_totals:
    print(f"Dept {r[0]:2}: Sales = {r[1]:8.2f}, Qty = {r[2]:6.2f}")

conn.close()
