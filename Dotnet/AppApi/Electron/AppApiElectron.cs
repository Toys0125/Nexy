using System;
using System.IO;
using System.Threading.Tasks;
using NLog;

namespace VRCX
{
    public partial class AppApiElectron : AppApi
    {
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();

        // These methods belong to Electron's main process. Its AppApiElectron
        // dispatcher intercepts them before .NET invocation (desktop-api.js).
        // Fail explicitly if a new caller bypasses that dispatcher.
        private static NotSupportedException DesktopOnly() =>
            new("This desktop method must be called through Electron's desktop API dispatcher.");

        public override void ShowDevTools() => throw DesktopOnly();
        public override void SetZoom(double zoomLevel) => throw DesktopOnly();
        public override Task<double> GetZoom() => throw DesktopOnly();
        public override void DesktopNotification(string BoldText, string Text = "", string Image = "") => throw DesktopOnly();
        public override void RestartApplication(bool isUpgrade) => throw DesktopOnly();
        public override void FocusWindow() => throw DesktopOnly();
        public override void ChangeTheme(int value) => throw DesktopOnly();
        public override void DoFunny() => throw DesktopOnly();
        public override string GetClipboard() => throw DesktopOnly();
        public override void SetStartup(bool enabled) => throw DesktopOnly();
        public override void CopyImageToClipboard(string path) => throw DesktopOnly();
        public override void FlashWindow() => throw DesktopOnly();
        public override void SetUserAgent() => throw DesktopOnly();
        public override void SetTrayIconNotification(bool notify) => throw DesktopOnly();
        public override void OpenCalendarFile(string icsContent) => throw DesktopOnly();

        public override bool CheckForUpdateExe() => false;

        public override void SetVR(bool active, bool hmdOverlay, bool wristOverlay, bool menuButton, int overlayHand)
        {
            Program.VRCXVRInstance.SetActive(active, hmdOverlay, wristOverlay, menuButton, overlayHand);
        }

        public override void ExecuteVrOverlayFunction(string function, string json)
        {
            Program.VRCXVRInstance.ExecuteVrOverlayFunction(function, json);
        }

        // ImageSharp handles clipboard formats unsupported by Electron's loader.
        public string DecodeClipboardImage(string path)
        {
            using var image = SixLabors.ImageSharp.Image.Load(path);
            using var stream = new MemoryStream();
            SixLabors.ImageSharp.ImageExtensions.SaveAsPng(image, stream);
            return Convert.ToBase64String(stream.ToArray());
        }
    }
}
