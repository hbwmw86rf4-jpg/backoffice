import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT ti.description, ti.total_amount, ti.quantity
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = '2026-08-15' AND ti.item_type = 'cstore'
    ORDER BY ti.total_amount DESC
    LIMIT 20
""")

print("Top C-Store Items for 08-15:")
for row in cursor.fetchall():
    print(f"Desc: {row[0]}, Total $: {row[1]}, Qty: {row[2]}")

conn.close()
