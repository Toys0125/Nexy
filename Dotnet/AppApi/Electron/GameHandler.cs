using System;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;

namespace VRCX
{
    public partial class AppApiElectron
    {
        public override void OnProcessStateChanged(MonitoredProcess monitoredProcess)
        {
            // unused
        }

        /// <summary>
        /// The Electron frontend polls game state directly through the .NET bridge.
        /// </summary>
        public override void CheckGameRunning()
        {
        }

        // The NexVR client: "NexVR" natively on Windows, "NexVR.exe" under Wine/Proton
        private static Process[] GetGameProcesses()
        {
            return Process.GetProcessesByName("NexVR").Concat(Process.GetProcessesByName("NexVR.exe")).ToArray();
        }

        public override bool IsGameRunning()
        {
            var processes = GetGameProcesses();
            var isGameRunning = processes.Length > 0;
            foreach (var process in processes)
                process.Dispose();

            return isGameRunning;
        }

        public override bool IsSteamVRRunning()
        {
            var processNames = OperatingSystem.IsWindows()
                ? new[] { "vrserver", "vrmonitor" }
                : new[] { "vrmonitor", "monado-service" };
            foreach (var name in processNames)
            {
                var processes = Process.GetProcessesByName(name);
                var isSteamVRRunning = processes.Length > 0;
                foreach (var process in processes)
                    process.Dispose();

                if (isSteamVRRunning)
                    return true;
            }

            if (OperatingSystem.IsWindows())
                return false;

            // Check for wivrn-server (requires full scan)
            var allProcesses = Process.GetProcesses();
            var isRunning = allProcesses.Any(process => process.ProcessName.EndsWith("wivrn-server"));
            foreach (var process in allProcesses)
                process.Dispose();

            return isRunning;
        }

        public override int QuitGame()
        {
            var processes = GetGameProcesses();
            if (processes.Length == 1)
                processes[0].Kill();
            foreach (var process in processes)
                process.Dispose();

            return processes.Length;
        }

        public override bool StartGame(string arguments)
        {
            var startInfo = NexvrLaunch.FromUrl(arguments);
            if (startInfo == null)
            {
                logger.Warn("NexVR launch requires a nexvr://instances/<id>/join link. Steam IDs and arbitrary launch options are unsupported.");
                return false;
            }

            try
            {
                Process.Start(startInfo)?.Dispose();
                return true;
            }
            catch (Exception ex)
            {
                logger.Error(ex, "Failed to open NexVR through its installed protocol handler");
                return false;
            }
        }

        public override bool StartGameFromPath(string path, string arguments)
        {
            if (!OperatingSystem.IsWindows())
                return false;

            var startInfo = GameLaunch.WindowsStartInfo(path, arguments);
            if (startInfo == null)
                return false;

            Process.Start(startInfo)?.Dispose();
            return true;
        }

        public override Task<bool> TryOpenInstanceInVrc(string launchUrl)
        {
            // Keep the legacy API name for bridge compatibility; NexVR joins
            // through its protocol handler on every platform.
            return Task.FromResult(StartGame(launchUrl));
        }
    }
}
