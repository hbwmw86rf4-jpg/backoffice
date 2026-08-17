import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("""
    SELECT t.total_amount, t.gross_amount, t.net_amount, ti.quantity, ti.total_amount, ti.description, ti.unit_price 
    FROM transactions t
    JOIN transaction_items ti ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel' AND t.is_outside_sale = 1
    LIMIT 10
""")

print("Outside Sales (Pay at Pump):")
for row in cursor.fetchall():
    print(row)

cursor.execute("""
    SELECT t.total_amount, t.gross_amount, t.net_amount, ti.quantity, ti.total_amount, ti.description, ti.unit_price 
    FROM transactions t
    JOIN transaction_items ti ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel' AND t.is_outside_sale = 0
    LIMIT 10
""")

print("\nInside Sales (Prepay):")
for row in cursor.fetchall():
    print(row)

conn.close()
