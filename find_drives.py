import os
import string
import glob

available_drives = ['%s:' % d for d in string.ascii_uppercase if os.path.exists('%s:' % d)]
print("Available drives:", available_drives)

for drive in available_drives:
    pjr = glob.glob(os.path.join(drive + '\\', 'BOOutBox', 'PJR*.xml'))
    pjr += glob.glob(os.path.join(drive + '\\', 'XMLGateway', 'BOOutBox', 'PJR*.xml'))
    if pjr:
        print(f"Found {len(pjr)} PJR files in {drive}")
