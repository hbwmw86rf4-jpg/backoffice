import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get total fuel sales
cursor.execute("""
    SELECT 
        SUM(ti.quantity) as total_gallons, 
        SUM(ti.total_amount) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel'
""")
fuel = cursor.fetchone()
print(f"Fuel Gallons: {fuel[0]}, Fuel Sales: {fuel[1]}")

# Get outside vs inside fuel
cursor.execute("""
    SELECT 
        t.is_outside_sale,
        SUM(ti.quantity) as total_gallons, 
        SUM(ti.total_amount) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel'
    GROUP BY t.is_outside_sale
""")
print("Fuel by outside vs inside:")
for row in cursor.fetchall():
    print(f"Outside: {row[0]}, Gallons: {row[1]}, Sales: {row[2]}")

# Get CStore sales
cursor.execute("""
    SELECT 
        SUM(ti.total_amount) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'cstore'
""")
cstore = cursor.fetchone()
print(f"CStore Sales: {cstore[0]}")

conn.close()
