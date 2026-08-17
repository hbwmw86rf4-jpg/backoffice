import os
import xml.etree.ElementTree as ET

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
fpath = os.path.join(staging_dir, 'FGM3402608160103415138696.xml')

tree = ET.parse(fpath)
root = tree.getroot()

def clean_tag(elem):
    return elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag

print("=== All Elements and Text in FGM3402608160103415138696.xml ===")
for elem in root.iter():
    tag = clean_tag(elem)
    text = elem.text.strip() if elem.text and elem.text.strip() else ""
    if text:
        print(f"{tag:30} : {text}")
