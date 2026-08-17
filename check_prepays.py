import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT description, SUM(total_amount), COUNT(*) 
    FROM transaction_items 
    WHERE description LIKE '%prepay%' OR description LIKE '%fuel%' OR description LIKE '%pump%'
    GROUP BY description
    ORDER BY SUM(total_amount) DESC
    LIMIT 20
""")

print("Potential Prepay Items in DB:")
for row in cursor.fetchall():
    print(f"Desc: {row[0]}, Total $: {row[1]}, Count: {row[2]}")

cursor.execute("""
    SELECT description, SUM(total_amount), COUNT(*) 
    FROM transaction_items 
    WHERE item_type = 'cstore'
    GROUP BY description
    ORDER BY SUM(total_amount) DESC
    LIMIT 20
""")

print("\nTop C-Store Items by Sales:")
for row in cursor.fetchall():
    print(f"Desc: {row[0]}, Total $: {row[1]}, Count: {row[2]}")

conn.close()
