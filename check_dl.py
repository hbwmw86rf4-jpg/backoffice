import os
import glob

deadletter_dir = r'\\10.5.48.2\XMLGateway\DeadLetter'
all_files = glob.glob(os.path.join(deadletter_dir, '*.*'))

print(f"Found {len(all_files)} files in DeadLetter.")

for f in all_files[:10]:
    print(f"\n--- FILE: {os.path.basename(f)} ---")
    try:
        with open(f, 'r', encoding='utf-8', errors='ignore') as xmlf:
            print(xmlf.read(1000))
    except Exception as e:
        print(f"Error reading {f}: {e}")
