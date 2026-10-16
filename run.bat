@echo off
setlocal
title DukaanVoice AI Launcher

echo ============================================================
echo   DukaanVoice AI - Multilingual Digital Shop Register
echo   (English + 22 Scheduled Indian Languages)
echo ============================================================
echo.

set "ROOT=%~dp0"
cd /d "%ROOT%"

REM 1. Verify Backend Virtual Environment
echo [1/4] Checking Python backend environment...
if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
    echo [ERROR] Backend virtual environment was not found at:
    echo         %ROOT%backend\.venv\Scripts\python.exe
    echo.
    echo Please create the virtual environment first:
    echo   cd backend
    echo   python -m venv .venv
    echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)
echo   [OK] Python virtual environment detected.

REM 2. Verify Configuration & Initialize Database
echo [2/4] Checking configuration and database...
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%backend\.env.example" (
        echo   Creating backend\.env from template...
        copy /y "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul
    )
)

if not exist "%ROOT%frontend\.env" (
    if exist "%ROOT%frontend\.env.example" (
        echo   Creating frontend\.env from template...
        copy /y "%ROOT%frontend\.env.example" "%ROOT%frontend\.env" >nul
    )
)

if not exist "%ROOT%backend\data\dukaanvoice.db" (
    echo   Database not found. Initializing safe Schema Version 1...
    pushd "%ROOT%backend"
    call .\.venv\Scripts\python.exe -m app.cli init-db
    popd
) else (
    echo   [OK] SQLite database found at backend\data\dukaanvoice.db
)

REM 3. Check Frontend Dependencies
echo [3/4] Checking Frontend dependencies...
if not exist "%ROOT%frontend\node_modules" (
    echo [WARNING] frontend\node_modules is missing.
    echo Installing frontend dependencies with npm.cmd install...
    pushd "%ROOT%frontend"
    call npm.cmd install
    popd
) else (
    echo   [OK] Frontend dependencies detected.
)

REM 4. Launch Services
echo [4/4] Launching DukaanVoice AI services...

REM Start Backend API
echo   Starting Backend API at http://127.0.0.1:8000 ...
start "DukaanVoice Backend" cmd /k "title DukaanVoice Backend && cd /d "%ROOT%backend" && "%ROOT%backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

ping 127.0.0.1 -n 3 >nul

REM Start Frontend UI
echo   Starting Frontend UI (Vite) ...
start "DukaanVoice Frontend" cmd /k "title DukaanVoice Frontend && cd /d "%ROOT%frontend" && npm.cmd run dev -- --host 127.0.0.1"

echo.
echo Waiting for services to initialize...
ping 127.0.0.1 -n 4 >nul

echo.
echo Opening DukaanVoice AI in your default browser...
start http://127.0.0.1:5173

echo.
echo ============================================================
echo   DukaanVoice AI is now running!
echo   Frontend UI : http://127.0.0.1:5173
echo   Backend API : http://127.0.0.1:8000 (Docs: /docs)
echo.
echo   To stop all services cleanly, run stop.bat
echo ============================================================
echo.
pause
endlocal
