import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT DISTINCT ti.upc, ti.description, SUM(ti.quantity), SUM(ti.total_amount)
    FROM transaction_items ti 
    WHERE ti.item_type = 'cstore' 
      AND ti.upc NOT IN (SELECT upc FROM pricebook)
      AND ti.upc != ''
      AND ti.upc != '00000000000'
    GROUP BY ti.upc, ti.description
    ORDER BY SUM(ti.quantity) DESC
    LIMIT 5
""")

print("Top 5 Unmatched Items Sold:")
for row in cursor.fetchall():
    print(f"UPC: {row[0]} | Desc: {row[1]} | Qty Sold: {row[2]} | Total $: {row[3]}")

conn.close()
