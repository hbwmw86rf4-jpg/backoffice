import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

cmd = r'ssh -i C:\Users\sandh\.ssh\id_ed25519 shell@100.87.8.118 "type \"C:\Users\shell\Documents\office\backoffice\src\database\reports.js\""'
out = subprocess.check_output(cmd, shell=True).decode('utf-8', errors='ignore')

lines = out.splitlines()
print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines[100:190], 101):
    print(f"Line {i:4}: {line}")
