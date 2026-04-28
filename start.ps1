# Kill all node processes (nodemon + any child node servers)
taskkill /F /IM node.exe /T 2>$null
Start-Sleep -Milliseconds 800

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; npm install; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\client'; npm install; npm run dev" -WindowStyle Normal
