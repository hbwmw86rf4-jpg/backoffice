import sqlite3
import os
import xml.etree.ElementTree as ET
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'

DEPT_MAP = {
    "1":  "Edible",
    "2":  "Non-Edible",
    "3":  "Snacks",
    "4":  "Tobacco",
    "5":  "Cigs",
    "6":  "Beer",
    "7":  "Porters",
    "8":  "Phone Cards",
    "9":  "Soda",
    "10": "Cig Cartons",
    "11": "Deli",
    "12": "Auto Parts",
    "13": "Candy",
    "14": "Instant Lottery",
    "15": "Machine Lotto",
    "16": "Fountain",
    "17": "Gas Card",
    "18": "Ice",
    "19": "HBA",
    "20": "Liquor",
    "21": "GROC NO TAX",
    "22": "SC",
    "23": "PAID OUT",
    "24": "Hot Food",
    "25": "Vapes etc",
    "200": "Vapes etc",
    "1024": "Fuel 1",
    "1025": "Fuel 2",
    "88888": "Car Wash",
    "99998": "Cash Card",
    "99999": "Store Coupon"
}

FUEL_GRADES = {"001": "Regular", "002": "Plus", "003": "Super"}
CC_TENDER_CODES = {"creditCards", "outsideCredit", "debitCards", "outsideDebit"}

print("=== 1. Updating Departments Table in backoffice.db ===")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("DELETE FROM departments")
for dept_id_str, name in DEPT_MAP.items():
    try:
        dept_id = int(dept_id_str)
        category = 'Fuel' if 'Fuel' in name else ('Lottery' if 'Lotto' in name or 'Lottery' in name else 'C-Store')
        cur.execute("INSERT INTO departments (id, name, category) VALUES (?, ?, ?)", (dept_id, name, category))
    except Exception as e:
        pass

conn.commit()
print("Departments table updated successfully.")

print("\n=== 2. Re-importing XML Files using Mac rs_xml_parser Rules ===")
start_t = time.time()

# Clear existing transactions for clean re-import
cur.execute("DELETE FROM payments")
cur.execute("DELETE FROM transaction_items")
cur.execute("DELETE FROM transactions")
cur.execute("DELETE FROM import_log")
conn.commit()

xml_files = [f for f in os.listdir(staging_dir) if f.upper().endswith('.XML')]
print(f"Found {len(xml_files)} XML files in staging BOOutBox.")

parsed_tx_count = 0
items_to_insert = []
payments_to_insert = []
tx_to_insert = []
import_log_to_insert = []

tx_id_counter = 1

for fname in xml_files:
    fpath = os.path.join(staging_dir, fname)
    if os.path.getsize(fpath) == 0: continue

    try:
        tree = ET.parse(fpath)
        root = tree.getroot()
        se = root.find(".//SaleEvent")
        if se is None: continue

        biz_date = se.findtext("BusinessDate", "").strip()
        if not biz_date: continue

        journal_seq = se.findtext("SequenceNumber", "0")
        event_start_date = se.findtext("EventStartDate", "")
        event_start_time = se.findtext("EventStartTime", "")

        tx_id = tx_id_counter
        tx_id_counter += 1

        tx_total = 0.0
        tx_tax = 0.0
        is_outside = 0
        register_id = '1'

        for tl in root.findall(".//TransactionLine"):
            status = tl.get("status", "normal")
            if status != "normal": continue

            # FuelLine (dispensed fuel only)
            fl = tl.find("FuelLine")
            if fl is not None:
                gid = fl.findtext("FuelGradeID", "").strip()
                gname = FUEL_GRADES.get(gid, f"Grade {gid}")
                amt = float(fl.findtext("SalesAmount", 0) or 0)
                gal = float(fl.findtext("SalesQuantity", 0) or 0)
                tx_total += amt

                items_to_insert.append((
                    tx_id, 'fuel', f"FUEL-{gid}", gname, gid, gal, amt / gal if gal else amt, amt
                ))

            # ItemLine
            il = tl.find("ItemLine")
            if il is not None:
                upc = il.findtext("ItemCode/POSCode", "").strip()
                desc = il.findtext("Description", "Item").strip()
                code = str(il.findtext("MerchandiseCode", "")).strip()
                amt = float(il.findtext("SalesAmount", 0) or 0)
                qty = float(il.findtext("SalesQuantity", 1) or 1)
                dept_id = int(code) if code.isdigit() else 200
                tx_total += amt

                items_to_insert.append((
                    tx_id, 'cstore', upc, desc, str(dept_id), qty, amt / qty if qty else amt, amt
                ))

            # MerchandiseCodeLine
            mcl = tl.find("MerchandiseCodeLine")
            if mcl is not None:
                code = str(mcl.findtext("MerchandiseCode", "")).strip()
                desc = mcl.findtext("Description", DEPT_MAP.get(code, "Merchandise")).strip()
                amt = float(mcl.findtext("SalesAmount", 0) or 0)
                qty = float(mcl.findtext("SalesQuantity", 1) or 1)
                dept_id = int(code) if code.isdigit() else 200
                tx_total += amt

                items_to_insert.append((
                    tx_id, 'cstore', f"MCL-{code}", desc, str(dept_id), qty, amt / qty if qty else amt, amt
                ))

            # TenderInfo
            ti_elem = tl.find("TenderInfo")
            if ti_elem is not None:
                tcode = ti_elem.findtext("Tender/TenderCode", "").strip()
                tsub = ti_elem.findtext("Tender/TenderSubCode", "").strip()
                tamt = float(ti_elem.findtext("TenderAmount", 0) or 0)
                if 'outside' in tcode.lower(): is_outside = 1

                payments_to_insert.append((
                    tx_id, tcode, tsub, tamt
                ))

            # Tax
            tt = tl.find("TransactionTax")
            if tt is not None:
                tax = float(tt.findtext("TaxCollectedAmount", 0) or 0)
                tx_tax += tax

        tx_to_insert.append((
            tx_id, journal_seq, biz_date, event_start_date, event_start_time,
            register_id, tx_total, tx_total - tx_tax, tx_tax, tx_total, is_outside, fname
        ))
        import_log_to_insert.append((fname, 'POSJournal', 'success', None))
        parsed_tx_count += 1

    except Exception as e:
        import_log_to_insert.append((fname, 'POSJournal', 'error', str(e)))

print(f"Parsed {parsed_tx_count} transactions. Inserting into database...")

cur.executemany("""
    INSERT INTO transactions (id, transaction_id, business_date, event_date, event_time, register_id, gross_amount, net_amount, tax_amount, total_amount, is_outside_sale, source_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", tx_to_insert)

cur.executemany("""
    INSERT INTO transaction_items (transaction_id, item_type, upc, description, merchandise_code, quantity, unit_price, total_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
""", items_to_insert)

cur.executemany("""
    INSERT INTO payments (transaction_id, tender_code, tender_sub_code, amount)
    VALUES (?, ?, ?, ?)
""", payments_to_insert)

cur.executemany("""
    INSERT INTO import_log (filename, file_type, status, error_message)
    VALUES (?, ?, ?, ?)
""", import_log_to_insert)

conn.commit()
elapsed = time.time() - start_t
print(f"Re-import completed successfully in {elapsed:.2f} seconds!")
print(f"Total Transactions: {len(tx_to_insert)} | Total Items: {len(items_to_insert)} | Total Payments: {len(payments_to_insert)}")

conn.close()
