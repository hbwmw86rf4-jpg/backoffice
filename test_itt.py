import sqlite3
import os
import time
import subprocess
import glob

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
app_dir = r'C:\Users\shell\Documents\office\backoffice'
deadletter_dir = r'\\10.5.48.2\XMLGateway\DeadLetter'
out_file = r'C:\Users\shell\Documents\office\backoffice\test_itt_output.txt'

with open(out_file, 'w', encoding='utf-8') as out:
    out.write("=== ITT TEST OUTPUT ===\n\n")

    # 1. Clear deadletter
    try:
        old_files = glob.glob(os.path.join(deadletter_dir, '*.*'))
        for f in old_files:
            try:
                os.remove(f)
            except:
                pass
        out.write(f"Cleared {len(old_files)} old files from DeadLetter.\n")
    except Exception as e:
        out.write(f"Error clearing deadletter: {e}\n")

    # 2. Modify DB
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, price FROM pricebook LIMIT 1")
    row = cursor.fetchone()
    if row:
        pb_id, old_price = row
        new_price = round(old_price + 0.01, 2) if old_price else 1.99
        cursor.execute("UPDATE pricebook SET price = ? WHERE id = ?", (new_price, pb_id))
        cursor.execute("INSERT INTO price_history (pricebook_id, old_price, new_price) VALUES (?, ?, ?)", (pb_id, old_price, new_price))
        conn.commit()
        out.write(f"Changed item {pb_id} price from {old_price} to {new_price}\n")
    conn.close()

    # 3. Create and run a temporary node script
    node_script = os.path.join(app_dir, 'test_send.js')
    with open(node_script, 'w') as ns:
        ns.write("""
const { sendAllPendingChanges } = require('./src/exporters/pos_sender.js');
const res = sendAllPendingChanges();
console.log('Node Result:', res);
""")
    
    res = subprocess.run('npx electron test_send.js', cwd=app_dir, capture_output=True, text=True, shell=True, env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'})
    out.write(f"Node output:\n{res.stdout}\n{res.stderr}\n")

    # 4. Wait for Gilbarco to process
    out.write("Waiting 10 seconds for Gilbarco to process...\n")
    time.sleep(10)

    try:
        new_files = glob.glob(os.path.join(deadletter_dir, '*.*'))
        out.write(f"Found {len(new_files)} files in DeadLetter:\n")
        for f in new_files:
            out.write(f"\n--- FILE: {os.path.basename(f)} ---\n")
            try:
                with open(f, 'r', encoding='utf-8', errors='ignore') as xmlf:
                    out.write(xmlf.read(2000))
            except Exception as e:
                out.write(f"Error reading {f}: {e}\n")
    except Exception as e:
        out.write(f"Error reading deadletter: {e}\n")

    booutbox_dir = r'\\10.5.48.2\XMLGateway\BOOutBox'
    try:
        ack_files = glob.glob(os.path.join(booutbox_dir, '*.*'))
        out.write(f"\nFound {len(ack_files)} files in BOOutBox:\n")
        for f in ack_files:
            out.write(f"{os.path.basename(f)}\n")
    except Exception as e:
        out.write(f"Error reading BOOutBox: {e}\n")

print("Test ITT script generated.")
