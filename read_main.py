import os

main_js = r'C:\Users\shell\Documents\office\backoffice\src\main.js'
if os.path.exists(main_js):
    with open(main_js, 'r') as f:
        print(f.read()[:1000])
else:
    print("No main.js")

config_js = r'C:\Users\shell\Documents\office\backoffice\src\config.js'
if os.path.exists(config_js):
    with open(config_js, 'r') as f:
        print("\n\n" + f.read()[:1000])
