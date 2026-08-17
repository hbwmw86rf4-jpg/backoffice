@echo off
schtasks /create /f /tn "PassportCloudSync" /tr "wscript.exe \"C:\Users\shell\Documents\office\backoffice\local-agent\start_hidden.vbs\"" /sc onlogon
echo Task created successfully.
