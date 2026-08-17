import os

app_dir = r'C:\Users\shell\Documents\office\backoffice'
print("=== CHECKING BACKOFFICE DIRECTORY STRUCTURE ===")
for root, dirs, files in os.walk(app_dir):
    for d in dirs:
        if 'cache' in d.lower() or 'data' in d.lower():
            print(os.path.join(root, d))
