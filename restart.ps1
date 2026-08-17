Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Set-Location "C:\Users\shell\Documents\office\backoffice"
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "start"
