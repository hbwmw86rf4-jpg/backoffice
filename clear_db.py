import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear transactions and items
cursor.execute("DELETE FROM transaction_items")
cursor.execute("DELETE FROM transactions")

# Remove PJR files from import_log so they are re-processed
cursor.execute("DELETE FROM import_log WHERE filename LIKE 'PJR%'")

# Also delete any CPJR files just in case
cursor.execute("DELETE FROM import_log WHERE filename LIKE 'CPJR%'")

conn.commit()

cursor.execute("SELECT COUNT(*) FROM import_log")
remaining = cursor.fetchone()[0]
print(f"Database cleared. Remaining entries in import_log: {remaining}")

conn.close()
