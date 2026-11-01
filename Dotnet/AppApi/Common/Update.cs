using System;
using System.Threading.Tasks;

namespace VRCX;

public partial class AppApi
{
    public Task DownloadUpdate(string fileUrl, string hashString, int downloadSize)
    {
        // Only accept installers published on Nexy's own GitHub releases. Check the
        // canonical path so dot segments cannot escape the repository.
        if (!Uri.TryCreate(fileUrl, UriKind.Absolute, out var fileUri) ||
            fileUri.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(fileUri.Host, "github.com", StringComparison.OrdinalIgnoreCase) ||
            !fileUri.AbsolutePath.StartsWith("/valzzu/Nexy/releases/download/", StringComparison.Ordinal))
            throw new ArgumentException("Update downloads must come from Nexy's GitHub releases.");

        if (string.IsNullOrEmpty(hashString))
            throw new ArgumentException("Update downloads must include a SHA-256 hash.");

        return Update.DownloadUpdate(fileUri.AbsoluteUri, hashString, downloadSize);
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
