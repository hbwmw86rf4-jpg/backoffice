import sqlite3
import os
import xml.etree.ElementTree as ET
from collections import Counter

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
xml_files = [f for f in os.listdir(staging_dir) if f.upper().endswith('.XML')]

code_desc_counter = Counter()

for fname in xml_files[:5000]: # Sample 5000 XMLs
    fpath = os.path.join(staging_dir, fname)
    if os.path.getsize(fpath) == 0: continue
    try:
        tree = ET.parse(fpath)
        for tl in tree.findall(".//TransactionLine"):
            status = tl.get("status", "normal")
            if status != "normal": continue
            il = tl.find("ItemLine")
            if il is not None:
                code = str(il.findtext("MerchandiseCode", "")).strip()
                desc = il.findtext("Description", "").strip()
                code_desc_counter[(code, desc)] += 1
    except:
        pass

print("=== Top Merchandise Code -> Description pairs ===")
for (code, desc), count in code_desc_counter.most_common(100):
    print(f"Code {code:5} | {desc:25} | Count: {count}")
