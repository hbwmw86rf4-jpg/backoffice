import os

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
xml_files = os.listdir(staging_dir)

target_files = [f for f in xml_files if not f.upper().startswith('PJR') and f.upper().endswith('.XML')]
print(f"Searching {len(target_files)} non-PJR movement/summary files...")

for fn in target_files:
    fpath = os.path.join(staging_dir, fn)
    try:
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            if '2824' in content or '11751' in content or '3122' in content or '13264' in content:
                print(f"MATCH FOUND IN {fn}!")
                lines = content.splitlines()
                for line in lines:
                    if any(k in line for k in ['2824', '11751', '3122', '13264']):
                        print("  ->", line.strip())
    except Exception as e:
        pass
