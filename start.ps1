# Start server and client in separate windows
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; python server.py" -WindowStyle Normal
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; python client.py" -WindowStyle Normal
