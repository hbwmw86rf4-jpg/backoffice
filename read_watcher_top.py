with open(r'C:\Users\shell\Documents\office\backoffice\src\watchers\pos_watcher.js', 'r') as f:
    lines = f.readlines()
    for i, line in enumerate(lines[:200]):
        print(f"{i+1}: {line}", end='')
