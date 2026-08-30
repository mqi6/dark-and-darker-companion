@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo Dependencies are missing. Run npm install once, then launch this file again.
  pause
  exit /b 1
)
npm run operator -- --private-directory "fixtures-private/runtime/move-003"
if errorlevel 1 pause
