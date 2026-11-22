using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace VRCX
{
    public partial class AppApiElectron
    {
        public async Task<string> GetNexVRPartyRequests()
        {
            var data = GetNexVRPlayerDataPath();
            if (data == null)
                return "";

            try
            {
                var path = Path.Join(data, "nexy-party-bridge", "requests.json");
                using var stream = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete, 4096, useAsync: true);
                var length = stream.Length;
                if (length <= 0 || length > 65536)
                    return "";

                var bytes = new byte[(int)length];
                await stream.ReadExactlyAsync(bytes);
                return Encoding.UTF8.GetString(bytes);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                return "";
            }
        }
    }
}
