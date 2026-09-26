@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta o Node.js. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira vez: instalando dependencias...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm start
pause
