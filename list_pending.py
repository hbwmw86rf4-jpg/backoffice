import os
import glob
import time

pending_dir = r'\\10.5.48.2\XMLGateway\BOInBox\Pending'
out_file = r'C:\Users\shell\Documents\office\backoffice\pending_list.txt'

with open(out_file, 'w', encoding='utf-8') as out:
    try:
        files = glob.glob(os.path.join(pending_dir, '*.*'))
        out.write(f"Found {len(files)} files in Pending:\n")
        for f in files:
            out.write(f"{os.path.basename(f)}\n")
    except Exception as e:
        out.write(f"Error: {e}\n")
