import os
import glob

appdata = r'C:\Users\shell\AppData\Roaming'
for root, dirs, files in os.walk(appdata):
    if 'backoffice.db' in files:
        print(f"Found: {os.path.join(root, 'backoffice.db')}")
