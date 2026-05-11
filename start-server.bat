@echo off
:: 管理者権限チェック
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 管理者権限で再起動します...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: サーバー起動
powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
