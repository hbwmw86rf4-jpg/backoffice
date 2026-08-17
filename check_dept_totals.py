import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("""
    SELECT 
        d.name as dept_name,
        CAST(ti.merchandise_code AS INTEGER) as code,
        COUNT(*) as count,
        SUM(ti.total_amount) as total
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN departments d ON d.id = CAST(ti.merchandise_code AS INTEGER)
    WHERE t.business_date = '2026-08-16'
    GROUP BY CAST(ti.merchandise_code AS INTEGER)
""")

for row in cur.fetchall():
    print(row)

conn.close()
