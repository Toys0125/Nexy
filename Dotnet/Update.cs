using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using NLog;

#if !LINUX
using System.Windows.Forms;
#endif

namespace VRCX
{
    public class Update
    {
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        private static readonly string NexySetupExecutable = Path.Join(Program.AppDataDirectory, "Nexy_Setup.exe");
        private static readonly string UpdateExecutable = Path.Join(Program.AppDataDirectory, "update.exe");
        private static readonly string TempDownload = Path.Join(Program.AppDataDirectory, "tempDownload");
        private static readonly HttpClient httpClient;
        private static CancellationTokenSource _downloadCancellation = new();
        private static Task _activeDownload = Task.CompletedTask;
        public static int UpdateProgress;
        private static string AppImagePath = string.Empty;
        private static string AppImagePathOld = string.Empty;

        static Update()
        {
            var httpClientHandler = new HttpClientHandler();
            if (WebApi.ProxySet)
                httpClientHandler.Proxy = WebApi.Proxy;

            httpClient = new HttpClient(httpClientHandler);
            httpClient.DefaultRequestHeaders.Add("User-Agent", Program.Version);
        }

        public void Init(string appImagePath = "")
        {
            if (string.IsNullOrEmpty(appImagePath))
                return;

            AppImagePath = appImagePath;
            AppImagePathOld = appImagePath + ".old";
            logger.Info($"AppImagePath: {AppImagePath}");
        }

        public static bool HasPendingInstaller()
        {
            return OperatingSystem.IsWindows() && File.Exists(UpdateExecutable);
        }

        /// <summary>
        /// Removes leftovers from a previous run, including any staged update.exe: it may be a
        /// legacy CefSharp installer or an outdated download, so it is never installed later.
        /// </summary>
        public static void Cleanup()
        {
            try
            {
                if (File.Exists(TempDownload))
                    File.Delete(TempDownload);
                if (File.Exists(UpdateExecutable))
                    File.Delete(UpdateExecutable);
                if (File.Exists(NexySetupExecutable) && Process.GetProcessesByName("Nexy_Setup").Length == 0)
                    File.Delete(NexySetupExecutable);
            }
            catch (Exception e)
            {
                logger.Warn(e, "Failed to clean up previous update files");
            }
        }

        /// <summary>
        /// Starts the staged Windows installer. The caller must quit the app afterwards so the
        /// installer can replace its files; the installer relaunches Nexy when it finishes.
        /// </summary>
        public bool LaunchInstaller()
        {
            if (!HasPendingInstaller())
                return false;

            try
            {
                if (File.Exists(NexySetupExecutable))
                    File.Delete(NexySetupExecutable);
                File.Move(UpdateExecutable, NexySetupExecutable);
                var nexyProcess = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = NexySetupExecutable,
                        // Same arguments electron-updater uses: silent upgrade, relaunch afterwards.
                        Arguments = "--updated /S --force-run",
                        UseShellExecute = true,
                        WorkingDirectory = Program.AppDataDirectory
                    }
                };
                nexyProcess.Start();
                return true;
            }
            catch (Exception e)
            {
                var message = $"Failed to install the update: {e.Message}";
                logger.Error(e, message);
#if !LINUX
                MessageBox.Show(message, "Update failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
#endif
                return false;
            }
        }

