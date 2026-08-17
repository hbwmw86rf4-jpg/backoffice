@echo off
title Passport POS -> Cloud Sync Agent
cd /d "%~dp0"
echo Starting Passport Sync Agent...
node agent.js
pause
