import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT status, count(*) FROM import_log GROUP BY status")
print("Status counts:")
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]}")

cursor.execute("SELECT file_type, count(*) FROM import_log GROUP BY file_type")
print("\nFile types:")
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]}")

cursor.execute("SELECT filename, error_message FROM import_log WHERE status = 'error' LIMIT 10")
print("\nRecent errors:")
for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]}")

cursor.execute("SELECT filename FROM import_log WHERE filename LIKE 'CPJR%' LIMIT 5")
print("\nCPJR files:")
for row in cursor.fetchall():
    print(row[0])

cursor.execute("SELECT filename FROM import_log WHERE filename LIKE 'PJR%' LIMIT 5")
print("\nPJR files:")
for row in cursor.fetchall():
    print(row[0])

conn.close()
