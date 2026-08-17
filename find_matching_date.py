import os
import xml.etree.ElementTree as ET
import sqlite3

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'

def clean_tag(elem):
    return elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

fgm_files = [f for f in os.listdir(staging_dir) if f.upper().startswith('FGM') and f.upper().endswith('.XML')]

print("=== Searching FGM files for Regular Volume ~ 2824.018 or Total Volume ~ 3122.305 ===")
for fn in fgm_files:
    fpath = os.path.join(staging_dir, fn)
    try:
        tree = ET.parse(fpath)
        root = tree.getroot()
        bdate = ''
        for elem in root.iter():
            if clean_tag(elem) in ['JournalHeader', 'MovementHeader']:
                for child in elem.iter():
                    if clean_tag(child) == 'BusinessDate' and child.text:
                        bdate = child.text

        vol_total = 0.0
        reg_vol = 0.0
        for elem in root.iter():
            if clean_tag(elem) == 'FGMDetail':
                grade_id = ''
                for child in elem.iter():
                    if clean_tag(child) == 'FuelGradeID' and child.text: grade_id = child.text
                    elif clean_tag(child) == 'FGMPositionSummary':
                        for pos_child in child.iter():
                            if clean_tag(pos_child) == 'FuelGradeSalesVolume' and pos_child.text:
                                v = float(pos_child.text)
                                vol_total += v
                                if grade_id == '001': reg_vol += v

        if abs(vol_total - 3122.305) < 1.0 or abs(reg_vol - 2824.018) < 1.0:
            print(f"MATCH FOUND IN FGM FILE {fn}! BusinessDate: {bdate} | Total Vol: {vol_total:.3f} | Reg Vol: {reg_vol:.3f}")
    except Exception as e:
        pass

print("\n=== Searching Database Transactions by BusinessDate ===")
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("""
    SELECT t.business_date, SUM(ti.quantity), SUM(ti.total_amount)
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE ti.item_type = 'fuel'
    GROUP BY t.business_date
""")
for bd, gal, amt in cur.fetchall():
    if gal and (abs(gal - 3122.305) < 10.0 or abs(amt - 13264.92) < 100.0):
        print(f"MATCH FOUND IN DB! BusinessDate: {bd} | Gal: {gal:.3f} | Amt: ${amt:.2f}")

conn.close()
