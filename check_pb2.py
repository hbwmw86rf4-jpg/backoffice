import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, upc, name FROM pricebook WHERE name LIKE '%Christian brothers%'")
print(cursor.fetchall())

conn.close()
