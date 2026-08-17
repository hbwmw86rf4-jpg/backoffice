import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT upc FROM transaction_items WHERE item_type = 'cstore' LIMIT 10")
print("Transaction Items UPCs:")
for row in cursor.fetchall():
    print(repr(row[0]))

print("\nPricebook UPCs:")
cursor.execute("SELECT upc FROM pricebook LIMIT 10")
for row in cursor.fetchall():
    print(repr(row[0]))

print("\nUnmatched Transaction UPCs:")
cursor.execute("SELECT DISTINCT ti.upc FROM transaction_items ti WHERE ti.item_type = 'cstore' AND ti.upc NOT IN (SELECT upc FROM pricebook) LIMIT 10")
for row in cursor.fetchall():
    print(repr(row[0]))

conn.close()
