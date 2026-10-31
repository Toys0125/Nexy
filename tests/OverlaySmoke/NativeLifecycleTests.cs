using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Threading;
using System.Threading.Tasks;
using VRCX;

internal static class NativeLifecycleTests
{
    internal static void Run()
    {
        var profile = Path.Join(Path.GetTempPath(), "Nexy-Lifecycle-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(profile);
        var program = new ProgramElectron();
        program.PreInit("Nexy lifecycle test", new[] { "--config=" + profile });
        program.Init();
        var monitor = SystemMonitorElectron.Instance;
        for (var cycle = 0; cycle < 6; cycle++)
        {
            monitor.Start(true);
            Check(SpinWait.SpinUntil(() => monitor.UpTime > 0, 2000), "System monitor did not produce metrics");
            Check(Task.Run(() => monitor.Start(false)).Wait(2000), "System monitor shutdown deadlocked");
            Check(monitor.UpTime == 0 && monitor.CpuUsage == 0, "System monitor did not reset after shutdown");
        }

        if (OperatingSystem.IsWindows()) CompanionLifecycle();
        monitor.Start(true);
        Check(Task.Run(() => program.Exit()).Wait(2000), "ProgramElectron.Exit hung with system monitoring active");
        program.Init();
        monitor.Start(true);
        Check(Task.Run(() => program.Exit()).Wait(2000), "Restarted native services did not shut down");
        Console.WriteLine("System monitor start/stop cycles and full native shutdown/restart passed");
    }

    [SupportedOSPlatform("windows")]
    private static void CompanionLifecycle()
    {
        var gamePath = Path.Join(AppContext.BaseDirectory, "NexVR.exe");
        var companionName = "NexyCompanion_" + Guid.NewGuid().ToString("N");
        var companionPath = Path.Join(AppContext.BaseDirectory, companionName + ".exe");
        File.Copy(Environment.ProcessPath, gamePath, true);
        File.Copy(Environment.ProcessPath, companionPath);
        using var game = new Process { StartInfo = new ProcessStartInfo(gamePath, "--helper") { UseShellExecute = false, CreateNoWindow = true } };
        var gameStarted = false;
        // Keep the production timer and event flow, while limiting process
        // enumeration to our owned fixture PID. A user's real NexVR session
        // must never be selected, launched against, or stopped by this test.
        Func<string, Process[]> finder = (name) => gameStarted && name.Equals("nexvr", StringComparison.OrdinalIgnoreCase) && !game.HasExited
            ? new[] { Process.GetProcessById(game.Id) } : Array.Empty<Process>();
        var monitorType = typeof(ProgramElectron).Assembly.GetType("VRCX.ProcessMonitor");
        var monitor = Activator.CreateInstance(monitorType, BindingFlags.Instance | BindingFlags.NonPublic, null, new object[] { finder }, null);
        var manager = (AutoAppLaunchManager)Activator.CreateInstance(typeof(AutoAppLaunchManager),
            BindingFlags.Instance | BindingFlags.NonPublic, null, new[] { monitor }, null);
        var shortcutPath = Path.Join(manager.AppShortcutDirectory, "companion-test.lnk");
        dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = companionPath;
        shortcut.Arguments = "--helper";
        shortcut.Save();
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);

        Process companion = null;
        try
        {
            manager.Enabled = true;
            manager.KillChildrenOnExit = true;
            monitorType.GetMethod("Init").Invoke(monitor, null);
            gameStarted = game.Start();
            Check(SpinWait.SpinUntil(() =>
            {
                var processes = Process.GetProcessesByName(companionName);
                if (processes.Length == 0) return false;
                companion = processes[0];
                for (var i = 1; i < processes.Length; i++) processes[i].Dispose();
                return true;
            }, 5000), "Starting NexVR did not launch the configured companion shortcut");
            game.Kill();
            game.WaitForExit();
            Check(companion.WaitForExit(5000), "Exiting NexVR did not stop its companion process");
            Console.WriteLine("Real Windows NexVR process events launched and stopped a shortcut companion");
        }
        finally
        {
            manager.Enabled = false;
            monitorType.GetMethod("Exit").Invoke(monitor, null);
            manager.Exit();
            if (gameStarted && !game.HasExited) { game.Kill(); game.WaitForExit(); }
            if (companion != null)
            {
                if (!companion.HasExited) { companion.Kill(); companion.WaitForExit(); }
                companion.Dispose();
            }
            File.Delete(shortcutPath);
            File.Delete(gamePath);
            File.Delete(companionPath);
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
