using System;
using System.IO;
using VRCX;

internal static class GameLaunchTests
{
    internal static void Run()
    {
        var directory = Path.Join(Path.GetTempPath(), "Nexy Game Launch " + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            var launcher = Path.Join(directory, "NexVR.exe");
            var other = Path.Join(directory, "other.exe");
            var suffix = Path.Join(directory, "notNexVR.exe");
            var legacyLauncher = Path.Join(directory, "launch.exe");
            foreach (var file in new[] { launcher, other, suffix, legacyLauncher }) File.WriteAllText(file, "inert fixture");
            foreach (var path in new[] { directory, launcher })
            {
                var start = GameLaunch.WindowsStartInfo(path, "--join \"instance with spaces\"");
                if (start == null || start.FileName != launcher || start.WorkingDirectory != directory ||
                    start.UseShellExecute || start.Arguments != "--join \"instance with spaces\"")
                    throw new Exception("Game launcher path or arguments changed");
            }
            foreach (var path in new[] { other, suffix, legacyLauncher, Path.Join(directory, "missing"), "", null })
                if (GameLaunch.WindowsStartInfo(path, "") != null)
                    throw new Exception("Game launch accepted a missing launcher or arbitrary executable");
            Console.WriteLine("Game launch accepts explicitly selected NexVR.exe and rejects legacy/arbitrary executable targets");
        }
        finally
        {
            foreach (var file in new[] { "NexVR.exe", "other.exe", "notNexVR.exe", "launch.exe" }) File.Delete(Path.Join(directory, file));
            Directory.Delete(directory);
        }
    }
}
