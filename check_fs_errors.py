import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT filename, error_message FROM import_log WHERE error_message LIKE '%EBUSY%' OR error_message LIKE '%ENOENT%' LIMIT 10")
print("File system errors:")
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]}")

conn.close()
