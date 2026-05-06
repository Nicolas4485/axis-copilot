@echo off
echo.
echo  AXIS Demo Dataset Seeder
echo  ========================
echo  Creates the NorthStar Software demo deal with pre-cached
echo  CIM analysis and IC Memo — no inference calls needed.
echo.
cd /d "%~dp0"
cd apps\api
node --env-file=..\..\env --import tsx\esm src\scripts\seed-demo.ts
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [!] Seeder failed. Make sure:
  echo     1. Docker is running  (docker-compose up -d)
  echo     2. .env exists at the project root
  echo     3. pnpm dev was run at least once (Prisma client generated)
)
pause
