import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT merchandise_code, COUNT(*), MIN(description), MAX(description)
    FROM transaction_items
    GROUP BY merchandise_code
    ORDER BY CAST(merchandise_code AS INTEGER)
""")
rows = cur.fetchall()

print(f"{'Code':<8} | {'Count':<8} | {'Sample Description 1':<30} | {'Sample Description 2'}")
print("-" * 80)
for code, count, desc1, desc2 in rows:
    print(f"{str(code):<8} | {count:<8} | {str(desc1):<30} | {str(desc2)}")

conn.close()
