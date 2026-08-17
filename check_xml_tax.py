import sqlite3
import xml.etree.ElementTree as ET
import glob
import os

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Find a transaction that had tax (difference between amount and qty*price, or just let's look at a transaction with Cigs)
cur.execute("""
    SELECT t.transaction_id, ti.merchandise_code, ti.quantity, ti.unit_price, ti.total_amount
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.business_date = '2026-08-15' AND ti.merchandise_code = '5'
    LIMIT 1
""")
row = cur.fetchone()
print(f"Sample DB record: {row}")

# Find the XML file that contains this transaction
xml_dir = r'C:\Users\shell\Documents\office\backoffice\data\xml'
xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))

found_file = None
for xf in xml_files[:500]: # Just check first 500
    with open(xf, 'r', encoding='utf-8') as f:
        content = f.read()
        if f'transaction_id="{row[0]}"' in content or f'TransactionID>{row[0]}<' in content or f'<TransactionID>{row[0]}</TransactionID>' in content or f'id="{row[0]}"' in content or row[0] in content:
            found_file = xf
            break

if found_file:
    print(f"Found in XML file: {found_file}")
    with open(found_file, 'r', encoding='utf-8') as f:
        print(f.read())
else:
    print("Could not quickly find XML file. Let's just parse the first XML file and show a transaction line item.")
    with open(xml_files[0], 'r', encoding='utf-8') as f:
        print(f.read()[:2000])

conn.close()
