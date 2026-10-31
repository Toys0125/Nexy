using System;

namespace VRCX;

/// <summary>One pending BGRA frame; a slow compositor never builds a frame backlog.</summary>
internal static class OverlayFrames
{
    internal const int Width = 1024;
    internal const int Height = 1536;
    internal const int Size = Width * Height * 4;
    private static readonly object Sync = new();
    private static readonly byte[] Pending = new byte[Size];
    private static bool _ready;

    internal static void Submit(ReadOnlySpan<byte> data)
    {
        if (data.Length != Size) throw new ArgumentException("Invalid overlay frame size");
        lock (Sync)
        {
            data.CopyTo(Pending);
            _ready = true;
        }
    }

    internal static bool Take(byte[] destination)
    {
        lock (Sync)
        {
            if (!_ready) return false;
            Pending.CopyTo(destination, 0);
            _ready = false;
            return true;
        }
    }

    internal static void Clear()
    {
        lock (Sync) _ready = false;
    }
}
