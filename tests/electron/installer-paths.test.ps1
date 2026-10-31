$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../build-scripts/installer-paths.ps1')
$fixture = Join-Path $env:TEMP ('Nexy Shortcut Paths ' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$target = Join-Path $fixture 'Nexy.exe'
$other = Join-Path $fixture 'Other.exe'
Set-Content -LiteralPath $target -Value 'fixture'
Set-Content -LiteralPath $other -Value 'other executable'
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $fixture 'Nexy.lnk'))
$link.TargetPath = $target
$link.Save()
Assert-NexyExecutableTarget -Actual $link.TargetPath -Expected $target -Source 'Fixture shortcut'
Assert-NexyExecutableTarget -Actual ([NexyInstallerPaths]::ShortFile($target)) -Expected $target -Source '8.3 alias'
Assert-NexyExecutableTarget -Actual (Join-Path $fixture '../' | Join-Path -ChildPath (Split-Path $fixture -Leaf) | Join-Path -ChildPath 'Nexy.exe') -Expected $target -Source 'Equivalent path'
$rejected = $false
try { Assert-NexyExecutableTarget -Actual $other -Expected $target -Source 'Wrong target' }
catch { $rejected = $_.Exception.Message -like '*targets the wrong installation*' }
if (-not $rejected) { throw 'A different executable incorrectly passed target validation' }
$rejected = $false
try { Assert-NexyExecutableTarget -Actual (Join-Path $fixture 'Missing.exe') -Expected $target -Source 'Missing target' }
catch { $rejected = $true }
if (-not $rejected) { throw 'A nonexistent executable incorrectly passed target validation' }
Write-Host 'Actual shortcuts, 8.3 paths, equivalent paths, wrong targets, and missing targets checked'
