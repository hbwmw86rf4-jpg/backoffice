import glob
import os
import xml.etree.ElementTree as ET

# Find a recent FGM file
booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
fgm_files = glob.glob(os.path.join(booutbox, 'FGM*.xml'))
fgm_files.sort(key=os.path.getmtime, reverse=True)

if not fgm_files:
    print("No FGM files found.")
    exit()

for f in fgm_files[:3]:
    print(f"\n--- FGM File: {os.path.basename(f)} ---")
    try:
        tree = ET.parse(f)
        root = tree.getroot()
        
        # Remove namespace for easier searching
        for elem in root.iter():
            elem.tag = elem.tag.split('}')[-1]
            
        fgm = root.find('.//FuelGradeMovement')
        if fgm is not None:
            header = fgm.find('MovementHeader')
            date = header.find('BusinessDate').text if header is not None and header.find('BusinessDate') is not None else 'Unknown'
            print(f"Business Date: {date}")
            
            for line in fgm.findall('FuelGradeMovementLine'):
                grade = line.find('FuelGradeID').text if line.find('FuelGradeID') is not None else '?'
                desc = line.find('Description').text if line.find('Description') is not None else '?'
                sales = line.find('SalesAmount').text if line.find('SalesAmount') is not None else '0'
                volume = line.find('SalesVolume').text if line.find('SalesVolume') is not None else '0'
                print(f"Grade {grade} ({desc}): ${sales} / {volume} gal")
    except Exception as e:
        print(f"Error parsing {f}: {e}")
