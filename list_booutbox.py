import glob
import os

booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
all_files = glob.glob(os.path.join(booutbox, '*.*'))

print(f"Total files in BOOutBox: {len(all_files)}")

# Get unique prefixes (e.g. DEAD, ACK, PJR, ISM)
prefixes = {}
for f in all_files:
    base = os.path.basename(f)
    # Extract letters before the numbers
    prefix = ''.join([c for c in base if not c.isdigit()]).split('.')[0]
    prefixes[prefix] = prefixes.get(prefix, 0) + 1

for p, c in prefixes.items():
    print(f"{p}: {c}")
