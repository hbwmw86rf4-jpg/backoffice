import os

staging_dir = r'C:\Users\shell\Documents\office\backoffice\data\staging\BOOutBox'
fpath = os.path.join(staging_dir, 'FGM3402608160103435138697.xml')

print("=== FULL CONTENTS OF FGM3402608160103435138697.xml ===")
with open(fpath, 'r', encoding='utf-8') as f:
    print(f.read())
