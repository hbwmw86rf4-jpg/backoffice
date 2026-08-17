import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT business_date, 
           SUM(CASE WHEN ti.item_type = 'fuel' THEN ti.total_amount ELSE 0 END) as fuel_sales,
           SUM(CASE WHEN ti.item_type = 'cstore' THEN ti.total_amount ELSE 0 END) as cstore_sales
    FROM transactions t
    JOIN transaction_items ti ON ti.transaction_id = t.id
    GROUP BY business_date
    ORDER BY business_date DESC
    LIMIT 20
""")

print("Sales by Business Date:")
for row in cursor.fetchall():
    print(f"Date: {row[0]}, Fuel: {row[1]}, CStore: {row[2]}")

conn.close()
