import os
import glob

dirs = [
    r'G:\ArchiveDir',
    r'G:\CapturedXML',
    r'G:\BOOutBox',
    r'G:\XMLGateway\ArchiveDir',
    r'G:\XMLGateway\CapturedXML',
    r'G:\XMLGateway\BOOutBox',
]

for d in dirs:
    if os.path.exists(d):
        pjr = glob.glob(os.path.join(d, 'PJR*.xml'))
        print(f"Found {len(pjr)} PJR files in {d}")
    else:
        print(f"Path does not exist: {d}")
