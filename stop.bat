@echo off
setlocal
title Stop DukaanVoice AI

echo ============================================================
echo   Stopping DukaanVoice AI Services...
echo ============================================================
echo.

echo [1/2] Closing DukaanVoice terminal windows...
taskkill /FI "WINDOWTITLE eq DukaanVoice Backend*" /F /T >nul 2>&1
if errorlevel 1 (
    echo   [INFO] DukaanVoice Backend window was not found or already closed.
) else (
    echo   [OK] Closed DukaanVoice Backend window and stopped its process tree.
)

taskkill /FI "WINDOWTITLE eq DukaanVoice Frontend*" /F /T >nul 2>&1
if errorlevel 1 (
    echo   [INFO] DukaanVoice Frontend window was not found or already closed.
) else (
    echo   [OK] Closed DukaanVoice Frontend window and stopped its process tree.
)

echo.
echo [2/2] Checking and freeing ports 8000 and 5173...

REM Kill any remaining process listening on port 8000 (FastAPI Backend)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo   Stopping Backend process on port 8000 [PID: %%p]...
    taskkill /F /PID %%p >nul 2>&1
)

REM Kill any remaining process listening on port 5173 (Vite Frontend)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo   Stopping Frontend process on port 5173 [PID: %%p]...
    taskkill /F /PID %%p >nul 2>&1
)

echo.
echo ============================================================
echo   All DukaanVoice AI services have been stopped!
echo ============================================================
echo.
pause
endlocal
