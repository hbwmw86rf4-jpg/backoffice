import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("DELETE FROM transaction_items")
cursor.execute("DELETE FROM transactions")
cursor.execute("DELETE FROM import_log WHERE filename LIKE 'PJR%' OR filename LIKE 'CPJR%'")
cursor.execute("DELETE FROM processed_files WHERE filename LIKE 'PJR%' OR filename LIKE 'CPJR%'")
conn.commit()

cursor.execute("SELECT count(*) FROM processed_files")
print(f"processed_files remaining: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM transactions")
print(f"transactions remaining: {cursor.fetchone()[0]}")
cursor.execute("SELECT count(*) FROM import_log")
print(f"import_log remaining: {cursor.fetchone()[0]}")

conn.close()
print("Database fully cleared for re-import")
