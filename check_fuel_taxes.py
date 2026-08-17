import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT quantity, unit_price, total_amount, tax_amount 
    FROM transaction_items 
    WHERE item_type = 'fuel'
    LIMIT 10
""")

print("Fuel Sales:")
for row in cursor.fetchall():
    print(f"Qty: {row[0]}, Unit Price: {row[1]}, Total $: {row[2]}, Tax $: {row[3]}")

conn.close()
