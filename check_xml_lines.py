import sqlite3
import xml.etree.ElementTree as ET
import glob
import os

xml_dir = r'C:\Users\shell\Documents\office\backoffice\data\PDI' # Wait, PDI is dead letters. Where are the XMLs?
# They are in C:\Users\shell\Desktop\New folder\xml?
xml_dir = r'C:\Users\shell\Desktop\New folder\xml'

if not os.path.exists(xml_dir):
    xml_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'

xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))
if not xml_files:
    print("No XMLs found")
else:
    for xf in xml_files[:10]:
        with open(xf, 'r', encoding='utf-8') as f:
            content = f.read()
            if '<TransactionLine' in content and '<MerchandiseCodeLine' in content and '<ItemLine' in content:
                print(f"Found both in: {xf}")
                
                # Parse to find a TransactionLine with both
                root = ET.fromstring(content)
                for tl in root.findall(".//TransactionLine"):
                    il = tl.find("ItemLine")
                    mcl = tl.find("MerchandiseCodeLine")
                    if il is not None and mcl is not None:
                        print("Found TransactionLine with BOTH!")
                        print("ItemLine SalesAmount:", il.findtext("SalesAmount"))
                        print("MerchLine SalesAmount:", mcl.findtext("SalesAmount"))
                        print("ItemLine UPC:", il.find("ItemCode/POSCode").text if il.find("ItemCode") is not None else None)
                        print("MerchLine Code:", mcl.findtext("MerchandiseCode"))
                        print("=====")
                break
