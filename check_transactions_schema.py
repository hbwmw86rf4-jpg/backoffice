import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("PRAGMA table_info(transactions)")
cols = [r[1] for r in cur.fetchall()]
print("Transactions columns:", cols)

cur.execute("PRAGMA table_info(transaction_items)")
cols_items = [r[1] for r in cur.fetchall()]
print("Transaction_items columns:", cols_items)

conn.close()
