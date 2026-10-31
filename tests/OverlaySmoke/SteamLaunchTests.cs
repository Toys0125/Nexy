using System;
using System.IO;
using VRCX;

internal static class SteamLaunchTests
{
    internal static void Run()
    {
        var fixture = Path.Join(Path.GetTempPath(), "Nexy-Steam-" + Guid.NewGuid().ToString("N"));
        var arguments = "--no-vr --join \"world/instance?region=eu&name=two words\" --tag=\"日本語%/#\"";
        var fallback = SteamLaunch.WindowsStartInfo(fixture, arguments);
        const string prefix = "steam://run/438100//";
        if (!fallback.UseShellExecute || !fallback.FileName.StartsWith(prefix) || !fallback.FileName.EndsWith('/'))
            throw new Exception("Invalid Steam protocol launch");
        var decoded = Uri.UnescapeDataString(fallback.FileName[prefix.Length..^1]);
        if (decoded != arguments) throw new Exception("Steam fallback lost or changed launch arguments");
        File.WriteAllText(fixture, "executable fixture");
        try
        {
            var direct = SteamLaunch.WindowsStartInfo(fixture, arguments);
            if (direct.UseShellExecute || direct.FileName != fixture || direct.Arguments != "-applaunch 438100 " + arguments)
                throw new Exception("Direct Steam launch lost its arguments");
        }
        finally { File.Delete(fixture); }
        Console.WriteLine("Steam direct and protocol launch options, quotes, URI delimiters, and Unicode passed");
    }
}
