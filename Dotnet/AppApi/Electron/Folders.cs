using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace VRCX
{
    public partial class AppApiElectron
    {
        public static string _homeDirectory;
        public static string _steamPath;
        public static string _steamUserdataPath;
        public static string _vrcPrefixPath;
        public static string _vrcAppDataPath;
        public static string _vrcCrashesPath;
        public static string _vrcInstallPath;

        static AppApiElectron()
        {
            const string vrchatAppid = "438100";
            _homeDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (OperatingSystem.IsWindows())
            {
                _steamPath = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam");
                try
                {
                    using var steamKey = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
                    var steamPath = steamKey?.GetValue("SteamPath")?.ToString();
                    if (!string.IsNullOrWhiteSpace(steamPath))
                        _steamPath = steamPath;
                }
                catch (Exception e)
                {
                    logger.Warn(e, "Failed to locate Steam from Windows registry");
                }

                _steamUserdataPath = Path.Join(_steamPath, "userdata");
                _vrcInstallPath = Path.Join(_steamPath, "steamapps", "common", "VRChat");
                _vrcAppDataPath = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + "Low", "VRChat", "VRChat");
                _vrcCrashesPath = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temp", "VRChat", "VRChat", "Crashes");
                return;
            }

            _steamUserdataPath = Path.Join(_homeDirectory, ".steam/steam/userdata");
            _steamPath = Path.Join(_homeDirectory, ".local/share/Steam");

            var flatpakSteamPath = Path.Join(_homeDirectory, ".var/app/com.valvesoftware.Steam/.local/share/Steam");
            if (!IsValidSteamPath(_steamPath) && IsValidSteamPath(flatpakSteamPath))
            {
                logger.Info("Flatpak Steam detected.");
                _steamPath = flatpakSteamPath;
            }

            var legacySteamPath = Path.Join(_homeDirectory, ".steam/steam");
            if (!IsValidSteamPath(_steamPath) && IsValidSteamPath(legacySteamPath))
            {
                logger.Info("Legacy Steam path detected.");
                _steamPath = legacySteamPath;
            }

            if (!IsValidSteamPath(_steamPath))
            {
                logger.Error("No valid Steam library found.");
            }

            var libraryFoldersVdfPath = Path.Join(_steamPath, "config/libraryfolders.vdf");
            var vrcLibraryPath = GetLibraryWithAppId(libraryFoldersVdfPath, vrchatAppid);
            if (string.IsNullOrEmpty(vrcLibraryPath))
            {
                logger.Warn("Falling back to default VRChat path as libraryfolders.vdf was not found OR libraryfolders.vdf does not contain VRChat's appid (438100)");
                vrcLibraryPath = _steamPath;
            }
            logger.Info($"Using steam library path {vrcLibraryPath}");
            _vrcPrefixPath = Path.Join(vrcLibraryPath, $"steamapps/compatdata/{vrchatAppid}/pfx");
            _vrcInstallPath = Path.Join(vrcLibraryPath, "steamapps/common/VRChat");
            _vrcAppDataPath = Path.Join(_vrcPrefixPath, "drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat");
            _vrcCrashesPath = Path.Join(_vrcPrefixPath, "drive_c/users/steamuser/AppData/Local/Temp/VRChat/VRChat/Crashes");
        }

        private static bool IsValidSteamPath(string path)
        {
            return File.Exists(Path.Join(path, "config/libraryfolders.vdf"));
        }

        private static string? GetLibraryWithAppId(string libraryFoldersVdfPath, string appId)
        {
            if (!File.Exists(libraryFoldersVdfPath))
                return null;

            string? libraryPath = null;
            foreach (var line in File.ReadLines(libraryFoldersVdfPath))
            {
                // Assumes line will be \t\t"path"\t\t"pathToLibrary"
                if (line.Contains("\"path\""))
                {
                    var parts = line.Split("\t");
                    if (parts.Length < 4)
                        continue;

                    libraryPath = parts[4].Replace("\"", "");
                }

                if (line.Contains($"\"{appId}\"") && Directory.Exists(libraryPath))
                    return libraryPath;
            }

            return null;
        }

        public override string GetVRChatAppDataLocation()
        {
            return _vrcAppDataPath;
        }

        public override string GetVRChatCacheLocation()
        {
            var defaultPath = Path.Join(GetVRChatAppDataLocation(), "Cache-WindowsPlayer");
            try
            {
                var json = ReadConfigFile();
                if (string.IsNullOrEmpty(json))
                    return defaultPath;

                var obj = JsonConvert.DeserializeObject<JObject>(json, JsonSerializerSettings);
                if (obj["cache_directory"] == null)
                    return defaultPath;

                var cacheDir = (string)obj["cache_directory"];
                if (string.IsNullOrEmpty(cacheDir))
                    return defaultPath;

                var cachePath = Path.Join(cacheDir, "Cache-WindowsPlayer");
                if (!Directory.Exists(cacheDir))
                    return defaultPath;

                return cachePath;
            }
            catch (Exception e)
            {
                logger.Error($"Error reading VRChat config file for cache location: {e}");
            }
            return defaultPath;
        }

        public override string GetVRChatPhotosLocation()
        {
            var defaultPath = OperatingSystem.IsWindows()
                ? Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "VRChat")
                : Path.Join(_vrcPrefixPath, "drive_c/users/steamuser/Pictures/VRChat");
            try
            {
                var json = ReadConfigFile();
                if (string.IsNullOrEmpty(json))
                    return defaultPath;

                var obj = JsonConvert.DeserializeObject<JObject>(json, JsonSerializerSettings);
                if (obj["picture_output_folder"] == null)
                    return defaultPath;

                var photosDir = (string)obj["picture_output_folder"];
                if (string.IsNullOrEmpty(photosDir) || !Directory.Exists(photosDir))
                    return defaultPath;

                return photosDir;
            }
            catch (Exception e)
            {
                logger.Error($"Error reading VRChat config file for photos location: {e}");
            }
            return defaultPath;
        }

        public override string GetUGCPhotoLocation(string path = "")
        {
            if (string.IsNullOrEmpty(path))
            {
                return GetVRChatPhotosLocation();
            }

            try
            {
                if (!Directory.Exists(path))
                {
                    Directory.CreateDirectory(path);
                }
                return path;
            }
            catch (Exception e)
            {
                logger.Error(e);
                return GetVRChatPhotosLocation();
            }
        }

        private string GetSteamUserdataPathFromRegistry()
        {
            // TODO: Fix Steam userdata path, for now just get the first folder
            if (Directory.Exists(_steamUserdataPath))
            {
                var steamUserDirs = Directory.GetDirectories(_steamUserdataPath);
                if (steamUserDirs.Length > 0)
                {
                    return steamUserDirs[0];
                }
            }
            return string.Empty;
        }

        public override string GetVRChatScreenshotsLocation()
        {
            if (OperatingSystem.IsWindows())
            {
                if (!Directory.Exists(_steamUserdataPath))
                    return string.Empty;
                var newest = DateTime.MinValue;
                var selected = string.Empty;
                foreach (var dir in Directory.GetDirectories(_steamUserdataPath))
                {
                    var screenshots = Path.Join(dir, "760", "remote", "438100", "screenshots");
                    if (!Directory.Exists(screenshots))
                        continue;
                    var lastWrite = Directory.GetLastWriteTimeUtc(screenshots);
                    if (lastWrite > newest)
                    {
                        newest = lastWrite;
                        selected = screenshots;
                    }
                }
                return selected;
            }

            return Path.Join(GetSteamUserdataPathFromRegistry(), "760", "remote", "438100", "screenshots");
        }

        public override bool OpenVrcxAppDataFolder()
        {
            var path = Program.AppDataDirectory;
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenVrcAppDataFolder()
        {
            var path = _vrcAppDataPath;
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenVrcPhotosFolder()
        {
            var path = GetVRChatPhotosLocation();
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenUGCPhotosFolder(string ugcPath = "")
        {
            var path = GetUGCPhotoLocation(ugcPath);
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenVrcScreenshotsFolder()
        {
            var path = GetVRChatScreenshotsLocation();
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenCrashVrcCrashDumps()
        {
            var path = _vrcCrashesPath;
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        // A folder only counts as an install while it still holds the client,
        // so an uninstall that leaves the folder behind is not offered.
        private static bool IsNexvrInstall(string path)
        {
            return File.Exists(Path.Join(path, "NexVR.exe"));
        }

        /// <summary>
        /// The NexVR launcher keeps its data in %APPDATA%\nexvr-launcher on Windows and
        /// ~/.local/share/nexvr-launcher on Linux. The client goes in its "client" folder
        /// unless another one was picked, which settings.json stores as install_root.
        /// </summary>
        private static string GetNexvrLauncherLocation()
        {
            var dataFolder = OperatingSystem.IsWindows()
                ? Environment.SpecialFolder.ApplicationData
                : Environment.SpecialFolder.LocalApplicationData;
            var launcherPath = Path.Join(Environment.GetFolderPath(dataFolder), "nexvr-launcher");

            var candidates = new List<string>();
            try
            {
                var settingsPath = Path.Join(launcherPath, "settings.json");
                if (File.Exists(settingsPath))
                {
                    var installRoot = (string)JObject.Parse(File.ReadAllText(settingsPath))["install_root"];
                    if (!string.IsNullOrWhiteSpace(installRoot))
                        candidates.Add(Path.GetFullPath(installRoot));
                }
            }
            catch (Exception e)
            {
                logger.Warn(e, "Failed to read the NexVR launcher settings");
            }
            candidates.Add(Path.Join(launcherPath, "client"));

            foreach (var path in candidates)
            {
                if (IsNexvrInstall(path))
                    return path;
            }

            return string.Empty;
        }

        /// <summary>The Steam build sits in steamapps\common\NexVR of any Steam library.</summary>
        private static string GetNexvrSteamLocation()
        {
            foreach (var libraryPath in GetSteamLibraryPaths())
            {
                var path = Path.Join(libraryPath, "steamapps", "common", "NexVR");
                if (IsNexvrInstall(path))
                    return path;
            }

            return string.Empty;
        }

        private static List<string> GetSteamLibraryPaths()
        {
            var libraryPaths = new List<string>();
            if (!string.IsNullOrEmpty(_steamPath))
                libraryPaths.Add(_steamPath);

            // Some Steam installs only keep the copy in steamapps
            var libraryFoldersVdfPath = Path.Join(_steamPath, "config", "libraryfolders.vdf");
            if (!File.Exists(libraryFoldersVdfPath))
                libraryFoldersVdfPath = Path.Join(_steamPath, "steamapps", "libraryfolders.vdf");

            try
            {
                if (File.Exists(libraryFoldersVdfPath))
                {
                    foreach (var line in File.ReadLines(libraryFoldersVdfPath))
                    {
                        // Current entries are "path" "<dir>"; older manifests list "<n>" "<dir>".
                        // Numeric values are "<appid>" "<size>" pairs, not libraries.
                        var match = Regex.Match(line, @"^\s*""(?:path|\d+)""\s+""([^""]+)""");
                        if (match.Success && !Regex.IsMatch(match.Groups[1].Value, @"^\d+$"))
                            libraryPaths.Add(match.Groups[1].Value.Replace(@"\\", @"\"));
                    }
                }
            }
            catch (Exception e)
            {
                logger.Warn(e, "Failed to read Steam libraryfolders.vdf");
            }

            // Steam's registry SteamPath uses forward slashes, which explorer.exe
            // does not accept, so normalize every library path
            var normalizedPaths = new List<string>();
            foreach (var path in libraryPaths)
            {
                try
                {
                    normalizedPaths.Add(Path.GetFullPath(path));
                }
                catch (Exception e)
                {
                    logger.Warn(e, "Skipping invalid Steam library path {path}", path);
                }
            }

            return normalizedPaths;
        }

        public override bool HasNexvrLauncherInstall()
        {
            return !string.IsNullOrEmpty(GetNexvrLauncherLocation());
        }

        public override bool HasNexvrSteamInstall()
        {
            return !string.IsNullOrEmpty(GetNexvrSteamLocation());
        }

        public override bool OpenNexvrLauncherFolder()
        {
            var path = GetNexvrLauncherLocation();
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenNexvrSteamFolder()
        {
            var path = GetNexvrSteamLocation();
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenNexvrPhotosFolder()
        {
            var path = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "NexVR");
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override bool OpenNexvrVideosFolder()
        {
            var path = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "NexVR");
            if (!Directory.Exists(path))
                return false;

            OpenFolderAndSelectItem(path, true);
            return true;
        }

        public override void OpenShortcutFolder()
        {
            var path = AutoAppLaunchManager.Instance.AppShortcutDirectory;
            if (!Directory.Exists(path))
                return;

            OpenFolderAndSelectItem(path, true);
        }

        public override void OpenFolderAndSelectItem(string path, bool isFolder = false)
        {
            if (!File.Exists(path) && !Directory.Exists(path))
                return;

            if (OperatingSystem.IsWindows())
            {
                var arguments = isFolder ? $"\"{path}\"" : $"/select,\"{path}\"";
                Process.Start(new ProcessStartInfo("explorer.exe", arguments) { UseShellExecute = true })?.Dispose();
                return;
            }

            if (OperatingSystem.IsMacOS())
            {
                var startInfo = new ProcessStartInfo("open") { UseShellExecute = false };
                if (!isFolder) startInfo.ArgumentList.Add("-R");
                startInfo.ArgumentList.Add(path);
                Process.Start(startInfo)?.Dispose();
                return;
            }

            string directoryPath = isFolder ? path : Path.GetDirectoryName(path);
            var commandAttempt = new Dictionary<string, string>
            {
                { "nautilus", $"\"{path}\"" },
                { "nemo", $"\"{path}\"" },
                { "thunar", $"\"{path}\"" },
                { "caja", $"--select \"{path}\"" },
                { "pcmanfm-qt", $"\"{directoryPath}\"" },
                { "pcmanfm", $"\"{directoryPath}\"" },
                { "dolphin", $"--select \"{path}\"" },
                { "konqueror", $"--select \"{path}\"" },
                { "xdg-open", $"\"{directoryPath}\"" }
            };

            foreach (var command in commandAttempt)
            {
                if (!IsCommandAvailable(command.Key))
                    continue;

                try
                {
                    var process = new Process
                    {
                        StartInfo = new ProcessStartInfo
                        {
                            FileName = command.Key,
                            Arguments = command.Value,
                            UseShellExecute = false,
                            RedirectStandardError = true,
                            RedirectStandardOutput = true,
                            CreateNoWindow = true,
                        }
                    };
                    process.Start();
                    return; // Assume first successful start is enough
                }
                catch
                {
                    // Ignore and try next
                }
            }
        }

        private bool IsCommandAvailable(string command)
        {
            try
            {
                var which = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "which",
                        Arguments = command,
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                    }
                };
                which.Start();
                string result = which.StandardOutput.ReadToEnd();
                which.WaitForExit();
                return which.ExitCode == 0 && !string.IsNullOrWhiteSpace(result);
            }
            catch
            {
                return false;
            }
        }

        public override Task<string> OpenFolderSelectorDialog(string defaultPath = "")
        {
            throw DesktopOnly();
        }

        public override Task<string> OpenFileSelectorDialog(string defaultPath = "", string defaultExt = "",
            string defaultFilter = "All files (*.*)|*.*")
        {
            throw DesktopOnly();
        }
    }
}
