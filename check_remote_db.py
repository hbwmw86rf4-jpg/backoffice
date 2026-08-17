import sqlite3
import glob
import os

db_path = r'C:\Users\shell\Documents\office\backoffice\data\backoffice.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT count(*) FROM import_log")
print("Total import_log:", cursor.fetchone()[0])

cursor.execute("SELECT count(*) FROM transactions")
print("Total transactions:", cursor.fetchone()[0])

conn.close()

# Also check how many PJR files actually exist in BOOutBox
booutbox = r'\\10.5.48.2\XMLGateway\BOOutBox'
if os.path.exists(booutbox):
    pjrs = glob.glob(os.path.join(booutbox, 'PJR*.xml'))
    print(f"Total PJR files in BOOutBox: {len(pjrs)}")
    print(f"Total files in BOOutBox: {len(os.listdir(booutbox))}")
else:
    print(f"Path does not exist: {booutbox}")

