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
            var launcher = Path.Join(directory, "launch.exe");
            var other = Path.Join(directory, "other.exe");
            var suffix = Path.Join(directory, "notlaunch.exe");
            foreach (var file in new[] { launcher, other, suffix }) File.WriteAllText(file, "inert fixture");
            foreach (var path in new[] { directory, launcher })
            {
                var start = GameLaunch.WindowsStartInfo(path, "--join \"instance with spaces\"");
                if (start == null || start.FileName != launcher || start.WorkingDirectory != directory ||
                    start.UseShellExecute || start.Arguments != "--join \"instance with spaces\"")
                    throw new Exception("Game launcher path or arguments changed");
            }
            foreach (var path in new[] { other, suffix, Path.Join(directory, "missing"), "", null })
                if (GameLaunch.WindowsStartInfo(path, "") != null)
                    throw new Exception("Game launch accepted a missing launcher or arbitrary executable");
            Console.WriteLine("Game launch restricts targets to existing launch.exe and preserves directory/argument handling");
        }
        finally
        {
            foreach (var file in new[] { "launch.exe", "other.exe", "notlaunch.exe" }) File.Delete(Path.Join(directory, file));
            Directory.Delete(directory);
        }
    }
}
