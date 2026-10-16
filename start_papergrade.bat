@echo off
setlocal enabledelayedexpansion

title PaperGrade AI - Launcher
echo ====================================================================
echo                   PAPERGRADE AI - PHASE 1 POC
echo         Local-First Automated Answer Sheet Grading System
echo ====================================================================
echo.

:: Get workspace directory
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in PATH! Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

:: Check Node.js installation
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js / npm is not found in PATH! Please install Node.js 18+ and add it to PATH.
    pause
    exit /b 1
)

:: Check .env configuration
if not exist "%ROOT_DIR%.env" (
    echo [!] .env file not found. Copying from .env.example...
    copy "%ROOT_DIR%.env.example" "%ROOT_DIR%.env" >nul
    echo [!] Created .env file. Please ensure your GEMINI_API_KEY is configured.
)

echo [*] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "PaperGrade AI - Backend (:8000)" cmd /k "cd /d "%ROOT_DIR%" && python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000"

echo [*] Starting Next.js Frontend on http://localhost:3000 ...
start "PaperGrade AI - Frontend (:3000)" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

echo.
echo [*] Waiting 4 seconds for services to initialize...
timeout /t 4 /nobreak >nul

echo [*] Launching teacher dashboard in your default browser...
start http://localhost:3000

echo.
echo ====================================================================
echo  [+] PaperGrade AI services launched successfully!
echo.
echo      - Teacher Dashboard: http://localhost:3000
echo      - Backend REST API:  http://127.0.0.1:8000
echo      - API Swagger Docs:  http://127.0.0.1:8000/docs
echo.
echo  To shut down services, close the Backend and Frontend console
echo  windows, or run stop_papergrade.bat.
echo ====================================================================
echo.
pause