        public static async Task DownloadInstallRedist()
        {
            try
            {
                var filePath = await DownloadFile("https://aka.ms/vs/17/release/vc_redist.x64.exe");
                var installRedist = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = filePath,
                        Arguments = "/install /quiet /norestart"
                    }
                };
                installRedist.Start();
                await installRedist.WaitForExitAsync();
            }
            catch (Exception e)
            {
                var message = $"Failed to download and install the Visual C++ Redistributable: {e.Message}";
                logger.Info(message);
#if !LINUX
                MessageBox.Show(message, "Update failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
#endif
            }
        }

        private static async Task<string> DownloadFile(string fileUrl, CancellationToken cancellationToken = default)
        {
            var response = await httpClient.GetAsync(fileUrl, cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"Failed to download the file. Status code: {response.StatusCode}");

            var fileName = GetFileNameFromContentDisposition(response);
            var tempPath = Path.Join(Path.GetTempPath(), "Nexy");
            Directory.CreateDirectory(tempPath);
            var filePath = Path.Join(tempPath, fileName);
            await using var fileStream = File.Create(filePath);
            await response.Content.CopyToAsync(fileStream, cancellationToken);
            return filePath;
        }

        private static string GetFileNameFromContentDisposition(HttpResponseMessage response)
        {
            string contentDisposition = response.Content.Headers.ContentDisposition?.ToString();
            if (contentDisposition != null)
            {
                int startIndex = contentDisposition.IndexOf("filename=", StringComparison.OrdinalIgnoreCase);
                if (startIndex >= 0)
                {
                    startIndex += "filename=".Length;
                    int endIndex = contentDisposition.IndexOf(";", startIndex, StringComparison.Ordinal);
                    if (endIndex == -1)
                    {
                        endIndex = contentDisposition.Length;
                    }

                    string fileName = contentDisposition.Substring(startIndex, endIndex - startIndex).Trim(' ', '"');
                    return fileName;
                }
            }

            throw new Exception("Unable to extract file name from content-disposition header.");
        }

        public static Task DownloadUpdate(string fileUrl, string hashString, int downloadSize)
        {
            if (!OperatingSystem.IsWindows() && string.IsNullOrEmpty(AppImagePath))
                throw new NotSupportedException("Automatic updates are only supported for the Windows installer and AppImage.");

            var cancellation = new CancellationTokenSource();
            _downloadCancellation = cancellation;
            var download = DownloadAndStageUpdate(fileUrl, hashString, downloadSize, cancellation.Token);
            _activeDownload = download;
            return download;
        }

        private static async Task DownloadAndStageUpdate(string fileUrl, string hashString, int downloadSize, CancellationToken cancellationToken)
        {
            const int chunkSize = 8192;
            try
            {
                if (File.Exists(TempDownload))
                    File.Delete(TempDownload);

                await using var destination = File.OpenWrite(TempDownload);
                using var response = await httpClient.GetAsync(fileUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                response.EnsureSuccessStatusCode();
                await using var download = await response.Content.ReadAsStreamAsync(cancellationToken);
                var contentLength = response.Content.Headers.ContentLength;
                var buffer = new byte[chunkSize];
                long totalBytesRead = 0;

                while (true)
                {
                    if (contentLength.HasValue)
                    {
                        var percentage = Math.Round((double)totalBytesRead / contentLength.Value * 100, 2);
                        UpdateProgress = (int)percentage;
                    }
                    var bytesRead = await download.ReadAsync(buffer.AsMemory(0, chunkSize), cancellationToken);
                    if (bytesRead == 0)
                        break;

                    cancellationToken.ThrowIfCancellationRequested();

                    await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                    totalBytesRead += bytesRead;
                }

                destination.Close();

                var data = new FileInfo(TempDownload);
                if (data.Length != downloadSize)
                {
                    File.Delete(TempDownload);
                    logger.Error("Downloaded file size does not match expected size");
                    throw new Exception("Downloaded file size does not match expected size");
                }

                if (string.IsNullOrEmpty(hashString))
                {
                    File.Delete(TempDownload);
                    throw new Exception("Update is missing a SHA-256 hash");
                }
                else
                {
                    logger.Info("Checking hash");
                    using (var sha256 = SHA256.Create())
                    await using (var stream = File.OpenRead(TempDownload))
                    {
                        var fileHashBytes = await sha256.ComputeHashAsync(stream, cancellationToken);
                        var fileHashString = Convert.ToHexString(fileHashBytes);
                        if (!hashString.Equals(fileHashString, StringComparison.OrdinalIgnoreCase))
                        {
                            logger.Error($"Hash check failed file:{fileHashString} web:{hashString}");
                            throw new Exception("Hash check failed");
                            // can't delete file yet because it's in use
                        }
                    }

                    logger.Info("Hash check passed");
                }

                if (string.IsNullOrEmpty(AppImagePath))
                {
                    // Windows
                    if (File.Exists(UpdateExecutable))
                        File.Delete(UpdateExecutable);
                    File.Move(TempDownload, UpdateExecutable);
                }
                else
                {
                    // Linux: stage next to the AppImage so the swap stays on one filesystem,
                    // then replace it in one step so the launch path never goes missing.
                    var stagedAppImage = AppImagePath + ".new";
                    File.Move(TempDownload, stagedAppImage, true);
                    if (!OperatingSystem.IsWindows())
                        File.SetUnixFileMode(stagedAppImage, File.GetUnixFileMode(AppImagePath) | UnixFileMode.UserExecute);
                    File.Replace(stagedAppImage, AppImagePath, AppImagePathOld);
                }

            }
            catch
            {
                // Streams are closed by now, so a failed or cancelled download can be removed.
                try
                {
                    if (File.Exists(TempDownload))
                        File.Delete(TempDownload);
                }
                catch (Exception e)
                {
                    logger.Warn(e, "Failed to remove the incomplete update download");
                }
                throw;
            }
            finally
            {
                UpdateProgress = 0;
            }
        }

        public static async Task CancelUpdate()
        {
            _downloadCancellation.Cancel();
            // Wait for the download to stop and clean up, so a retry cannot race its temp file.
            try
            {
                await _activeDownload;
            }
            catch
            {
                // The cancelled download reports its own failure to the caller.
            }
            UpdateProgress = 0;
        }
    }
}
