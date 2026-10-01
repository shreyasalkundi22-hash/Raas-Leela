@echo off
title Push Raas Leela to GitHub
echo ========================================================
echo Pushing Raas Leela Updates to GitHub (origin/main)
echo ========================================================
echo.
set "PATH=C:\Users\Shreyash\.gemini\antigravity\scratch\mingit\cmd;%PATH%"
cd /d "%~dp0"

git push origin main

echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo [SUCCESS] PUSH COMPLETED SUCCESSFULLY!
    echo GitHub Pages will automatically deploy in ~60 seconds.
    echo Website: https://shreyasalkundi22-hash.github.io/Raas-Leela/
    echo ========================================================
) else (
    echo ========================================================
    echo [NOTE] If you were prompted to sign in with GitHub,
    echo complete the sign-in in your browser and try again.
    echo ========================================================
)
echo.
pause
