using System;
using System.Diagnostics;
using System.IO;

namespace VRCX;

internal static class GameLaunch
{
    /// <summary>Resolve a game directory or launcher path without allowing arbitrary executables.</summary>
    internal static ProcessStartInfo WindowsStartInfo(string path, string arguments)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var executable = path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
            ? path : Path.Join(path, "launch.exe");
        if (!string.Equals(Path.GetFileName(executable), "launch.exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(executable))
            return null;

        return new ProcessStartInfo(executable, arguments)
        {
            WorkingDirectory = Path.GetDirectoryName(executable),
            UseShellExecute = false
        };
    }
}
