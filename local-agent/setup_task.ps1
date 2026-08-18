# Register Windows Scheduled Task for Passport Cloud Sync Watchdog
$taskName = "PassportCloudSyncWatchdog"
$actionPath = "C:\Program Files\nodejs\node.exe"
$actionArgs = "C:\Users\shell\Documents\office\backoffice\local-agent\watchdog.js"
$workDir = "C:\Users\shell\Documents\office\backoffice\local-agent"

Write-Host "Configuring Scheduled Task: $taskName..."

# Unregister old task if exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create Action
$action = New-ScheduledTaskAction -Execute $actionPath -Argument $actionArgs -WorkingDirectory $workDir

# Create Trigger (At Logon & At Startup)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerBoot = New-ScheduledTaskTrigger -AtStartup

# Create Settings (Restart on failure, run indefinitely)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)

# Register task under current user
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon, $triggerBoot) -Settings $settings -Description "Continuous Passport POS Cloud Sync Watchdog" -Force

# Start task immediately
Start-ScheduledTask -TaskName $taskName
Write-Host "Task $taskName registered and started successfully!"
