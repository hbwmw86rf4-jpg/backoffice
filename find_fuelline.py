import os
import glob

booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
pjr_files = glob.glob(os.path.join(booutbox, 'PJR*.xml'))

for f in pjr_files:
    try:
        content = open(f, 'r', encoding='utf-8', errors='ignore').read()
        if 'FuelLine' in content:
            print(f"Found FuelLine in {f}")
            print(content[:2000])
            break
    except Exception as e:
        pass
