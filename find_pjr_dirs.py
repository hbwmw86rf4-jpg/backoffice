import glob
import os

dirs = [
    r'\\10.5.48.2\XMLGateway\ArchiveDir',
    r'\\10.5.48.2\XMLGateway\CapturedXML',
    r'\\10.5.48.2\XMLGateway\BOOutBox',
    r'C:\XMLGateway\BOOutBox',
    r'C:\Users\shell\Documents\office\backoffice\data'
]

for d in dirs:
    if os.path.exists(d):
        files = glob.glob(os.path.join(d, 'PJR*.xml'))
        print(f"Found {len(files)} PJR files in {d}")
    else:
        print(f"Path does not exist: {d}")
