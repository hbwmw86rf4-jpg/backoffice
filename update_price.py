import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

upc = '09674900584'
new_price = 9.09

# Get the current ID and price
cursor.execute("SELECT id, price FROM pricebook WHERE upc = ?", (upc,))
row = cursor.fetchone()

if row:
    pb_id, old_price = row
    
    # Update pricebook
    cursor.execute("UPDATE pricebook SET price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?", (new_price, pb_id))
    
    # Insert into price_history so it gets pushed to POS
    cursor.execute("INSERT INTO price_history (pricebook_id, old_price, new_price) VALUES (?, ?, ?)", (pb_id, old_price, new_price))
    
    print(f"Updated UPC {upc} to {new_price} (was {old_price})")
    conn.commit()
else:
    print(f"UPC {upc} not found.")

conn.close()
