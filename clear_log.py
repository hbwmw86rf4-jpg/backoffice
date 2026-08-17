import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("Clearing import log...")
cur.execute("DELETE FROM import_log")
conn.commit()
print("Import log cleared!")
conn.close()
