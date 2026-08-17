import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("Clearing transactions data...")
cur.execute("DELETE FROM transaction_items")
cur.execute("DELETE FROM payments")
cur.execute("DELETE FROM loss_prevention_events")
cur.execute("DELETE FROM transactions")

# Reset auto-increment counters if needed
cur.execute("DELETE FROM sqlite_sequence WHERE name='transactions'")
cur.execute("DELETE FROM sqlite_sequence WHERE name='transaction_items'")
cur.execute("DELETE FROM sqlite_sequence WHERE name='payments'")
cur.execute("DELETE FROM sqlite_sequence WHERE name='loss_prevention_events'")

conn.commit()
print("All transactions cleared successfully!")
conn.close()
