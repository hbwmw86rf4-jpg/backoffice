import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def pad_upc(upc):
    upc_str = str(upc).strip()
    if not upc_str:
        return '00000000000'
    if len(upc_str) <= 11:
        return upc_str.zfill(11)
    if len(upc_str) == 12 and upc_str.startswith('0'):
        return upc_str[1:12]
    return upc_str

cursor.execute("SELECT id, upc FROM transaction_items WHERE item_type = 'cstore'")
rows = cursor.fetchall()

updated = 0
for row in rows:
    ti_id, old_upc = row
    new_upc = pad_upc(old_upc)
    if new_upc != old_upc:
        cursor.execute("UPDATE transaction_items SET upc = ? WHERE id = ?", (new_upc, ti_id))
        updated += 1

print(f"Updated {updated} rows in transaction_items.")

conn.commit()
conn.close()
