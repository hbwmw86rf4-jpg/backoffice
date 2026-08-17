import subprocess

out = subprocess.check_output('python C:\\Users\\shell\\Documents\\office\\backoffice\\generate_daily_recon.py 2026-08-15', shell=True).decode('utf-8')
print(out)
