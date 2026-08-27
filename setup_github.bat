@echo off
echo ========================================
echo   GitHub Login for VPNVorteXBot
echo ========================================
echo.

:: Find gh.exe
set GH_EXE=%USERPROFILE%\gh.exe
if not exist "%GH_EXE%" (
    echo [ERROR] gh.exe not found at %GH_EXE%
    echo Please install GitHub CLI first.
    pause
    exit /b 1
)

echo Step 1: Logging in to GitHub...
"%GH_EXE%" auth login

echo.
echo Step 2: Initializing Git repository...
cd /d "%~dp0"
git init
git add .
git commit -m "Initial commit - VPNVorteXBot"

echo.
echo Step 3: Creating GitHub repository...
"%GH_EXE%" repo create VPNVorteXBot --public --source=. --remote=origin --push

echo.
echo ========================================
echo   DONE! Repository created and pushed.
echo ========================================
pause
