import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, name, price, upc FROM pricebook WHERE id = 17923")
row = cursor.fetchone()
print(f"Item 17923: {row}")

conn.close()
