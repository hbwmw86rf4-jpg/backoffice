import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT is_outside_sale, COUNT(*) FROM transactions GROUP BY is_outside_sale')
print(cursor.fetchall())
conn.close()
