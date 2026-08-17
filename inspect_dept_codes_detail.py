import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT merchandise_code, description, COUNT(*)
    FROM transaction_items
    WHERE merchandise_code IN ('19', '25', '26', '27', '28', '200')
    GROUP BY merchandise_code, description
    ORDER BY merchandise_code, COUNT(*) DESC
""")
rows = cur.fetchall()

print("=== Merchandise Code Details ===")
for code, desc, count in rows:
    print(f"Code {code:<5} | {desc:<35} | Count: {count}")

conn.close()
