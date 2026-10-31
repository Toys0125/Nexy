using System;
using System.IO;
using System.Text.Json;
using NLog;
using NLog.Targets;

namespace VRCX
{
    public static class Program
    {
        public static string BaseDirectory { get; private set; }
        public static string AppDataDirectory;
        public static string ConfigLocation { get; private set; }
        public static string Version { get; private set; }
        public static bool LaunchDebug;
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        public static AppApi AppApiInstance { get; private set; }

        private const string DatabaseFileName = "Nexy.sqlite3";
        private const string StorageFileName = "Nexy.json";

        /// <summary>Settings file read and written by VRCXStorage.</summary>
        public static string StorageLocation { get; private set; }

        private static void SetProgramDirectories()
        {
            if (string.IsNullOrEmpty(AppDataDirectory))
                AppDataDirectory = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Nexy");

            BaseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            ConfigLocation = Path.Join(AppDataDirectory, DatabaseFileName);
            StorageLocation = Path.Join(AppDataDirectory, StorageFileName);

            if (!Directory.Exists(AppDataDirectory))
            {
                Directory.CreateDirectory(AppDataDirectory);

                // Migrate config to AppData
                if (File.Exists(Path.Join(BaseDirectory, StorageFileName)))
                {
                    File.Move(Path.Join(BaseDirectory, StorageFileName), StorageLocation);
                    File.Copy(StorageLocation, Path.Join(AppDataDirectory, "Nexy-backup.json"));
                }

                if (File.Exists(Path.Join(BaseDirectory, DatabaseFileName)))
                {
                    File.Move(Path.Join(BaseDirectory, DatabaseFileName), ConfigLocation);
                    File.Copy(ConfigLocation, Path.Join(AppDataDirectory, "Nexy-backup.sqlite3"));
                }
            }

            // Preserve cache data from older Nexy installations
            var oldCachePath = Path.Join(AppDataDirectory, "cache");
            var newCachePath = Path.Join(AppDataDirectory, "userdata", "cache");
            if (Directory.Exists(oldCachePath) && !Directory.Exists(newCachePath))
            {
                Directory.CreateDirectory(Path.Join(AppDataDirectory, "userdata"));
                Directory.Move(oldCachePath, newCachePath);
            }
        }

        private static void GetVersion()
        {
            try
            {
                var versionFile = File.ReadAllText(Path.Join(BaseDirectory, "Version")).Trim();

                // look for trailing git hash "-22bcd96" to indicate nightly build
                var version = versionFile.Split('-');
                if (version.Length > 0 && version[^1].Length == 7)
                    Version = $"Nexy Nightly {versionFile}";
                else
                    Version = $"Nexy {versionFile}";
            }
            catch (Exception ex)
            {
                logger.Error(ex, "Failed to read version file");
                Version = "Nexy Nightly Build";
            }
        }

        private static void ConfigureLogger()
        {
            var fileName = Path.Join(AppDataDirectory, "logs", "VRCX.log");
            if (StartupArgs.LaunchArguments.IsOverlay)
                fileName = Path.Join(AppDataDirectory, "logs", "VRCX.Overlay.log");

            LogManager.Setup().LoadConfiguration(builder =>
            {
                var fileTarget = new FileTarget("fileTarget")
                {
                    FileName = fileName,
                    //Layout = "${longdate} [${level:uppercase=true}] ${logger} - ${message} ${exception:format=tostring}",
                    // Layout with padding between the level/logger and message so that the message always starts at the same column
                    Layout =
                        "${longdate} [${level:uppercase=true:padding=-5}] ${logger:padding=-20} - ${message} ${exception:format=tostring}",
                    ArchiveSuffixFormat = "{0:000}",
                    ArchiveEvery = FileArchivePeriod.Day,
                    MaxArchiveFiles = 4,
                    MaxArchiveDays = 7,
                    ArchiveAboveSize = 10000000,
                    ArchiveOldFileOnStartup = true,
                    KeepFileOpen = true,
                    AutoFlush = true,
                    Encoding = System.Text.Encoding.UTF8
                };
                builder.ForLogger().FilterMinLevel(LogLevel.Debug).WriteTo(fileTarget);

                var consoleTarget = new ConsoleTarget("consoleTarget")
                {
                    Layout = "${longdate} [${level:uppercase=true:padding=-5}] ${logger:padding=-20} - ${message} ${exception:format=tostring}",
                    DetectConsoleAvailable = true
                };
                builder.ForLogger().FilterMinLevel(LogLevel.Debug).WriteTo(consoleTarget);
            });
        }

        public static VRCXVRInterface VRCXVRInstance;

        public static void PreInit(string version, string[] args)
        {
            Version = version;
            StartupArgs.ArgsCheck(args);
            SetProgramDirectories();
        }

        public static void Init()
        {
            ConfigureLogger();
            // Nexy uses manual Electron installers. Never execute a staged
            // legacy update.exe from a previous CefSharp installation.

            logger.Info("{0} Starting...", Version);
            logger.Info("Args: {0}", JsonSerializer.Serialize(StartupArgs.Args));
            if (!string.IsNullOrEmpty(StartupArgs.LaunchArguments.LaunchCommand))
                logger.Info("Launch Command: {0}", StartupArgs.LaunchArguments.LaunchCommand);

            AppApiInstance = new AppApiElectron();

            if (OperatingSystem.IsWindows())
            {
                // Subscribe companion-app handlers before polling can emit the
                // first game event. The monitor relies on Windows process APIs.
                AutoAppLaunchManager.Instance.Init();
                ProcessMonitor.Instance.Init();
            }

            VRCXVRInstance = new VRCXVRElectron();
            VRCXVRInstance.Init();
        }
    }

#if LINUX
    public class ProgramElectron
    {
        public void Exit()
        {
            if (OperatingSystem.IsWindows())
            {
                ProcessMonitor.Instance.Exit();
                AutoAppLaunchManager.Instance.Exit();
            }
            Program.VRCXVRInstance?.Exit();
            SystemMonitorElectron.Instance?.Exit();
            LogManager.Shutdown();
        }

        public void PreInit(string version, string[] args)
        {
            Program.PreInit(version, args);
        }

        public void Init()
        {
            Program.Init();
        }
    }
#endif
}
