import os
import xml.etree.ElementTree as ET
from collections import Counter

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
pjr_files = [f for f in os.listdir(staging_dir) if f.upper().startswith('PJR') and f.upper().endswith('.XML')]

event_counts = Counter()
fuel_line_count = 0
item_line_count = 0
tender_info_count = 0

tot_fuel_gallons = 0.0
tot_fuel_sales = 0.0
tot_cstore_sales = 0.0

event_types_with_lines = Counter()
outside_sales_flag_count = Counter()
void_flag_counts = Counter()

# Sample 500 PJR files
for fname in pjr_files[:500]:
    fpath = os.path.join(staging_dir, fname)
    try:
        tree = ET.parse(fpath)
        root = tree.getroot()
        for elem in root.iter():
            tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag.endswith('Event'):
                event_counts[tag] += 1
                # Check child lines
                has_fuel = False
                has_item = False
                for child in elem.iter():
                    ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                    if ctag == 'FuelLine':
                        fuel_line_count += 1
                        has_fuel = True
                        qty_el = child.find('.//{*}SalesQuantity')
                        amt_el = child.find('.//{*}SalesAmount')
                        if qty_el is not None and qty_el.text:
                            tot_fuel_gallons += float(qty_el.text)
                        if amt_el is not None and amt_el.text:
                            tot_fuel_sales += float(amt_el.text)
                    elif ctag == 'ItemLine':
                        item_line_count += 1
                        has_item = True
                        amt_el = child.find('.//{*}SalesAmount')
                        if amt_el is not None and amt_el.text:
                            tot_cstore_sales += float(amt_el.text)
                    elif ctag == 'TenderInfo':
                        tender_info_count += 1
                    elif ctag == 'OutsideSalesFlag':
                        val = child.attrib.get('value') or child.text
                        outside_sales_flag_count[str(val)] += 1
                    elif ctag == 'VoidFlag':
                        val = child.attrib.get('value') or child.text
                        void_flag_counts[str(val)] += 1

                if has_fuel and has_item:
                    event_types_with_lines[f"{tag}_both"] += 1
                elif has_fuel:
                    event_types_with_lines[f"{tag}_fuel_only"] += 1
                elif has_item:
                    event_types_with_lines[f"{tag}_item_only"] += 1
                else:
                    event_types_with_lines[f"{tag}_no_lines"] += 1
    except Exception as e:
        pass

print("=== Summary across 500 PJR files ===")
print("Event counts:", dict(event_counts))
print("Event line breakdown:", dict(event_types_with_lines))
print(f"FuelLine total elements: {fuel_line_count}, Total Gallons: {tot_fuel_gallons:.2f}, Total Fuel $: ${tot_fuel_sales:.2f}")
print(f"ItemLine total elements: {item_line_count}, Total CStore $: ${tot_cstore_sales:.2f}")
print(f"TenderInfo total elements: {tender_info_count}")
print("OutsideSalesFlag breakdown:", dict(outside_sales_flag_count))
print("VoidFlag breakdown:", dict(void_flag_counts))
