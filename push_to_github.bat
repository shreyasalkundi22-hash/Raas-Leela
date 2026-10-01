@echo off
set /p TOKEN="Enter your GitHub Personal Access Token (PAT): "
if "%TOKEN%"=="" (
    echo Token cannot be empty.
    pause
    exit /b 1
)

"C:\Users\Shreyash\.gemini\antigravity\scratch\mingit\cmd\git.exe" push https://%TOKEN%@github.com/shreyasalkundi22-hash/Raas-Leela.git main
echo.
pause
