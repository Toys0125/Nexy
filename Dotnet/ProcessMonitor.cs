using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Timers;
using NLog;

namespace VRCX
{
    // I don't think this applies to our use case, but I'm leaving it here for reference.
    // https://stackoverflow.com/questions/2519673/process-hasexited-returns-true-even-though-process-is-running
    // "When a process is started, it is assigned a PID. If the User is then prompted with the User Account Control dialog and selects 'Yes', the process is re-started and assigned a new PID."
    // There's no docs for this, but Process.HasExited also seems to be checked every time the property is accessed, so it's not cached. Which means Process.Refresh() is not needed for our use case.

    /// <summary>
    ///     A class that monitors given processes and raises events when they are started or exited.
    ///     Intended to be used to monitor VRChat and VRChat-related processes.
    /// </summary>
    internal class ProcessMonitor
    {
        private readonly Dictionary<string, MonitoredProcess> monitoredProcesses;
        private readonly Timer monitorProcessTimer;
        private readonly object sync = new();
        private bool running;
        private readonly Func<string, Process[]> findProcesses;
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();

        static ProcessMonitor()
        {
            Instance = new ProcessMonitor();
            Instance.ProcessStarted += Program.AppApiInstance.OnProcessStateChanged;
            Instance.ProcessExited += Program.AppApiInstance.OnProcessStateChanged;
        }

        public ProcessMonitor() : this(Process.GetProcessesByName) { }

        internal ProcessMonitor(Func<string, Process[]> findProcesses)
        {
            this.findProcesses = findProcesses;
            monitoredProcesses = new Dictionary<string, MonitoredProcess>();

            monitorProcessTimer = new Timer();
            monitorProcessTimer.Interval = 1000;
            monitorProcessTimer.Elapsed += MonitorProcessTimer_Elapsed;
        }

        public static ProcessMonitor Instance { get; private set; }

        /// <summary>
        ///     Raised when a monitored process is started.
        /// </summary>
        public event Action<MonitoredProcess> ProcessStarted;

        /// <summary>
        ///     Raised when a monitored process is exited.
        /// </summary>
        public event Action<MonitoredProcess> ProcessExited;

        public void Init()
        {
            lock (sync)
            {
                AddProcess(AutoAppLaunchManager.GameProcessName);
                AddProcess("vrserver");
                running = true;
                monitorProcessTimer.Start();
            }
        }

        public void Exit()
        {
            lock (sync)
            {
                running = false;
                monitorProcessTimer.Stop();
                foreach (var process in monitoredProcesses.Values) process.ProcessExited();
            }
        }

        private void MonitorProcessTimer_Elapsed(object sender, ElapsedEventArgs e)
        {
            lock (sync)
            {
                if (!running) return;
                try
                {
                    foreach (var monitored in monitoredProcesses.Values.ToArray())
                    {
                        if (monitored.IsRunning)
                        {
                            if (monitored.Process == null || WinApi.HasProcessExited(monitored.Process.Id))
                            {
                                monitored.ProcessExited();
                                ProcessExited?.Invoke(monitored);
                            }
                            else continue;
                        }

                        // Only inspect the requested name, and retain a handle
                        // solely for the process we track. Enabling this timer
                        // must not leak a full system process snapshot each tick.
                        var processes = findProcesses(monitored.ProcessName);
                        Process selected = null;
                        try
                        {
                            selected = processes.FirstOrDefault(process => !WinApi.HasProcessExited(process.Id));
                            if (selected == null) continue;
                            monitored.ProcessStarted(selected);
                            ProcessStarted?.Invoke(monitored);
                        }
                        finally
                        {
                            foreach (var process in processes)
                                if (process != selected) process.Dispose();
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.Warn(ex, "Failed to poll monitored processes");
                }
            }
        }

        /// <summary>
        ///     Checks if a process if currently being monitored and if it is running.
        /// </summary>
        /// <param name="processName">The name of the process to check for.</param>
        /// <param name="ensureCheck">If true, will manually check if the given process is running should the the monitored process not be initialized yet.</param>
        /// <returns>Whether the given process is monitored and currently running.</returns>
        public bool IsProcessRunning(string processName, bool ensureCheck = false)
        {
            lock (sync)
            {
                processName = processName.ToLower();
                if (!monitoredProcesses.TryGetValue(processName, out var process))
                    return false;

                if (ensureCheck && process.Process == null)
                {
                    var processes = Process.GetProcessesByName(processName);
                    var isProcessRunning = processes.Length > 0;
                    foreach (var proc in processes)
                        proc.Dispose();

                    return isProcessRunning;
                }

                return process.IsRunning;
            }
        }

        /// <summary>
        ///     Adds a process to be monitored.
        /// </summary>
        /// <param name="process"></param>
        public void AddProcess(Process process)
        {
            lock (sync)
            {
                var processName = process.ProcessName.ToLower();
                if (monitoredProcesses.ContainsKey(processName))
                    return;

                monitoredProcesses.Add(processName, new MonitoredProcess(process));
                logger.Debug($"Added process {processName} to process monitor.");
            }
        }

        /// <summary>
        ///     Adds a process to be monitored.
        /// </summary>
        /// <param name="processName"></param>
        public void AddProcess(string processName)
        {
            lock (sync)
            {
                processName = processName.ToLower();
                if (monitoredProcesses.ContainsKey(processName))
                    return;

                monitoredProcesses.Add(processName, new MonitoredProcess(processName));
                logger.Debug($"Added process {processName} to process monitor.");
            }
        }

        /// <summary>
        ///     Removes a process from being monitored.
        /// </summary>
        /// <param name="processName"></param>
        public void RemoveProcess(string processName)
        {
            lock (sync)
            {
                processName = processName.ToLower();
                if (monitoredProcesses.Remove(processName, out var process)) process.ProcessExited();
                logger.Debug($"Removed process {processName} from process monitor.");
            }
        }
    }

    public class MonitoredProcess
    {
        public MonitoredProcess(Process process)
        {
            Process = process;
            ProcessName = process.ProcessName.ToLower();

            if (!WinApi.HasProcessExited(process.Id))
                IsRunning = true;
        }

        public MonitoredProcess(string processName)
        {
            ProcessName = processName;
            IsRunning = false;
        }

        public Process Process { get; private set; }
        public string ProcessName { get; private set; }
        public bool IsRunning { get; private set; }

        public bool HasName(string processName)
        {
            return ProcessName.Equals(processName, StringComparison.OrdinalIgnoreCase);
        }

        public void ProcessExited()
        {
            IsRunning = false;
            Process?.Dispose();
            Process = null;
        }

        public void ProcessStarted(Process process)
        {
            Process = process;
            ProcessName = process.ProcessName.ToLower();
            IsRunning = true;
        }
    }
}
