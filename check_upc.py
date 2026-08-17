import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM transaction_items ti WHERE ti.item_type = 'cstore' AND ti.upc NOT IN (SELECT upc FROM pricebook)")
unmatched = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM transaction_items ti WHERE ti.item_type = 'cstore'")
total = cursor.fetchone()[0]

print(f"Unmatched C-Store UPCs in transactions: {unmatched} out of {total}")
conn.close()
