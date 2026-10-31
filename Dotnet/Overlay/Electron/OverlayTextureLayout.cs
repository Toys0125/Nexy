using System;
using Valve.VR;

namespace VRCX;

internal static class OverlayTextureLayout
{
    // Electron's top-down canvas: wrist at (0, 0), HMD at (0, 512).
    internal static VRTextureBounds_t Bounds(bool wrist, bool openGL)
    {
        var top = wrist ? 0f : 512f / OverlayFrames.Height;
        var bottom = wrist ? 512f / OverlayFrames.Height : 1f;
        return new VRTextureBounds_t
        {
            uMin = 0f,
            uMax = wrist ? 0.5f : 1f,
            // A full-frame GL row flip relocates the wrist to the upper third
            // of GL's bottom-up texture. OpenVR's GL top edge is vMax. These
            // intervals select each region; vMin/vMax are not exchanged.
            vMin = openGL ? 1f - bottom : top,
            vMax = openGL ? 1f - top : bottom
        };
    }

    internal static void PrepareFrame(byte[] pixels, bool openGL)
    {
        if (pixels.Length != OverlayFrames.Size) throw new ArgumentException("Invalid overlay frame size");
        if (!openGL) return;
        var stride = OverlayFrames.Width * 4;
        var row = new byte[stride];
        for (var y = 0; y < OverlayFrames.Height / 2; y++)
        {
            var top = y * stride;
            var bottom = (OverlayFrames.Height - 1 - y) * stride;
            Buffer.BlockCopy(pixels, top, row, 0, stride);
            Buffer.BlockCopy(pixels, bottom, pixels, top, stride);
            Buffer.BlockCopy(row, 0, pixels, bottom, stride);
        }
    }
}
