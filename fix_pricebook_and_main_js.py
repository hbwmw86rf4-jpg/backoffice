import sqlite3
import os

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("=== 1. Syncing Pricebook department_id with actual Merchandise Codes ===")
cur.execute("""
    UPDATE pricebook
    SET department_id = (
        SELECT CAST(ti.merchandise_code AS INTEGER)
        FROM transaction_items ti
        WHERE ti.upc = pricebook.upc AND ti.merchandise_code IS NOT NULL AND ti.merchandise_code != ''
        LIMIT 1
    )
    WHERE EXISTS (
        SELECT 1 FROM transaction_items ti
        WHERE ti.upc = pricebook.upc AND ti.merchandise_code IS NOT NULL AND ti.merchandise_code != ''
    )
""")
updated_count = cur.rowcount
conn.commit()
print(f"Updated {updated_count} pricebook item department assignments.")

# Fix main.js
main_js_path = r'C:\Users\shell\Documents\office\backoffice\src\main.js'
with open(main_js_path, 'r', encoding='utf-8') as f:
    main_code = f.read()

fixed_main_code = main_code.replace(
    "LEFT JOIN departments d ON d.id = COALESCE(pb.department_id, CAST(ti.merchandise_code AS INTEGER))",
    "LEFT JOIN departments d ON d.id = CAST(ti.merchandise_code AS INTEGER)"
).replace(
    "GROUP BY COALESCE(d.id, CAST(ti.merchandise_code AS INTEGER))",
    "GROUP BY CAST(ti.merchandise_code AS INTEGER)"
)

with open(main_js_path, 'w', encoding='utf-8') as f:
    f.write(fixed_main_code)
print("Fixed main.js successfully.")

# Fix reports.js
reports_js_path = r'C:\Users\shell\Documents\office\backoffice\src\database\reports.js'
with open(reports_js_path, 'r', encoding='utf-8') as f:
    reports_code = f.read()

fixed_reports_code = reports_code.replace(
    "LEFT JOIN departments d ON d.id = COALESCE(pb.department_id, CAST(ti.merchandise_code AS INTEGER))",
    "LEFT JOIN departments d ON d.id = CAST(ti.merchandise_code AS INTEGER)"
).replace(
    "GROUP BY COALESCE(d.id, CAST(ti.merchandise_code AS INTEGER))",
    "GROUP BY CAST(ti.merchandise_code AS INTEGER)"
)

with open(reports_js_path, 'w', encoding='utf-8') as f:
    f.write(fixed_reports_code)
print("Fixed reports.js successfully.")

# Also sync subfolder passport-backoffice database
sub_db_path = r'C:\Users\shell\Documents\office\backoffice\passport-backoffice\data\backoffice.db'
if os.path.exists(sub_db_path):
    sub_conn = sqlite3.connect(sub_db_path)
    sub_cur = sub_conn.cursor()
    sub_cur.execute("""
        UPDATE pricebook
        SET department_id = (
            SELECT CAST(ti.merchandise_code AS INTEGER)
            FROM transaction_items ti
            WHERE ti.upc = pricebook.upc AND ti.merchandise_code IS NOT NULL AND ti.merchandise_code != ''
            LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM transaction_items ti
            WHERE ti.upc = pricebook.upc AND ti.merchandise_code IS NOT NULL AND ti.merchandise_code != ''
        )
    """)
    sub_conn.commit()
    sub_conn.close()
    print("Updated subfolder database successfully.")

conn.close()
