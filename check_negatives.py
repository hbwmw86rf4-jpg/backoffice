import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT description, quantity, unit_price, total_amount FROM transaction_items WHERE quantity < 0 OR total_amount < 0 LIMIT 10")
print("Items with negative quantity/amount:")
for row in cursor.fetchall():
    print(row)

cursor.execute("SELECT COUNT(*) FROM transaction_items WHERE quantity < 0 OR total_amount < 0")
print(f"Total negative items: {cursor.fetchone()[0]}")

conn.close()
