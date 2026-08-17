import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT id, transaction_id, COUNT(*) 
    FROM transactions 
    WHERE business_date = '2026-08-15'
    GROUP BY transaction_id
    ORDER BY COUNT(*) DESC
    LIMIT 10
""")
rows = cur.fetchall()
print("Top 10 most common transaction_ids on 2026-08-15:")
for r in rows:
    print(r)

conn.close()
