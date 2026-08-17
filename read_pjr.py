import os

path = r'\\10.5.48.2\XMLGateway\BOOutBox\PJR3402608151938025138467.xml'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        print(f.read())
else:
    print(f"File not found: {path}")
