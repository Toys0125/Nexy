using System;
using System.Diagnostics;
using System.IO;

namespace VRCX;

internal static class SteamLaunch
{
    internal static ProcessStartInfo WindowsStartInfo(string executable, string arguments)
    {
        if (File.Exists(executable))
            return new ProcessStartInfo(executable, $"-applaunch 438100 {arguments}") { UseShellExecute = false };

        // Steam's run URI accepts launch options between the second pair of
        // slashes and the trailing slash. Escape the entire argument string so
        // spaces, quotes, slashes and instance-join parameters survive the URI.
        var uri = $"steam://run/438100//{Uri.EscapeDataString(arguments ?? string.Empty)}/";
        return new ProcessStartInfo(uri) { UseShellExecute = true };
    }
}
