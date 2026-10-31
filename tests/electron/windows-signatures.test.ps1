$ErrorActionPreference = 'Stop'
$verify = Join-Path $PSScriptRoot '../../build-scripts/verify-windows-signatures.ps1'
$signedFile = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
& $verify -Paths @($signedFile)
$unsignedFile = Join-Path $env:TEMP ('Nexy-Unsigned-Test-' + [guid]::NewGuid().ToString('N') + '.exe')
Set-Content -LiteralPath $unsignedFile -Value 'unsigned fixture'
try {
    $rejected = $false
    try { & $verify -Paths @($signedFile, $unsignedFile) }
    catch { $rejected = $_.Exception.Message -like 'Invalid signature:*' }
    if (-not $rejected) { throw 'Signature verification accepted an unsigned artifact' }
    $rejected = $false
    try { & $verify -Paths @($unsignedFile + '.missing') }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'Signature verification accepted a nonexistent artifact' }
} finally {
    Remove-Item -LiteralPath $unsignedFile
}
Write-Host 'Signature checks accepted a trusted signed file and rejected unsigned/missing artifacts'
