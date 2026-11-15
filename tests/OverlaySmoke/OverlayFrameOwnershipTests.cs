using System;
using System.Buffers;
using VRCX;

internal static class OverlayFrameOwnershipTests
{
    internal static void Run()
    {
        var api = new AppApiVrElectron();
        var compositor = new VRCXVRElectron();
        var pixels = new byte[OverlayFrames.Size];
        Array.Fill(pixels, (byte)73);
        var owner = new FrameMemory(pixels);
        api.SubmitOverlayFrame(owner.Memory);
        if (!owner.Disposed) throw new Exception("Overlay bridge retained the frame owner after copying");
        // Disposing may release or reuse the source, but the pending copy must survive.
        Array.Clear(pixels);
        var destination = compositor.GetLatestOverlayFrame();
        if (destination == null || destination[0] != 73 || destination[^1] != 73)
            throw new Exception("Releasing the frame owner corrupted the pending frame");

        var invalid = new FrameMemory(new byte[4]);
        try
        {
            api.SubmitOverlayFrame(invalid.Memory);
            throw new Exception("Invalid overlay frame accepted");
        }
        catch (ArgumentException) { }
        if (!invalid.Disposed) throw new Exception("Rejected overlay frame retained its owner");

        // Managed callers can still pass ordinary arrays without an owner.
        api.SubmitOverlayFrame(pixels);
        compositor.GetLatestOverlayFrame();
        Console.WriteLine("Overlay frame owners released after successful and rejected submissions");
    }

    private sealed class FrameMemory(byte[] pixels) : MemoryManager<byte>
    {
        internal bool Disposed { get; private set; }
        public override Span<byte> GetSpan() => pixels;
        public override MemoryHandle Pin(int elementIndex = 0) => throw new NotSupportedException();
        public override void Unpin() { }
        protected override void Dispose(bool disposing) => Disposed = true;
    }
}
