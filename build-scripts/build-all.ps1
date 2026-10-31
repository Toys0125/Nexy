#!/usr/bin/env pwsh

using namespace System.Runtime.InteropServices

[CmdletBinding()]
param (
    [Switch]$NoCI,
    [Switch]$BuildArm64
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot/.."

if ([RuntimeInformation]::ProcessArchitecture -eq [Architecture]::Arm64) {
    $BuildArm64 = $true
}
$arch = if ($BuildArm64) { "arm64" } else { "x64" }
$os = if ($IsWindows) { "win" } elseif ($IsMacOS) { "osx" } else { "linux" }
$rid = "$os-$arch"

Write-Host "Building Electron .NET backend for $rid" -ForegroundColor Green
dotnet build 'Dotnet/VRCX-Electron.csproj' -p:Configuration=Release -p:WarningLevel=0 -p:Platform=$arch -maxcpucount --runtime $rid
if ($LASTEXITCODE -ne 0) { throw "The .NET build failed." }

Write-Host "Building Node.js and web frontend..." -ForegroundColor Green
if ($NoCI) {
    npm install --no-save
} else {
    npm ci --loglevel=error
}
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

npm run prod
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

if ($BuildArm64) {
    npm run build-electron-arm64
} else {
    npm run build-electron
}
if ($LASTEXITCODE -ne 0) { throw "Electron package build failed." }

if ($IsWindows) {
    $version = (Get-Content -Path "Version" -Raw).Trim()
    $setupName = "Nexy_${version}_Setup_${arch}.exe"
    $setupPath = Join-Path "build" $setupName
    if (Test-Path $setupPath) {
        $hash = Get-FileHash -Path $setupPath -Algorithm SHA256
        "$($hash.Hash)  $setupName" | Out-File -FilePath "SHA256SUMS.txt" -Encoding ASCII
    }
}

Write-Host "Done!" -ForegroundColor Green
