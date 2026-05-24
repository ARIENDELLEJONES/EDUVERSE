@echo off
echo ============================================
echo   EDUVERSE - Hybrid Educational Platform
echo   Installer v1.0  ^|  2026
echo ============================================
echo.

:: ── 1. Check Node.js ────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo   Please install Node.js 18+ from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)
echo [OK] Found Node.js
node -v

:: ── 2. Check / install pnpm ─────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [INFO] Installing pnpm...
  npm install -g pnpm
)
echo [OK] Found pnpm
pnpm -v

:: ── 3. Install dependencies ──────────────────────────────────────
echo.
echo [INFO] Installing dependencies (this may take a minute)...
pnpm install --frozen-lockfile
if errorlevel 1 pnpm install

:: ── 4. Build API server ──────────────────────────────────────────
echo.
echo [INFO] Building API server...
pnpm --filter @workspace/api-server run build

echo.
echo ============================================
echo   Installation complete!
echo ============================================
echo.
echo To start EDUVERSE, open TWO Command Prompt windows:
echo.
echo   Window 1 - API Server:
echo     cd artifacts\api-server
echo     set PORT=5000 ^&^& node dist\index.mjs
echo.
echo   Window 2 - Frontend:
echo     cd artifacts\eduverse
echo     pnpm run dev
echo.
echo Then open your browser at: http://localhost:5173
echo.
echo   Default admin password: admin123
echo   Change it immediately in ADMIN ^> Settings.
echo ============================================
pause
