import os

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
xml_files = os.listdir(staging_dir)

print("=== Searching all XML files in BOOutBox for '2824' or '11751' or '3122' ===")
matches = []

for fn in xml_files:
    if not fn.upper().endswith('.XML'): continue
    fpath = os.path.join(staging_dir, fn)
    try:
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            if '2824' in content or '11751' in content or '3122' in content or '13264' in content:
                matches.append(fn)
    except Exception as e:
        pass

print(f"Found {len(matches)} matching files:")
for m in matches[:20]:
    print(" ", m)
