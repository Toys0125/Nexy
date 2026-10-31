using System;
using Valve.VR;

namespace VRCX;

internal interface IOverlayTextureWriter : IDisposable
{
    void WriteImageToBuffer(byte[] data);
    void UpdateTexture();
    Texture_t AsTextureT();
}
