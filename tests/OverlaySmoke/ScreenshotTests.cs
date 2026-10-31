using System;
using System.IO;
using System.Text.Json;
using VRCX;

internal static class ScreenshotTests
{
    internal static void Run(string profile)
    {
        if (!OperatingSystem.IsWindows()) return;
        var directory = Path.Join(profile, "Screenshot fixtures with spaces");
        Directory.CreateDirectory(directory);
        const string metadata = "{\"application\":\"VRCX\",\"version\":1,\"author\":{\"id\":\"usr_fixture\",\"displayName\":\"Fixture\"},\"world\":{\"id\":\"wrld_fixture\",\"name\":\"Fixture world\",\"instanceId\":\"fixture\"},\"players\":[]}";
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=");
        var api = new AppApiElectron();
        try
        {
            foreach (var rename in new[] { false, true })
            {
                var original = Path.Join(directory, "VRChat_" + rename + ".png");
                File.WriteAllBytes(original, png);
                var result = api.AddScreenshotMetadata(original, metadata, "wrld_fixture", rename);
                var expected = rename ? Path.Join(directory, "VRChat_True_wrld_fixture.png") : original;
                if (string.IsNullOrEmpty(result) || !File.Exists(result) ||
                    !string.Equals(Path.GetFullPath(result), expected, StringComparison.OrdinalIgnoreCase))
                    throw new Exception("Native Windows screenshot path was changed or metadata handling was skipped");
                if (rename && File.Exists(original)) throw new Exception("Screenshot rename left the original behind");
                using var readback = JsonDocument.Parse(api.GetScreenshotMetadata(result));
                if (readback.RootElement.GetProperty("world").GetProperty("id").GetString() != "wrld_fixture")
                    throw new Exception("Screenshot PNG metadata did not round-trip");
            }
            Console.WriteLine("Native Windows screenshot paths: PNG metadata write/read and optional rename passed");
        }
        finally
        {
            foreach (var file in new[] { "VRChat_False.png", "VRChat_True.png", "VRChat_True_wrld_fixture.png" })
                File.Delete(Path.Join(directory, file));
            Directory.Delete(directory);
        }
    }
}
