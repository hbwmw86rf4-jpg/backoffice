import os
path = r'\\10.5.48.2\XMLGateway\BOOutBox\PJR3402608151953005138491.xml'
if os.path.exists(path):
    print(open(path, 'r', encoding='utf-8', errors='ignore').read()[:2000])
else:
    print("File not found")
