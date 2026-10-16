@echo off
title PaperGrade AI - Shutdown Utility
echo ====================================================================
echo                   Stopping PaperGrade AI Services
echo ====================================================================
echo.

echo [*] Stopping processes on port 8000 (Backend / uvicorn)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo  Killing PID %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo [*] Stopping processes on port 3000 (Frontend / nextjs)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo  Killing PID %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo [+] PaperGrade AI services stopped.
echo.
pause
