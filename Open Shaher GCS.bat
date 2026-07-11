@echo off
REM Shaher-136 GCS - double-click launcher (Windows)
REM Double-click this file to start the app. No typing needed.
REM On first run it installs Bun automatically (needs internet), then the app.
REM Keep the window that opens; closing it stops the GCS.

title Shaher-136 GCS
cd /d "%~dp0"

echo ==================================================
echo    Shaher-136 GCS
echo ==================================================
echo.

REM Install Bun automatically if it isn't already there (one-time, needs internet)
where bun >nul 2>&1
if not errorlevel 1 goto bun_ready
echo Bun the app engine isn't installed yet - installing it now.
echo This is a one-time step and needs an internet connection...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

:bun_ready
where bun >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Bun installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)

REM First run: install dependencies
if not exist "node_modules\" (
  echo [1/3] Installing dependencies ^(first run, ~1-2 min^)...
  call bun install
  if errorlevel 1 ( echo Install failed. & pause & exit /b 1 )
) else (
  echo [1/3] Dependencies OK
)

REM Ensure the database exists
echo [2/3] Setting up database...
call bun run setup >nul 2>&1

REM Free ports 3000 and 3004 if a previous copy is still running, so re-opening
REM the app never fails with "address already in use".
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3004 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Start the drone relay service (port 3004) in its own window
echo [3/3] Starting drone service ^(port 3004^)...
start "Shaher Drone Service" cmd /c "cd /d "%~dp0mini-services\drone-service" && bun run dev"

REM Open the browser once the web server has had a moment to boot
start "" cmd /c "timeout /t 4 >nul && start http://localhost:3000"

echo.
echo ==================================================
echo   App opening at http://localhost:3000
echo   KEEP THIS WINDOW OPEN while using the app.
echo   Close it (or press Ctrl+C) to stop the GCS.
echo ==================================================
echo.

REM Run the web app in the foreground (this holds the window open)
call bun run dev
