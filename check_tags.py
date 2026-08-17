import glob
import os
import xml.etree.ElementTree as ET

xml_dir = r'C:\Users\shell\Desktop\New folder\xml'
xml_files = glob.glob(os.path.join(xml_dir, '*.xml'))
if xml_files:
    with open(xml_files[0], 'r', encoding='utf-8') as f:
        root = ET.fromstring(f.read())
        se = root.find(".//SaleEvent")
        if se is not None:
            print("Children of SaleEvent:")
            for child in se:
                print(f"  {child.tag}")
        else:
            print("No SaleEvent found.")
