param(
    [Parameter(Mandatory)][string]$NexVRPath,
    [Parameter(Mandatory)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$NexVRPath = (Resolve-Path -LiteralPath $NexVRPath).Path
$configPath = Join-Path $NexVRPath 'BepInEx/coreclr-mods.json'
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'The selected client does not have the NexVR CoreCLR reload host.'
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $config.Identity -or -not $config.Identity.Count) {
    throw 'The client is missing its CoreCLR install identity.'
}

$buildId = 'nexy-party-bridge-' + [Guid]::NewGuid().ToString('N')
$release = Join-Path $OutputDirectory "releases/$buildId"
$project = Join-Path $PSScriptRoot 'Nexy.PartyBridge.csproj'
dotnet build $project -c Release "-p:NexVRPath=$NexVRPath"
if ($LASTEXITCODE -ne 0) { throw 'Could not build the Nexy party bridge.' }

$file = 'Nexy.PartyBridge.dll'
New-Item -ItemType Directory -Path $release -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "bin/Release/net10.0/$file") -Destination $release
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $release $file)).Hash
$manifest = @{
    BuildId = $buildId
    ContractVersion = 1
    BridgeVersion = 1
    EntryAssembly = $file
    EntryType = 'Nexy.PartyBridge.PartyBridge'
    Files = @{ $file = $hash }
    Identity = $config.Identity
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $release 'manifest.json')
@{ BuildId = $buildId } | ConvertTo-Json | Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $OutputDirectory 'current.json')
Write-Output "Prepared the Nexy party bridge in $OutputDirectory"
