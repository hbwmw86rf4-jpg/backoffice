import os
import sys

# Replace the print statement that causes unicode error in rs_xml_parser.py
fpath = r'C:\Users\shell\Documents\office\backoffice\rs_xml_parser.py'
with open(fpath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'print(f"  \u26a0 Parse error in {os.path.basename(fpath)}: {e}")', r'print(f"  Parse error in {os.path.basename(fpath)}: {e}")')

with open(fpath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed rs_xml_parser.py unicode issue.")
