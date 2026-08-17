import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT business_date, COUNT(*), SUM(total_amount) 
    FROM transactions 
    GROUP BY business_date
    ORDER BY business_date DESC
""")

for row in cursor.fetchall():
    print(f"Date: {row[0]}, TxCount: {row[1]}, Total $: {row[2]}")

conn.close()
