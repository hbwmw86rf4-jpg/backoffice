import os
import glob

def find_files():
    base = r'\\10.5.48.2\XMLGateway'
    for root, dirs, files in os.walk(base):
        for file in files:
            if file.upper().startswith('FGM'):
                print(os.path.join(root, file))

find_files()
