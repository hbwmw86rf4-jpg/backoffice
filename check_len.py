import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT upc FROM pricebook LIMIT 10")
for row in cursor.fetchall():
    print(repr(row[0]), len(row[0]))

conn.close()
