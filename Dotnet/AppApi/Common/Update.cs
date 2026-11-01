using System;
using System.Threading.Tasks;

namespace VRCX;

public partial class AppApi
{
    private const string NexyReleaseDownloadPrefix = "https://github.com/valzzu/Nexy/releases/download/";

    public Task DownloadUpdate(string fileUrl, string hashString, int downloadSize)
    {
        // Only accept installers published on Nexy's own GitHub releases.
        if (string.IsNullOrEmpty(fileUrl) || !fileUrl.StartsWith(NexyReleaseDownloadPrefix, StringComparison.Ordinal))
            throw new ArgumentException("Update downloads must come from Nexy's GitHub releases.");

        return Update.DownloadUpdate(fileUrl, hashString, downloadSize);
    }

    public void CancelUpdate()
    {
        Update.CancelUpdate();
    }

    public int CheckUpdateProgress()
    {
        return Update.UpdateProgress;
    }
}
