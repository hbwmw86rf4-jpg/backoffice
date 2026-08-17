import os
import glob

booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
pjr_files = glob.glob(os.path.join(booutbox, 'PJR*.xml'))

counts = {}
for f in pjr_files:
    basename = os.path.basename(f)
    # Format: PJR3402608151940145138473.xml -> 26 08 15
    if len(basename) > 13:
        date_str = basename[8:14] # 260815 -> 26-08-15
        counts[date_str] = counts.get(date_str, 0) + 1

for k, v in sorted(counts.items()):
    print(f"Date {k}: {v} files")
