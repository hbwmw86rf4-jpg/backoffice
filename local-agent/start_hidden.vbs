Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\shell\Documents\office\backoffice\local-agent"
WshShell.Run "node agent.js", 0, False
