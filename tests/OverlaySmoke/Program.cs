using System;
using System.Threading;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Valve.VR;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using VRCX;
using static Vortice.Direct3D11.D3D11;

if (args.Length > 0 && args[0] == "--helper")
{
    Thread.Sleep(Timeout.Infinite);
    return;
}

OverlayRegionTests.Run();
NexvrLaunchTests.Run();
GameLaunchTests.Run();

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var frame = new byte[OverlayFrames.Size];
var destination = new byte[OverlayFrames.Size];
Check(!OverlayFrames.Take(destination), "An empty queue returned a frame");
Array.Fill(frame, (byte)42);
OverlayFrames.Submit(frame);
Array.Fill(frame, (byte)43);
OverlayFrames.Submit(frame);
Check(OverlayFrames.Take(destination) && destination[0] == 43 && destination[^1] == 43, "Latest frame was not preserved");
Check(!OverlayFrames.Take(destination), "A frame was consumed twice");
try { OverlayFrames.Submit(new byte[4]); throw new Exception("Invalid frame accepted"); }
catch (ArgumentException) { }
using var firstFrameReady = new ManualResetEventSlim();
using var firstFrameRead = new ManualResetEventSlim();
var comparedFrames = 0;
byte lastComparedValue = byte.MaxValue;
void CompareFrame()
{
    var value = destination[0];
    foreach (var pixel in destination) Check(pixel == value, "Frame was torn across threads");
    comparedFrames++;
    lastComparedValue = value;
}
var producer = Task.Run(() =>
{
    for (var i = 0; i < 50; i++)
    {
        Array.Fill(frame, (byte)i);
        OverlayFrames.Submit(frame);
        if (i == 0)
        {
            firstFrameReady.Set();
            Check(firstFrameRead.Wait(TimeSpan.FromSeconds(10)), "Consumer never compared the first frame");
        }
    }
});
try
{
    Check(firstFrameReady.Wait(TimeSpan.FromSeconds(10)), "Producer never submitted its first frame");
    Check(OverlayFrames.Take(destination), "The first produced frame was not available");
    CompareFrame();
    Check(lastComparedValue == 0, "The first produced frame was not copied");
}
finally { firstFrameRead.Set(); }
while (!producer.IsCompleted)
{
    if (OverlayFrames.Take(destination)) CompareFrame();
}
producer.GetAwaiter().GetResult();
// Drain the last pending frame even if the producer completed before the loop.
if (OverlayFrames.Take(destination)) CompareFrame();
Check(comparedFrames >= 2 && lastComparedValue == 49, "Concurrency check did not compare the first and final frames");
OverlayFrames.Clear();
Check(!OverlayFrames.Take(destination), "Reset left a stale frame");
Console.WriteLine($"Overlay frame size, latest-frame delivery, and concurrency checks passed ({comparedFrames} full frames compared)");

if (OperatingSystem.IsWindows())
{
    RegistryBridgeTests.Run();
    using var writer = new D3DTextureWriter(8, 8, 0);
    var pixels = new byte[8 * 8 * 4];
    for (var i = 0; i < pixels.Length; i++) pixels[i] = (byte)i;
    writer.WriteImageToBuffer(pixels);
    writer.UpdateTexture();
    var native = writer.AsTextureT();
    Check(native.eType == ETextureType.DirectX && native.handle != IntPtr.Zero, "Invalid OpenVR D3D texture");
    using var texture = new ID3D11Texture2D(native.handle);
    texture.AddRef();
    using var resource = texture.QueryInterface<IDXGIResource>();
    var handle = resource.SharedHandle;
    Check(handle != IntPtr.Zero, "D3D texture is not shareable");
    using var factory = Vortice.DXGI.DXGI.CreateDXGIFactory1<IDXGIFactory1>();
    factory.EnumAdapters1(0, out var adapter).CheckError();
    using var adapterLifetime = adapter;
    D3D11CreateDevice(adapter, DriverType.Unknown, DeviceCreationFlags.BgraSupport,
        new[] { FeatureLevel.Level_11_0 }, out ID3D11Device device, out ID3D11DeviceContext context).CheckError();
    using (device)
    using (context)
    using (var shared = device.OpenSharedResource<ID3D11Texture2D>(handle))
    {
        var description = shared.Description;
        description.Usage = ResourceUsage.Staging;
        description.BindFlags = BindFlags.None;
        description.MiscFlags = ResourceOptionFlags.None;
        description.CPUAccessFlags = CpuAccessFlags.Read;
        using var staging = device.CreateTexture2D(description);
        context.CopyResource(staging, shared);
        var mapped = context.Map(staging, 0, MapMode.Read, Vortice.Direct3D11.MapFlags.None);
        try
        {
            var row = new byte[32];
            for (var y = 0; y < 8; y++)
            {
                Marshal.Copy(mapped.DataPointer + y * (int)mapped.RowPitch, row, 0, row.Length);
                for (var x = 0; x < row.Length; x++) Check(row[x] == pixels[y * 32 + x], "GPU BGRA round trip failed");
            }
        }
        finally { context.Unmap(staging, 0); }
    }
    Console.WriteLine("Shared D3D11 texture opened on a second device; BGRA pixels verified by GPU readback");
}

NativeLifecycleTests.Run();
