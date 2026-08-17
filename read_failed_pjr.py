import os

filename = 'PJR3402606260548595024582.xml'
# We need to find this file. It was probably moved to ArchiveDir or CapturedXML.
search_dirs = [
    r'\\10.5.48.2\XMLGateway\ArchiveDir',
    r'\\10.5.48.2\XMLGateway\CapturedXML',
    r'\\10.5.48.2\XMLGateway\BOInBox\HoldingArea',
    r'\\10.5.48.2\XMLGateway\BOOutBox'
]

found_path = None
for d in search_dirs:
    p = os.path.join(d, filename)
    if os.path.exists(p):
        found_path = p
        break

if found_path:
    with open(found_path, 'r', encoding='utf-8') as f:
        print(f.read()[:2000])
else:
    print(f"Could not find {filename}")
