import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT filename, error_message FROM import_log WHERE filename LIKE 'PJR%' AND status = 'error' LIMIT 20")
print("PJR Error Files:")
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]}")

conn.close()
