@echo off
cd /d C:\Users\sakrn\Documents\projects\axis-copilot
echo Running prisma generate...
call node_modules\.bin\prisma generate --schema=prisma\schema.prisma
echo DONE > generate-done.txt
echo Finished!
