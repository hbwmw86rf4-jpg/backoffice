import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get total tax for 2026-08-15
cur.execute("""
    SELECT 
        SUM(tax_amount) as total_tax,
        SUM(net_amount) as total_net,
        SUM(gross_amount) as total_gross,
        SUM(total_amount) as total_grand
    FROM transactions
    WHERE business_date = '2026-08-15'
""")

row = cur.fetchone()
print(f"2026-08-15 App Transaction Totals:")
print(f"Tax: ${row[0]:.2f}")
print(f"Net: ${row[1]:.2f}")
print(f"Gross: ${row[2]:.2f}")
print(f"Grand: ${row[3]:.2f}")

cur.execute("""
    SELECT 
        SUM(ti.tax_amount) as total_item_tax
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.business_date = '2026-08-15'
""")
row2 = cur.fetchone()
print(f"Total Item Tax: ${row2[0]:.2f}")

conn.close()
