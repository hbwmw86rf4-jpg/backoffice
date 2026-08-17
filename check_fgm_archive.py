import glob
import os
import xml.etree.ElementTree as ET

archive_dir = r'\\10.5.48.2\XMLGateway\ArchiveDir'
captured_dir = r'\\10.5.48.2\XMLGateway\CapturedXML'
boinbox = r'\\10.5.48.2\XMLGateway\BOInBox'

fgm_files = glob.glob(os.path.join(archive_dir, 'FGM*.xml'))
fgm_files += glob.glob(os.path.join(captured_dir, 'FGM*.xml'))
fgm_files += glob.glob(os.path.join(boinbox, 'FGM*.xml'))

fgm_files.sort(key=os.path.getmtime, reverse=True)

print(f"Found {len(fgm_files)} FGM files.")

for f in fgm_files[:3]:
    print(f"\n--- FGM File: {os.path.basename(f)} ---")
    try:
        tree = ET.parse(f)
        root = tree.getroot()
        
        for elem in root.iter():
            elem.tag = elem.tag.split('}')[-1]
            
        fgm = root.find('.//FuelGradeMovement')
        if fgm is not None:
            header = fgm.find('MovementHeader')
            date = header.find('BusinessDate').text if header is not None and header.find('BusinessDate') is not None else 'Unknown'
            print(f"Business Date: {date}")
            
            total_sales = 0
            for line in fgm.findall('FuelGradeMovementLine'):
                grade = line.find('FuelGradeID').text if line.find('FuelGradeID') is not None else '?'
                desc = line.find('Description').text if line.find('Description') is not None else '?'
                sales = float(line.find('SalesAmount').text) if line.find('SalesAmount') is not None else 0
                volume = float(line.find('SalesVolume').text) if line.find('SalesVolume') is not None else 0
                print(f"Grade {grade} ({desc}): ${sales:.2f} / {volume:.2f} gal")
                total_sales += sales
            print(f"TOTAL FUEL SALES IN FGM: ${total_sales:.2f}")
    except Exception as e:
        print(f"Error parsing {f}: {e}")
