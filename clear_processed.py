import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("DELETE FROM processed_files WHERE filename LIKE 'PJR%'")
    cursor.execute("DELETE FROM processed_files WHERE filename LIKE 'CPJR%'")
    conn.commit()
    
    cursor.execute("SELECT count(*) FROM processed_files")
    remaining = cursor.fetchone()[0]
    print(f"processed_files cleared. Remaining: {remaining}")
except Exception as e:
    print(f"Error: {e}")

conn.close()
