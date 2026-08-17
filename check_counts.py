import sqlite3
import time

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

start = time.time()
cur.execute("SELECT COUNT(*) FROM transaction_items")
count = cur.fetchone()[0]
end = time.time()

print(f"Total transaction_items: {count} (took {end-start:.2f} seconds)")

start = time.time()
cur.execute("SELECT COUNT(*) FROM transactions")
tcount = cur.fetchone()[0]
end = time.time()

print(f"Total transactions: {tcount} (took {end-start:.2f} seconds)")

conn.close()
