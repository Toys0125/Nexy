$ErrorActionPreference = 'Stop'
# Compile the actual NSIS hooks, but execute them only against a GUID HKCU
# fixture. No installed application or real protocol association is modified.
$tool = node -e "require('app-builder-lib/out/toolsets/windows').getMakeNsisPath().then(result => console.log(JSON.stringify(result)))"
if ($LASTEXITCODE -ne 0) { throw 'Unable to locate the Electron Builder NSIS compiler' }
$compiler = $tool | ConvertFrom-Json
$fixture = Join-Path $env:TEMP ('Nexy Protocol Test ' + [guid]::NewGuid().ToString('N'))
$registryPath = 'Software\Nexy\Tests\Protocol-' + [guid]::NewGuid().ToString('N')
$registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
New-Item -ItemType Directory -Path $fixture | Out-Null
$harness = Join-Path $fixture 'protocol.nsi'
$hooks = (Resolve-Path (Join-Path $PSScriptRoot '../../build-scripts/nsis-legacy-upgrade.nsh')).Path
$previousNsisDir = $env:NSISDIR
try {
    if ($compiler.env.NSISDIR) { $env:NSISDIR = $compiler.env.NSISDIR }
    @'
Unicode true
Name "Nexy isolated protocol test"
OutFile "${OUTPUT}"
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!define APP_EXECUTABLE_FILENAME "Nexy.exe"
!include "${HOOKS}"
Section
  SetRegView 64
  !insertmacro ${OPERATION} HKCU "${TEST_REGISTRY_KEY}"
SectionEnd
'@ | Set-Content -LiteralPath $harness
    foreach ($operation in @('registerNexyProtocol', 'unregisterNexyProtocol')) {
        & $compiler.path /V2 "/DOUTPUT=$fixture\$operation.exe" "/DHOOKS=$hooks" "/DTEST_REGISTRY_KEY=$registryPath" "/DOPERATION=$operation" $harness
        if ($LASTEXITCODE -ne 0) { throw "Unable to compile $operation fixture" }
    }
    function Invoke-Hook([string]$Operation, [string]$Directory) {
        $process = Start-Process -FilePath (Join-Path $fixture "$Operation.exe") -ArgumentList "/S /D=$Directory" -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "NSIS hook failed: $Operation" }
    }
    function Assert-Protocol([string]$Directory) {
        $key = $registry.OpenSubKey($registryPath)
        if (-not $key) { throw 'NSIS did not register the protocol' }
        try {
            if ($key.GetValue('URL Protocol', $null) -cne '') { throw 'Missing URL Protocol marker' }
            $command = $key.OpenSubKey('shell\open\command')
            try {
                if ($command.GetValue('') -cne ('"' + $Directory + '\Nexy.exe" "%1"')) { throw 'Protocol executable or URI quoting changed' }
            } finally { $command.Dispose() }
            $icon = $key.OpenSubKey('DefaultIcon')
            try {
                if ($icon.GetValue('') -cne ('"' + $Directory + '\Nexy.exe",0')) { throw 'Protocol icon path changed' }
            } finally { $icon.Dispose() }
        } finally { $key.Dispose() }
    }
    $first = Join-Path $fixture 'Fresh install with spaces'
    $second = Join-Path $fixture 'Upgraded install with spaces'
    Invoke-Hook registerNexyProtocol $first
    Assert-Protocol $first
    Invoke-Hook registerNexyProtocol $second
    Assert-Protocol $second
    Invoke-Hook unregisterNexyProtocol $first
    Assert-Protocol $second
    Invoke-Hook unregisterNexyProtocol $second
    $remaining = $registry.OpenSubKey($registryPath)
    if ($remaining) { $remaining.Dispose(); throw 'NSIS did not remove its owned protocol' }
    Write-Host 'Compiled NSIS protocol hooks: silent registration, quoted URI, upgrade, ownership and uninstall passed'
} finally {
    $env:NSISDIR = $previousNsisDir
    $registry.DeleteSubKeyTree($registryPath, $false)
    $registry.Dispose()
    # Remove only the exact files created in this fixture.
    foreach ($file in @('protocol.nsi', 'registerNexyProtocol.exe', 'unregisterNexyProtocol.exe')) {
        Remove-Item -LiteralPath (Join-Path $fixture $file) -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $fixture -ErrorAction SilentlyContinue
}
