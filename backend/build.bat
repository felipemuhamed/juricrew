@echo off
setlocal ENABLEEXTENSIONS

REM === Resolve the folder this .bat is in (should also contain build.ps1) ===
set "SCRIPT_DIR=%~dp0"

REM === Pick a PowerShell executable (Windows PowerShell first, then PowerShell 7) ===
set "PS_EXE="
where powershell >nul 2>&1 && set "PS_EXE=powershell"
if not defined PS_EXE (
    where pwsh >nul 2>&1 && set "PS_EXE=pwsh"
)
if not defined PS_EXE (
    echo [ERROR] PowerShell not found. Please install PowerShell 5+ or 7+.
    exit /b 1
)

REM === Quick check: Docker Desktop running? ===
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop not detected or not running. Please start Docker Desktop and try again.
    exit /b 1
)

REM === Run the PowerShell build script with policy bypass for this process ===
echo Running build.ps1...
"%PS_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build.ps1"
set "EXITCODE=%ERRORLEVEL%"

if "%EXITCODE%"=="0" (
    echo build.ps1 completed successfully.
) else (
    echo [ERROR] build.ps1 failed with exit code %EXITCODE%.
)

REM === Pause if launched by double-click (no args) ===
if "%~1"=="" pause

exit /b %EXITCODE%