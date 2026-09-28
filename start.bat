@echo off
cd /d "%~dp0"
if not exist config.json copy config.example.json config.json >nul
node server.js
pause
