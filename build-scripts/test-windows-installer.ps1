param(
    [Parameter(Mandatory = $true)][string]$Installer
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installer-paths.ps1')
$setupPath = (Resolve-Path -LiteralPath $Installer).Path
$testRoot = Join-Path $env:TEMP ('Nexy-Installer-Test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null

function Assert-Installed([string]$InstallDirectory) {
    foreach ($relative in @(
        'Nexy.exe', 'resources/app.asar', 'Uninstall Nexy.exe',
        'resources/app.asar.unpacked/build/Electron/VRCX-Electron.dll',
        'resources/app.asar.unpacked/build/Electron/Vortice.Direct3D11.dll',
        'resources/dotnet-runtime/dotnet.exe'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory $relative))) {
            throw "Installed application is missing $relative"
        }
    }
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Nexy.lnk'
    if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'Missing Start menu shortcut' }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
    Assert-NexyExecutableTarget -Actual $shortcut.TargetPath -Expected (Join-Path $InstallDirectory 'Nexy.exe') -Source 'Start menu shortcut'
    $protocol = (Get-ItemProperty 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\nexy\shell\open\command').'(default)'
    Write-Host "Registered protocol command: $protocol"
    if ($protocol -notmatch '^"([^"]+)" "%1"$') { throw "Protocol has an invalid executable command: $protocol" }
    Assert-NexyExecutableTarget -Actual $Matches[1] -Expected (Join-Path $InstallDirectory 'Nexy.exe') -Source 'Protocol'
}

function Install-Nexy([string]$InstallDirectory, [bool]$ExplicitDirectory = $true) {
    $arguments = '/S'
    if ($ExplicitDirectory) { $arguments += " /D=$InstallDirectory" }
    $process = Start-Process -FilePath $setupPath -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installation failed: $($process.ExitCode)" }
    Assert-Installed $InstallDirectory
}

function Uninstall-Nexy([string]$InstallDirectory) {
    # Simulate the per-user handler Electron creates on first launch. Use the
    # installed command so its executable path matches NSIS's own spelling.
    $command = (Get-ItemProperty 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\nexy\shell\open\command').'(default)'
    $userKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\nexy')
    try { $userKey.SetValue('URL Protocol', '') } finally { $userKey.Dispose() }
    $userKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes\nexy\shell\open\command')
    try { $userKey.SetValue('', $command) } finally { $userKey.Dispose() }
    # _?= makes NSIS run in place and lets -Wait observe the actual uninstaller.
    $process = Start-Process -FilePath (Join-Path $InstallDirectory 'Uninstall Nexy.exe') `
        -ArgumentList "/S _?=$InstallDirectory" -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Uninstallation failed: $($process.ExitCode)" }
    if (Test-Path -LiteralPath (Join-Path $InstallDirectory 'Nexy.exe')) { throw 'Uninstall left the application executable behind' }
    if (Test-Path 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\nexy') { throw 'Uninstall left the Nexy protocol registration behind' }
    if (Test-Path 'Registry::HKEY_CURRENT_USER\Software\Classes\nexy') { throw 'Uninstall left the per-user Nexy protocol registration behind' }
}

# This script is intended for a disposable CI runner, never a developer's installed Nexy.
if (Test-Path 'Registry::HKEY_CURRENT_USER\Software\Classes\nexy') {
    throw 'Refusing to overwrite an existing per-user Nexy protocol handler'
}
$uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy'
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
    try {
        $existing = $base.OpenSubKey($uninstallKey)
        if ($existing) { $existing.Dispose(); throw 'Refusing to overwrite an existing legacy Nexy installation' }
    } finally { $base.Dispose() }
}
if (Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object {
    (Get-ItemProperty $_.PSPath).DisplayName -match '^Nexy(?:\s|$)'
}) { throw 'Refusing to overwrite an existing Electron Nexy installation' }

$fresh = Join-Path $testRoot 'Fresh install with spaces'
Install-Nexy $fresh
Uninstall-Nexy $fresh

foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
    $installDirectory = Join-Path $testRoot "Legacy $view custom directory"
    New-Item -ItemType Directory -Path $installDirectory | Out-Null
    foreach ($file in @('Nexy.exe', 'Uninstall.exe', 'CefSharp.dll', 'CefSharp.Core.dll', 'libcef.dll', 'chrome_elf.dll', 'CefSharp.BrowserSubprocess.exe')) {
        Set-Content -LiteralPath (Join-Path $installDirectory $file) -Value 'legacy fixture'
    }
    Set-Content -LiteralPath (Join-Path $installDirectory 'user-data-sentinel.txt') -Value 'preserve'
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
    try {
        $key = $base.CreateSubKey($uninstallKey)
        try {
            $key.SetValue('InstallLocation', $installDirectory)
            $key.SetValue('UninstallString', ('"' + (Join-Path $installDirectory 'Uninstall.exe') + '"'))
        } finally { $key.Dispose() }
        $key = $base.CreateSubKey('Software\Nexy')
        try { $key.SetValue('InstallDir', $installDirectory) } finally { $key.Dispose() }
        # No /D=: verify that the default adopts the legacy custom directory.
        Install-Nexy $installDirectory $false
        $key = $base.OpenSubKey($uninstallKey)
        if ($key) { $key.Dispose(); throw "Legacy $view uninstall registration remains" }
        foreach ($file in @('Uninstall.exe', 'CefSharp.dll', 'CefSharp.Core.dll', 'libcef.dll', 'chrome_elf.dll', 'CefSharp.BrowserSubprocess.exe')) {
            if (Test-Path -LiteralPath (Join-Path $installDirectory $file)) { throw "Legacy binary remains: $file" }
        }
        if ((Get-Content -LiteralPath (Join-Path $installDirectory 'user-data-sentinel.txt')) -ne 'preserve') {
            throw 'Upgrade removed existing user files'
        }
        # Verify a subsequent Electron-to-Electron upgrade uses the same location.
        Install-Nexy $installDirectory $false
        Uninstall-Nexy $installDirectory
    } finally { $base.Dispose() }
}
Write-Host 'Fresh install, both legacy registry views, custom directories, shortcuts, protocol, re-upgrade and uninstall passed'
