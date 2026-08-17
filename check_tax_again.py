import sqlite3

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Get tax for 2026-08-15
cur.execute("""
    SELECT 
        SUM(tax_amount) as total_tax,
        SUM(net_amount) as total_net,
        SUM(gross_amount) as total_gross
    FROM transactions
    WHERE business_date = '2026-08-15'
""")
t15 = cur.fetchone()
print(f"2026-08-15 Tax: {t15[0]}, Net: {t15[1]}, Gross: {t15[2]}")

# Get tax for 2026-08-16
cur.execute("""
    SELECT 
        SUM(tax_amount) as total_tax,
        SUM(net_amount) as total_net,
        SUM(gross_amount) as total_gross
    FROM transactions
    WHERE business_date = '2026-08-16'
""")
t16 = cur.fetchone()
print(f"2026-08-16 Tax: {t16[0]}, Net: {t16[1]}, Gross: {t16[2]}")

# Let's calculate the EXACT difference for 2026-08-15
# User Register Key Merchandise = 4654.50
# App True Merchandise = 4882.57
print(f"2026-08-15 Discrepancy (True Merch - User Merch): {4882.57 - 4654.50:.2f}")

# How much of the total tax is for Fuel vs Merchandise?
# The transaction_items table does NOT have tax per item (total_item_tax was 0.00 in my previous check).
# Gilbarco records tax at the TRANSACTION level, not the item level in NAXML!
conn.close()
