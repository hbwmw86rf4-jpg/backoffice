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
    LIMIT 5
""")

print("Sales by Business Date:")
for row in cursor.fetchall():
    print(f"Date: {row[0]}, Fuel: {row[1]}, CStore: {row[2]}")

cursor.execute("""
    SELECT ti.description, SUM(ti.total_amount), SUM(ti.quantity), COUNT(*)
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel'
    GROUP BY ti.description
    ORDER BY SUM(ti.total_amount) DESC
""")
print("\nFuel Totals by Description:")
for row in cursor.fetchall():
    print(f"Desc: {row[0]}, Total $: {row[1]}, Qty: {row[2]}, Count: {row[3]}")

cursor.execute("""
    SELECT ti.description, SUM(ti.total_amount), COUNT(*)
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'cstore'
    GROUP BY ti.description
    ORDER BY SUM(ti.total_amount) DESC
    LIMIT 10
""")
print("\nTop C-Store Items by Sales:")
for row in cursor.fetchall():
    print(f"Desc: {row[0]}, Total $: {row[1]}, Count: {row[2]}")

conn.close()
