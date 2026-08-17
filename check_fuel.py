import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT ti.upc, ti.item_type, ti.merchandise_code
    FROM transaction_items ti
    WHERE ti.upc = 'FUEL-001'
    LIMIT 10
""")

for row in cur.fetchall():
    print(row)

conn.close()
