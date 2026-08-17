import glob
import os

booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
cpjr_files = glob.glob(os.path.join(booutbox, 'CPJR*.xml'))
pjr_files = glob.glob(os.path.join(booutbox, 'PJR*.xml'))

print(f"CPJR files: {len(cpjr_files)}")
print(f"PJR files: {len(pjr_files)}")
