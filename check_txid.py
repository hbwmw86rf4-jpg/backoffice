import glob
import os
import re

xml_dir = r'C:\Users\shell\Desktop\New folder\xml'
xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))
if xml_files:
    for xf in xml_files[:5]:
        with open(xf, 'r', encoding='utf-8') as f:
            content = f.read()
            m = re.search(r'<TransactionID>(.*?)</TransactionID>', content)
            print(f"{os.path.basename(xf)} TransactionID:", m.group(1) if m else "NOT FOUND")
