import os
import glob

# Search common locations for batch files related to robocopy/BOOutBox
search_paths = [
    r'C:\Users\shell\Documents',
    r'C:\Users\shell\Desktop',
    r'C:\Users\shell',
    r'C:\Scripts',
    r'C:\Batch',
    r'C:\Users\shell\Documents\office',
]

for sp in search_paths:
    if os.path.exists(sp):
        for root, dirs, files in os.walk(sp):
            for f in files:
                if f.lower().endswith(('.bat', '.cmd', '.ps1')):
                    full = os.path.join(root, f)
                    try:
                        content = open(full, 'r', encoding='utf-8', errors='ignore').read()
                        if 'robocopy' in content.lower() or 'booutbox' in content.lower():
                            print(f"=== FOUND: {full} ===")
                            print(content)
                            print("=" * 60)
                    except:
                        pass
