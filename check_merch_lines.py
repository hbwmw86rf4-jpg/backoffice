import sqlite3
import xml.etree.ElementTree as ET
import glob
import os

xml_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))
if not xml_files:
    xml_dir = r'C:\Users\shell\Desktop\New folder\xml'
    xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))

merch_only_total = 0
merch_cigs_total = 0

for xf in xml_files:
    if "PJR" not in os.path.basename(xf) and "CPJR" not in os.path.basename(xf):
        continue
    try:
        with open(xf, 'r', encoding='utf-8') as f:
            content = f.read()
            if '2026-08-15' not in content:
                continue
            root = ET.fromstring(content)
            for tl in root.findall(".//TransactionLine"):
                il = tl.find("ItemLine")
                mcl = tl.find("MerchandiseCodeLine")
                
                # Check if it has MCL but NOT IL
                if mcl is not None and il is None:
                    status = tl.get("status", "normal")
                    amt = float(mcl.findtext("SalesAmount", 0) or 0)
                    void_flag = mcl.find("VoidFlag")
                    ret_flag = mcl.find("ReturnFlag")
                    
                    is_void = (status == "voided") or (void_flag is not None and void_flag.get("value", "") == "yes")
                    is_ret = (ret_flag is not None and ret_flag.get("value", "") == "yes")
                    
                    multiplier = 1
                    if is_void: multiplier = 0
                    elif is_ret: multiplier = -1
                    
                    final_amt = amt * multiplier
                    
                    code = mcl.findtext("MerchandiseCode", "")
                    merch_only_total += final_amt
                    if code == '5':
                        merch_cigs_total += final_amt
    except Exception as e:
        pass

print(f"Total from MerchandiseCodeLine (without ItemLine): ${merch_only_total:.2f}")
print(f"Total Cigs from MerchandiseCodeLine (without ItemLine): ${merch_cigs_total:.2f}")

