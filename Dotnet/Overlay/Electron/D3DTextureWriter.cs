using System;
using System.Runtime.InteropServices;
using Valve.VR;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using static Vortice.Direct3D11.D3D11;
using static Vortice.DXGI.DXGI;

namespace VRCX;

/// <summary>Owns a shareable D3D11 texture on the adapter used by SteamVR.</summary>
internal sealed class D3DTextureWriter : IOverlayTextureWriter
{
    private readonly ID3D11Device _device;
    private readonly ID3D11DeviceContext _context;
    private readonly ID3D11Texture2D _texture;
    private readonly int _width;
    private readonly int _size;

    public D3DTextureWriter(int width, int height, int adapterIndex)
    {
        _width = width;
        _size = checked(width * height * 4);
        using var factory = CreateDXGIFactory1<IDXGIFactory1>();
        factory.EnumAdapters1((uint)adapterIndex, out var adapter).CheckError();
        using (adapter)
        {
            D3D11CreateDevice(adapter, DriverType.Unknown, DeviceCreationFlags.BgraSupport,
                new[] { FeatureLevel.Level_11_0 }, out _device, out _context).CheckError();
        }
        try
        {
            _texture = _device.CreateTexture2D(new Texture2DDescription
            {
                Width = (uint)width,
                Height = (uint)height,
                MipLevels = 1,
                ArraySize = 1,
                Format = Format.B8G8R8A8_UNorm,
                SampleDescription = new SampleDescription(1, 0),
                Usage = ResourceUsage.Default,
                BindFlags = BindFlags.ShaderResource | BindFlags.RenderTarget,
                MiscFlags = ResourceOptionFlags.Shared
            });
        }
        catch
        {
            _context.Dispose();
            _device.Dispose();
            throw;
        }
    }

    public void WriteImageToBuffer(byte[] data)
    {
        if (data.Length != _size) throw new ArgumentException("Invalid overlay frame size", nameof(data));
        var pinned = GCHandle.Alloc(data, GCHandleType.Pinned);
        try
        {
            _context.UpdateSubresource(_texture, 0, null, pinned.AddrOfPinnedObject(), (uint)(_width * 4), 0);
        }
        finally
        {
            pinned.Free();
        }
    }

    public void UpdateTexture() => _context.Flush();

    public Texture_t AsTextureT() => new()
    {
        handle = _texture.NativePointer,
        eType = ETextureType.DirectX,
        eColorSpace = EColorSpace.Auto
    };

    public void Dispose()
    {
        _context.ClearState();
        _context.Flush();
        _texture.Dispose();
        _context.Dispose();
        _device.Dispose();
    }
}
