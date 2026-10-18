@echo off
start "Capture Studio server" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-capture-studio.ps1"
