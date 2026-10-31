@echo off
cd ../../
dotnet build Dotnet\VRCX-Electron.csproj -p:Configuration=Release -p:WarningLevel=0 -p:Platform=x64 -p:PlatformTarget=x64 -t:"Restore;Clean;Build" -m --runtime win-x64
pause
