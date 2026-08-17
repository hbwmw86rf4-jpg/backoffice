import os
import re

app_dir = r'C:\Users\shell\Documents\office\backoffice\src'

print("=== SEARCHING SRC FOR DEPARTMENT MAPPING AND REPORT LOGIC ===")

for root, dirs, files in os.walk(app_dir):
    for f in files:
        if f.endswith('.js') or f.endswith('.html'):
            fpath = os.path.join(root, f)
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as file_obj:
                content = file_obj.read()
                if 'Beer' in content or 'Cigs' in content or 'department' in content.lower() or 'getDepartmentAnalysis' in content:
                    print(f"\n--- File: {fpath} ---")
                    for i, line in enumerate(content.splitlines(), 1):
                        if any(k in line for k in ['department', 'Beer', 'Cigs', 'merchandise', 'dept', 'DEPT']):
                            if len(line.strip()) < 120:
                                print(f"Line {i:4}: {line.strip()}")
