@echo off
cd /d C:\Users\sakrn\Documents\projects\axis-copilot
call node_modules\.bin\prisma generate --schema=prisma\schema.prisma > generate-output.txt 2>&1
echo Exit: %ERRORLEVEL% >> generate-output.txt
