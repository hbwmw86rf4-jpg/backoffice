import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("SELECT type, name, tbl_name FROM sqlite_master WHERE type='index'")
indices = cur.fetchall()

print("Existing indices:")
for idx in indices:
    if not idx[1].startswith('sqlite_autoindex'):
        print(f"Table: {idx[2]}, Index: {idx[1]}")

conn.close()
