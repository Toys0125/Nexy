using System;
using System.Reflection;
using System.Threading.Tasks;

namespace NexyDiagnostics;

// Use reflection so loading this probe on the JS thread cannot eagerly resolve
// the texture writer's dependencies and hide a missing startup preload.
public static class OverlayLoadProbe
{
    public static Task<string> CreateTexture() => Task.Run(() =>
    {
        var assembly = Assembly.Load("VRCX-Electron");
        var type = assembly.GetType("VRCX.D3DTextureWriter", throwOnError: true);
        using var writer = (IDisposable)Activator.CreateInstance(type, 8, 8, 0);
        var pixels = new byte[8 * 8 * 4];
        Array.Fill(pixels, (byte)127);
        type.GetMethod("WriteImageToBuffer").Invoke(writer, new object[] { pixels });
        type.GetMethod("UpdateTexture").Invoke(writer, null);
        return "Background D3D texture creation and upload passed";
    });
}
