import os

print("=== LOCATING ALL backoffice.db FILES ON SHELL COMPUTER ===")
for root, dirs, files in os.walk(r'C:\Users\shell'):
    for f in files:
        if f.lower() == 'backoffice.db':
            full_path = os.path.join(root, f)
            size_mb = os.path.getsize(full_path) / (1024 * 1024)
            mtime = os.path.getmtime(full_path)
            import datetime
            dt = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
            print(f"Path: {full_path} | Size: {size_mb:.2f} MB | Modified: {dt}")
