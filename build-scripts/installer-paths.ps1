# Resolve existing file targets through an open handle. This expands 8.3 aliases,
# resolves junctions, and avoids treating two spellings of one executable as an
# installer defect. A nonexistent or different executable still fails.
if (-not ('NexyInstallerPaths' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class NexyInstallerPaths {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetShortPathName(string path, StringBuilder shortPath, uint length);

    public static string CanonicalFile(string path) {
        using (var file = File.Open(Environment.ExpandEnvironmentVariables(path), FileMode.Open, FileAccess.Read,
                                    FileShare.ReadWrite | FileShare.Delete)) {
            var result = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandle(file.SafeFileHandle, result, (uint)result.Capacity, 0);
            if (length == 0 || length >= result.Capacity) throw new Win32Exception(Marshal.GetLastWin32Error());
            return result.ToString();
        }
    }

    public static string ShortFile(string path) {
        var result = new StringBuilder(32768);
        uint length = GetShortPathName(path, result, (uint)result.Capacity);
        if (length == 0 || length >= result.Capacity) throw new Win32Exception(Marshal.GetLastWin32Error());
        return result.ToString();
    }
}
'@
}

function Assert-NexyExecutableTarget([string]$Actual, [string]$Expected, [string]$Source) {
    Write-Host "$Source actual target: $Actual"
    Write-Host "$Source expected target: $Expected"
    try {
        $actualFile = [NexyInstallerPaths]::CanonicalFile($Actual)
        $expectedFile = [NexyInstallerPaths]::CanonicalFile($Expected)
    } catch {
        throw "$Source target could not be resolved. Actual='$Actual'; Expected='$Expected': $_"
    }
    Write-Host "$Source resolved actual: $actualFile"
    Write-Host "$Source resolved expected: $expectedFile"
    if (-not [string]::Equals($actualFile, $expectedFile, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Source targets the wrong installation. Actual='$Actual' ($actualFile); Expected='$Expected' ($expectedFile)"
    }
}
