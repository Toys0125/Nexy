using System;
using System.Runtime.InteropServices;
using Valve.VR;
using VRCX;

internal static class OverlayRegionTests
{
    [DllImport("libGL.so.1", EntryPoint = "glBindTexture")]
    private static extern void BindTexture(uint target, uint texture);
    [DllImport("libGL.so.1", EntryPoint = "glGetTexImage")]
    private static extern void ReadTexture(uint target, int level, uint format, uint type, byte[] pixels);

    internal static void Run()
    {
        var original = new byte[OverlayFrames.Size];
        for (var y = 0; y < 1536; y++)
            for (var x = 0; x < 1024; x++)
            {
                var offset = (y * 1024 + x) * 4;
                original[offset] = y < 512 ? (byte)(x < 512 ? 17 : 99) : (byte)203;
                original[offset + 1] = (byte)y;
                original[offset + 2] = (byte)(x % 128 + y / 256 * 16);
                original[offset + 3] = 255;
            }

        foreach (var openGL in new[] { false, true })
        {
            var uploaded = (byte[])original.Clone();
            OverlayTextureLayout.PrepareFrame(uploaded, openGL);
            AssertRegions(original, uploaded, openGL);
            if (openGL)
            {
                // Regression guard: putting the old [0, 1/3] wrist interval
                // back after a whole-frame flip samples HMD pixels instead.
                var oldBounds = new VRTextureBounds_t { uMin = 0, uMax = 0.5f, vMin = 0, vMax = 1f / 3 };
                var oldPixel = Sample(uploaded, oldBounds, 0, 0, 512, 512, true);
                if (uploaded[oldPixel] == 17) throw new Exception("Region fixture does not detect the proposed GL rollback");
            }

            if (openGL && OperatingSystem.IsLinux())
            {
                if (!GLContextX11.Initialise()) throw new Exception("Failed to create the Linux GL test context");
                try
                {
                    using var writer = new GLTextureWriter(1024, 1536);
                    writer.WriteImageToBuffer(uploaded);
                    writer.UpdateTexture();
                    BindTexture(0x0DE1, (uint)writer.AsTextureT().handle);
                    var readback = new byte[uploaded.Length];
                    ReadTexture(0x0DE1, 0, 0x80E1, 0x1401, readback);
                    AssertRegions(original, readback, true);
                    Console.WriteLine("Linux OpenGL GPU readback: independent wrist/HMD regions and orientation passed");
                }
                finally { GLContextX11.Cleanup(); }
            }
        }
        Console.WriteLine("DirectX and OpenGL pixel sampling: wrist, HMD, corners, row order, and horizontal crop passed");
    }

    private static void AssertRegions(byte[] original, byte[] uploaded, bool openGL)
    {
        foreach (var wrist in new[] { true, false })
        {
            var width = wrist ? 512 : 1024;
            var height = wrist ? 512 : 1024;
            var bounds = OverlayTextureLayout.Bounds(wrist, openGL);
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var actual = Sample(uploaded, bounds, x, y, width, height, openGL);
                    var expected = ((y + (wrist ? 0 : 512)) * 1024 + x) * 4;
                    for (var channel = 0; channel < 4; channel++)
                        if (uploaded[actual + channel] != original[expected + channel])
                            throw new Exception($"{(openGL ? "GL" : "D3D")} {(wrist ? "wrist" : "HMD")} pixel mismatch at {x},{y}");
                }
        }
    }

    private static int Sample(byte[] pixels, VRTextureBounds_t bounds, int x, int y, int width, int height, bool openGL)
    {
        // Pixel centers; GL textures have a lower-left origin, D3D an upper-left
        // origin. This sampler is independent of the row-flipping implementation.
        var u = bounds.uMin + (x + 0.5) / width * (bounds.uMax - bounds.uMin);
        var v = openGL ? bounds.vMax - (y + 0.5) / height * (bounds.vMax - bounds.vMin)
            : bounds.vMin + (y + 0.5) / height * (bounds.vMax - bounds.vMin);
        var tx = Math.Clamp((int)(u * 1024), 0, 1023);
        var ty = Math.Clamp((int)(v * 1536), 0, 1535);
        return (ty * 1024 + tx) * 4;
    }
}
