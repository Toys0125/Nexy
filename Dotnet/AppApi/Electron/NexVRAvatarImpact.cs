using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace VRCX
{
    public partial class AppApiElectron
    {
        private const string NexVRSteamAppId = "2668010";
        private const string AvatarImpactCacheHeader = "nexvr-avatar-impact-verdicts 1";
        private const int MaxAvatarImpactCacheBytes = 16 * 1024 * 1024;

        private record AvatarImpactRating(string versionNumber, string platform, int rulesetVersion, string level);

        public async Task<string> GetNexVRAvatarImpact(string[] versionNumbers)
        {
            if (versionNumbers == null || versionNumbers.Length == 0)
                return "[]";

            try
            {
                var path = GetNexVRAvatarImpactCachePath();
                if (path == null)
                    return "[]";

                using var stream = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
                if (stream.Length > MaxAvatarImpactCacheBytes)
                    return "[]";

                using var reader = new StreamReader(stream);
                if (await reader.ReadLineAsync() != AvatarImpactCacheHeader)
                    return "[]";

                var versions = new HashSet<string>(versionNumbers, StringComparer.Ordinal);
                var ratings = new Dictionary<(string Version, string Platform), AvatarImpactRating>();
                while (await reader.ReadLineAsync() is { } line)
                {
                    if (!line.StartsWith("v\t", StringComparison.Ordinal))
                        continue;

                    var fields = line.Split('\t', 6);
                    if (fields.Length != 6 || !versions.Contains(fields[1]) ||
                        !int.TryParse(fields[3], NumberStyles.None, CultureInfo.InvariantCulture, out var rulesetVersion) ||
                        rulesetVersion <= 0)
                        continue;

                    var platform = fields[2] switch { "0" => "PC", "1" => "Quest", _ => null };
                    var level = fields[4] switch
                    {
                        "0" => "low",
                        "1" => "moderate",
                        "2" => "high",
                        "3" => "severe",
                        _ => null
                    };
                    if (platform == null || level == null)
                        continue;

                    var key = (fields[1], platform);
                    if (!ratings.TryGetValue(key, out var previous) || rulesetVersion >= previous.rulesetVersion)
                        ratings[key] = new AvatarImpactRating(fields[1], platform, rulesetVersion, level);
                }

                return JsonSerializer.Serialize(ratings.Values);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                return "[]";
            }
        }

        private static string? GetNexVRAvatarImpactCachePath()
        {
            string localLow;
            if (OperatingSystem.IsWindows())
            {
                localLow = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + "Low";
            }
            else if (OperatingSystem.IsLinux())
            {
                var steamLibrary = GetLibraryWithAppId(Path.Join(_steamPath, "config/libraryfolders.vdf"), NexVRSteamAppId)
                                   ?? _steamPath;
                localLow = Path.Join(steamLibrary, "steamapps", "compatdata", NexVRSteamAppId,
                    "pfx/drive_c/users/steamuser/AppData/LocalLow");
            }
            else
            {
                return null;
            }

            return Path.Join(localLow, "NexVR", "NexVR", "nexvr-avatar-impact", "verdicts.txt");
        }
    }
}
