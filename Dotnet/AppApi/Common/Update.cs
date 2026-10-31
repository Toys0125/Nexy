using System;
using System.Threading.Tasks;

namespace VRCX;

public partial class AppApi
{
    public Task DownloadUpdate(string fileUrl, string hashString, int downloadSize)
    {
        throw new NotSupportedException("Automatic updates are disabled. Install Nexy updates from Releases.");
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
