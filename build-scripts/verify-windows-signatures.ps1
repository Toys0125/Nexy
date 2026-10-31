param(
    [Parameter(Mandatory = $true)][string[]]$Paths
)

$ErrorActionPreference = 'Stop'
foreach ($file in $Paths) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if ($signature.Status -ne 'Valid') {
        throw "Invalid signature: $file ($($signature.Status))"
    }
    Write-Host "Valid Authenticode signature: $file"
}
