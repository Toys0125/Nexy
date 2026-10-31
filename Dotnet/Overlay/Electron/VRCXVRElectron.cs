using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using NLog;
using Valve.VR;

namespace VRCX
{
    public class VRCXVRElectron : VRCXVRInterface
    {
        public static VRCXVRInterface Instance;
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        private static readonly float[] _rotation = { 0f, 0f, 0f };
        private static readonly float[] _translation = { 0f, 0f, 0f };
        private static readonly float[] _translationLeft = { -7f / 100f, -5f / 100f, 6f / 100f };
        private static readonly float[] _translationRight = { 7f / 100f, -5f / 100f, 6f / 100f };
        private static readonly float[] _rotationLeft = { 90f * (float)(Math.PI / 180f), 90f * (float)(Math.PI / 180f), -90f * (float)(Math.PI / 180f) };
        private static readonly float[] _rotationRight = { -90f * (float)(Math.PI / 180f), -90f * (float)(Math.PI / 180f), -90f * (float)(Math.PI / 180f) };
        private readonly List<string[]> _deviceList;
        private readonly ReaderWriterLockSlim _deviceListLock;
        private volatile bool _active;
        private bool _menuButton;
        private int _overlayHand;
        private IOverlayTextureWriter _overlayTextureWriter;
        private volatile Thread _thread;
        private DateTime _nextOverlayUpdate;

        private ulong _hmdOverlayHandle;
        private bool _hmdOverlayActive;

        private ulong _wristOverlayHandle;
        private bool _wristOverlayActive;

        private const int WRIST_FRAME_WIDTH = 512;
        private const int WRIST_FRAME_HEIGHT = 512;
        private const int HMD_FRAME_HEIGHT = 1024;

        private const int SHARED_FRAME_SIZE = SHARED_FRAME_WIDTH * SHARED_FRAME_HEIGHT * 4;
        private const int SHARED_FRAME_WIDTH = 1024;
        private const int SHARED_FRAME_HEIGHT = WRIST_FRAME_HEIGHT + HMD_FRAME_HEIGHT;
        private byte[] frameBuffer = new byte[SHARED_FRAME_SIZE];

        private readonly ConcurrentQueue<KeyValuePair<string, string>> _overlayFunctionQueue = new ConcurrentQueue<KeyValuePair<string, string>>();
        private readonly ConcurrentQueue<string> _inputQueue = new();
        private bool _hasTexture;
        private bool _frameBufferValid;
        private bool _openVrInitialized;

        static VRCXVRElectron()
        {
            Instance = new VRCXVRElectron();
        }

        public VRCXVRElectron()
        {
            _deviceListLock = new ReaderWriterLockSlim();
            _deviceList = new List<string[]>();
            _thread = new Thread(ThreadLoop)
            {
                IsBackground = true
            };
        }

        // NOTE
        // 메모리 릭 때문에 미리 생성해놓고 계속 사용함
        public override void Init()
        {
            if (OperatingSystem.IsWindows() || OperatingSystem.IsLinux())
                _thread.Start();
        }

        public override void Exit()
        {
            var thread = _thread;
            _thread = null;
            if (thread != null && thread.IsAlive)
            {
                thread.Interrupt();
                thread.Join();
            }

        }

        public override void Restart()
        {
            Exit();
            Instance = new VRCXVRElectron();
            Instance.Init();
            Program.VRCXVRInstance = Instance;

        }

        private void SetupTextures()
        {
            if (OperatingSystem.IsWindows())
            {
                var adapterIndex = 0;
                OpenVR.System.GetDXGIOutputInfo(ref adapterIndex);
                _overlayTextureWriter = new D3DTextureWriter(SHARED_FRAME_WIDTH, SHARED_FRAME_HEIGHT, adapterIndex);
                return;
            }
            bool contextInitialised = false;

            // Check if we're running on Wayland
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WAYLAND_DISPLAY")) ||
                Environment.GetEnvironmentVariable("XDG_SESSION_TYPE")?.ToLower() == "wayland")
            {
                contextInitialised = GLContextWayland.Initialise();
            }
            else
            {
                contextInitialised = GLContextX11.Initialise();
            }

            if (!contextInitialised)
            {
                contextInitialised = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WAYLAND_DISPLAY")) ?
                    GLContextX11.Initialise() : GLContextWayland.Initialise();
            }

            if (!contextInitialised)
            {
                throw new Exception("Failed to initialise OpenGL context");
            }

            _overlayTextureWriter = new GLTextureWriter(SHARED_FRAME_WIDTH, SHARED_FRAME_HEIGHT);
            _overlayTextureWriter.UpdateTexture();
        }

        public byte[] GetLatestOverlayFrame()
        {
            return OverlayFrames.Take(frameBuffer) ? frameBuffer : null;
        }

        private static void FlipImageVertically(ref byte[] imageData, int width, int height)
        {
            int stride = width * 4; // 4 bytes per pixel (RGBA)
            byte[] tempRow = new byte[stride];

            for (int y = 0; y < height / 2; y++)
            {
                int topIndex = y * stride;
                int bottomIndex = (height - 1 - y) * stride;

                // Swap rows
                Buffer.BlockCopy(imageData, topIndex, tempRow, 0, stride);
                Buffer.BlockCopy(imageData, bottomIndex, imageData, topIndex, stride);
                Buffer.BlockCopy(tempRow, 0, imageData, bottomIndex, stride);
            }
        }

        private void ThreadLoop()
        {
            var e = new VREvent_t();
            var nextInit = DateTime.MinValue;
            var nextDeviceUpdate = DateTime.MinValue;
            _nextOverlayUpdate = DateTime.MinValue;
            var overlayIndex = OpenVR.k_unTrackedDeviceIndexInvalid;
            var overlayVisible1 = false;
            var overlayVisible2 = false;

            while (_thread != null)
            {
                try
                {
                    Thread.Sleep(_active ? 10 : 32);
                    if (_thread == null) break;
                    if (!_active)
                    {
                        if (_openVrInitialized) ResetCompositor();
                        continue;
                    }

                    var system = _openVrInitialized ? OpenVR.System : null;
                    if (system == null)
                    {
                        if (DateTime.UtcNow <= nextInit) continue;
                        var _err = EVRInitError.None;
                        system = OpenVR.Init(ref _err, EVRApplicationType.VRApplication_Background);
                        nextInit = DateTime.UtcNow.AddSeconds(5);
                        if (system == null) continue;
                        _openVrInitialized = true;
                    }

                    while (system.PollNextEvent(ref e, (uint)Marshal.SizeOf(e)))
                    {
                        if ((EVREventType)e.eventType == EVREventType.VREvent_Quit)
                        {
                            ResetCompositor();
                            nextInit = DateTime.UtcNow.AddSeconds(10);
                            system = null;
                            break;
                        }
                    }

                    if (system == null) continue;
                    if (DateTime.UtcNow >= nextDeviceUpdate)
                    {
                        overlayIndex = OpenVR.k_unTrackedDeviceIndexInvalid;
                        UpdateDevices(system, ref overlayIndex);
                        if (overlayIndex != OpenVR.k_unTrackedDeviceIndexInvalid)
                            _nextOverlayUpdate = DateTime.UtcNow.AddSeconds(10);
                        nextDeviceUpdate = DateTime.UtcNow.AddSeconds(0.1);
                    }

                    var overlay = OpenVR.Overlay;
                    if (overlay == null) continue;
                    if (!_wristOverlayActive) DestroyOverlay(overlay, ref _wristOverlayHandle);
                    if (!_hmdOverlayActive) DestroyOverlay(overlay, ref _hmdOverlayHandle);
                    if (!_wristOverlayActive && !_hmdOverlayActive)
                    {
                        DisposeTextures();
                        continue;
                    }

                    var createdTexture = _overlayTextureWriter == null;
                    if (createdTexture) SetupTextures();
                    var frame = GetLatestOverlayFrame();
                    if (frame != null)
                    {
                        if (OperatingSystem.IsLinux()) FlipImageVertically(ref frame, SHARED_FRAME_WIDTH, SHARED_FRAME_HEIGHT);
                        _frameBufferValid = true;
                    }
                    // SteamVR can restart while Chromium has no new paint damage.
                    // Re-upload the last complete frame when recreating textures.
                    if (frame != null || (createdTexture && _frameBufferValid))
                    {
                        _overlayTextureWriter.WriteImageToBuffer(frameBuffer);
                        _overlayTextureWriter.UpdateTexture();
                        _hasTexture = true;
                    }

                    var dashboardVisible = overlay.IsDashboardVisible();
                    if (_wristOverlayActive)
                    {
                        var err = ProcessOverlay1(overlay, ref _wristOverlayHandle, ref overlayVisible1, dashboardVisible, overlayIndex);
                        if (err != EVROverlayError.None)
                        {
                            DestroyOverlay(overlay, ref _wristOverlayHandle);
                            throw new InvalidOperationException($"Wrist overlay failed: {err}");
                        }
                        PollInput(overlay, _wristOverlayHandle);
                    }
                    if (_hmdOverlayActive)
                    {
                        var err = ProcessOverlay2(overlay, ref _hmdOverlayHandle, ref overlayVisible2, dashboardVisible);
                        if (err != EVROverlayError.None)
                        {
                            DestroyOverlay(overlay, ref _hmdOverlayHandle);
                            throw new InvalidOperationException($"HMD overlay failed: {err}");
                        }
                    }
                }
                catch (ThreadInterruptedException) { }
                catch (Exception ex)
                {
                    logger.Error(ex, "VR compositor failed; retrying in five seconds");
                    ResetCompositor();
                    nextInit = DateTime.UtcNow.AddSeconds(5);
                }
            }

            ResetCompositor();
        }

        private void DisposeTextures()
        {
            _overlayTextureWriter?.Dispose();
            _overlayTextureWriter = null;
            _hasTexture = false;
            if (OperatingSystem.IsLinux())
            {
                GLContextX11.Cleanup();
                GLContextWayland.Cleanup();
            }
        }

        private static void DestroyOverlay(CVROverlay overlay, ref ulong handle)
        {
            if (handle != 0) overlay?.DestroyOverlay(handle);
            handle = 0;
        }

        private void ResetCompositor()
        {
            IsHmdAfk = false;
            if (_openVrInitialized)
            {
                DestroyOverlay(OpenVR.Overlay, ref _wristOverlayHandle);
                DestroyOverlay(OpenVR.Overlay, ref _hmdOverlayHandle);
            }
            DisposeTextures();
            if (_openVrInitialized) OpenVR.Shutdown();
            _openVrInitialized = false;
            _nextOverlayUpdate = DateTime.MinValue;
            if (!_active) _frameBufferValid = false;
            OverlayFrames.Clear();
            _inputQueue.Clear();
            _deviceListLock.EnterWriteLock();
            try { _deviceList.Clear(); }
            finally { _deviceListLock.ExitWriteLock(); }
        }

        public override void SetActive(bool active, bool hmdOverlay, bool wristOverlay, bool menuButton, int overlayHand)
        {
            if (!active) _overlayFunctionQueue.Clear();
            _hmdOverlayActive = hmdOverlay;
            _wristOverlayActive = wristOverlay;
            _menuButton = menuButton;
            _overlayHand = overlayHand;
            _active = active && (OperatingSystem.IsWindows() || OperatingSystem.IsLinux());
        }

        public override bool IsActive()
        {
            return _active;
        }

        public override void Refresh()
        {
            //_wristOverlay.Reload();
            //_hmdOverlay.Reload();
        }

        public override string[][] GetDevices()
        {
            _deviceListLock.EnterReadLock();
            try
            {
                return _deviceList.ToArray();
            }
            finally
            {
                _deviceListLock.ExitReadLock();
            }
        }

        private void UpdateDevices(CVRSystem system, ref uint overlayIndex)
        {
            _deviceListLock.EnterWriteLock();
            try
            {
                _deviceList.Clear();
            }
            finally
            {
                _deviceListLock.ExitWriteLock();
            }

            var sb = new StringBuilder(256);
            var state = new VRControllerState_t();
            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var devClass = system.GetTrackedDeviceClass(i);
                switch (devClass)
                {
                    case ETrackedDeviceClass.HMD:
                        var proximityError = ETrackedPropertyError.TrackedProp_Success;
                        var hasProximitySensor = system.GetBoolTrackedDeviceProperty(i,
                            ETrackedDeviceProperty.Prop_ContainsProximitySensor_Bool, ref proximityError);
                        var success = system.GetControllerState(i, ref state, (uint)Marshal.SizeOf(state));
                        if (hasProximitySensor && success)
                            IsHmdAfk = (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_ProximitySensor)) == 0;
                        else
                        {
                            var activity = system.GetTrackedDeviceActivityLevel(i);
                            IsHmdAfk = activity == EDeviceActivityLevel.k_EDeviceActivityLevel_Standby ||
                                activity == EDeviceActivityLevel.k_EDeviceActivityLevel_Idle_Timeout;
                        }

                        var headsetErr = ETrackedPropertyError.TrackedProp_Success;
                        var headsetBatteryPercentage = system.GetFloatTrackedDeviceProperty(i, ETrackedDeviceProperty.Prop_DeviceBatteryPercentage_Float, ref headsetErr);
                        if (headsetErr != ETrackedPropertyError.TrackedProp_Success)
                        {
                            // Headset has no battery, skip displaying it
                            break;
                        }

                        var headset = new[]
                        {
                            "headset",
                            system.IsTrackedDeviceConnected(i)
                                ? "connected"
                                : "disconnected",
                            // Currently neither VD or SteamLink report charging state
                            "discharging",
                            (headsetBatteryPercentage * 100).ToString(),
                            poses[i].eTrackingResult.ToString()
                        };
                        _deviceListLock.EnterWriteLock();
                        try
                        {
                            _deviceList.Add(headset);
                        }
                        finally
                        {
                            _deviceListLock.ExitWriteLock();
                        }

                        break;
                    case ETrackedDeviceClass.Controller:
                    case ETrackedDeviceClass.GenericTracker:
                    case ETrackedDeviceClass.TrackingReference:
                        {
                            var err = ETrackedPropertyError.TrackedProp_Success;
                            var batteryPercentage = system.GetFloatTrackedDeviceProperty(i, ETrackedDeviceProperty.Prop_DeviceBatteryPercentage_Float, ref err);
                            if (err != ETrackedPropertyError.TrackedProp_Success)
                            {
                                batteryPercentage = 1f;
                            }

                            err = ETrackedPropertyError.TrackedProp_Success;
                            var isCharging = system.GetBoolTrackedDeviceProperty(i, ETrackedDeviceProperty.Prop_DeviceIsCharging_Bool, ref err);
                            if (err != ETrackedPropertyError.TrackedProp_Success)
                            {
                                isCharging = false;
                            }

                            sb.Clear();
                            system.GetStringTrackedDeviceProperty(i, ETrackedDeviceProperty.Prop_TrackingSystemName_String, sb, (uint)sb.Capacity, ref err);
                            var isOculus = sb.ToString().IndexOf("oculus", StringComparison.OrdinalIgnoreCase) >= 0;
                            // Oculus : B/Y, Bit 1, Mask 2
                            // Oculus : A/X, Bit 7, Mask 128
                            // Vive : Menu, Bit 1, Mask 2,
                            // Vive : Grip, Bit 2, Mask 4
                            var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                            if (role == ETrackedControllerRole.LeftHand || role == ETrackedControllerRole.RightHand)
                            {
                                if (_overlayHand == 0 ||
                                    (_overlayHand == 1 && role == ETrackedControllerRole.LeftHand) ||
                                    (_overlayHand == 2 && role == ETrackedControllerRole.RightHand))
                                {
                                    if (system.GetControllerState(i, ref state, (uint)Marshal.SizeOf(state)) &&
                                        (state.ulButtonPressed & (_menuButton ? 2u : isOculus ? 128u : 4u)) != 0)
                                    {
                                        _nextOverlayUpdate = DateTime.MinValue;
                                        if (role == ETrackedControllerRole.LeftHand)
                                        {
                                            Array.Copy(_translationLeft, _translation, 3);
                                            Array.Copy(_rotationLeft, _rotation, 3);
                                        }
                                        else
                                        {
                                            Array.Copy(_translationRight, _translation, 3);
                                            Array.Copy(_rotationRight, _rotation, 3);
                                        }

                                        overlayIndex = i;
                                    }
                                }
                            }

                            var type = string.Empty;
                            if (devClass == ETrackedDeviceClass.Controller)
                            {
                                if (role == ETrackedControllerRole.LeftHand)
                                {
                                    type = "leftController";
                                }
                                else if (role == ETrackedControllerRole.RightHand)
                                {
                                    type = "rightController";
                                }
                                else
                                {
                                    type = "controller";
                                }
                            }
                            else if (devClass == ETrackedDeviceClass.GenericTracker)
                            {
                                type = "tracker";
                            }
                            else if (devClass == ETrackedDeviceClass.TrackingReference)
                            {
                                type = "base";
                            }

                            var item = new[]
                            {
                            type,
                            system.IsTrackedDeviceConnected(i)
                                ? "connected"
                                : "disconnected",
                            isCharging
                                ? "charging"
                                : "discharging",
                            (batteryPercentage * 100).ToString(),
                            poses[i].eTrackingResult.ToString()
                        };
                            _deviceListLock.EnterWriteLock();
                            try
                            {
                                _deviceList.Add(item);
                            }
                            finally
                            {
                                _deviceListLock.ExitWriteLock();
                            }

                            break;
                        }
                }
            }
        }

        internal EVROverlayError ProcessDashboard(CVROverlay overlay, ref ulong dashboardHandle, bool dashboardVisible)
        {
            var err = EVROverlayError.None;

            if (dashboardHandle == 0)
            {
                err = overlay.FindOverlay("Nexy", ref dashboardHandle);
                if (err != EVROverlayError.None)
                {
                    if (err != EVROverlayError.UnknownOverlay)
                    {
                        return err;
                    }

                    ulong thumbnailHandle = 0;
                    err = overlay.CreateDashboardOverlay("Nexy", "Nexy", ref dashboardHandle, ref thumbnailHandle);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    var iconPath = Path.Join(Program.BaseDirectory, "Nexy.png");
                    err = overlay.SetOverlayFromFile(thumbnailHandle, iconPath);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayWidthInMeters(dashboardHandle, 1.5f);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayInputMethod(dashboardHandle, VROverlayInputMethod.Mouse);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }
                }
            }

            if (dashboardVisible)
            {
                //var texture = new Texture_t
                //{
                //    handle = _texture1.NativePointer
                //};
                //err = overlay.SetOverlayTexture(dashboardHandle, ref texture);
                //if (err != EVROverlayError.None)
                //{
                //    return err;
                //}
            }

            return err;
        }

        internal EVROverlayError ProcessOverlay1(CVROverlay overlay, ref ulong overlayHandle, ref bool overlayVisible, bool dashboardVisible, uint overlayIndex)
        {
            var err = EVROverlayError.None;

            if (overlayHandle == 0)
            {
                err = overlay.FindOverlay("app.nexy.wrist", ref overlayHandle);
                if (err != EVROverlayError.None)
                {
                    if (err != EVROverlayError.UnknownOverlay)
                    {
                        return err;
                    }

                    overlayVisible = false;
                    err = overlay.CreateOverlay("app.nexy.wrist", "Nexy Wrist", ref overlayHandle);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayAlpha(overlayHandle, 0.9f);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayWidthInMeters(overlayHandle, 1f);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayInputMethod(overlayHandle, VROverlayInputMethod.Mouse);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    var mouseScale = new HmdVector2_t { v0 = WRIST_FRAME_WIDTH, v1 = WRIST_FRAME_HEIGHT };
                    err = overlay.SetOverlayMouseScale(overlayHandle, ref mouseScale);
                    if (err != EVROverlayError.None) return err;
                    overlay.SetOverlayFlag(overlayHandle, VROverlayFlags.SendVRDiscreteScrollEvents, true);
                }
            }

            if (overlayIndex != OpenVR.k_unTrackedDeviceIndexInvalid)
            {
                // http://www.opengl-tutorial.org/beginners-tutorials/tutorial-3-matrices
                // Scaling-Rotation-Translation
                var m = Matrix4x4.CreateScale(0.25f);
                m *= Matrix4x4.CreateRotationX(_rotation[0]);
                m *= Matrix4x4.CreateRotationY(_rotation[1]);
                m *= Matrix4x4.CreateRotationZ(_rotation[2]);
                m *= Matrix4x4.CreateTranslation(new Vector3(_translation[0], _translation[1], _translation[2]));
                var hm34 = new HmdMatrix34_t
                {
                    m0 = m.M11,
                    m1 = m.M21,
                    m2 = m.M31,
                    m3 = m.M41,
                    m4 = m.M12,
                    m5 = m.M22,
                    m6 = m.M32,
                    m7 = m.M42,
                    m8 = m.M13,
                    m9 = m.M23,
                    m10 = m.M33,
                    m11 = m.M43
                };
                err = overlay.SetOverlayTransformTrackedDeviceRelative(overlayHandle, overlayIndex, ref hm34);
                if (err != EVROverlayError.None)
                {
                    return err;
                }
            }

            if (!dashboardVisible &&
                DateTime.UtcNow.CompareTo(_nextOverlayUpdate) <= 0)
            {
                return ShowTexture(overlay, overlayHandle, true, ref overlayVisible);
            }
            else if (overlayVisible)
            {
                err = overlay.HideOverlay(overlayHandle);
                if (err != EVROverlayError.None)
                {
                    return err;
                }

                overlayVisible = false;
            }

            return err;
        }

        internal EVROverlayError ProcessOverlay2(CVROverlay overlay, ref ulong overlayHandle, ref bool overlayVisible, bool dashboardVisible)
        {
            var err = EVROverlayError.None;

            if (overlayHandle == 0)
            {
                err = overlay.FindOverlay("app.nexy.hmd", ref overlayHandle);
                if (err != EVROverlayError.None)
                {
                    if (err != EVROverlayError.UnknownOverlay)
                    {
                        return err;
                    }

                    overlayVisible = false;
                    err = overlay.CreateOverlay("app.nexy.hmd", "Nexy Notifications", ref overlayHandle);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayAlpha(overlayHandle, 0.9f);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayWidthInMeters(overlayHandle, 1f);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    err = overlay.SetOverlayInputMethod(overlayHandle, VROverlayInputMethod.None);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                    var m = Matrix4x4.CreateScale(1f);
                    m *= Matrix4x4.CreateTranslation(0, -0.3f, -1.5f);
                    var hm34 = new HmdMatrix34_t
                    {
                        m0 = m.M11,
                        m1 = m.M21,
                        m2 = m.M31,
                        m3 = m.M41,
                        m4 = m.M12,
                        m5 = m.M22,
                        m6 = m.M32,
                        m7 = m.M42,
                        m8 = m.M13,
                        m9 = m.M23,
                        m10 = m.M33,
                        m11 = m.M43
                    };
                    err = overlay.SetOverlayTransformTrackedDeviceRelative(overlayHandle, OpenVR.k_unTrackedDeviceIndex_Hmd, ref hm34);
                    if (err != EVROverlayError.None)
                    {
                        return err;
                    }

                }
            }

            if (!dashboardVisible)
            {
                return ShowTexture(overlay, overlayHandle, false, ref overlayVisible);
            }
            else if (overlayVisible)
            {
                err = overlay.HideOverlay(overlayHandle);
                if (err != EVROverlayError.None)
                {
                    return err;
                }

                overlayVisible = false;
            }

            return err;
        }

        private EVROverlayError ShowTexture(CVROverlay overlay, ulong handle, bool wrist, ref bool visible)
        {
            if (!_hasTexture) return EVROverlayError.None;
            var top = wrist ? 0f : (float)WRIST_FRAME_HEIGHT / SHARED_FRAME_HEIGHT;
            var bottom = wrist ? (float)WRIST_FRAME_HEIGHT / SHARED_FRAME_HEIGHT : 1f;
            var bounds = new VRTextureBounds_t
            {
                uMin = 0f,
                uMax = wrist ? 0.5f : 1f,
                vMin = OperatingSystem.IsWindows() ? top : 1f - bottom,
                vMax = OperatingSystem.IsWindows() ? bottom : 1f - top
            };
            var err = overlay.SetOverlayTextureBounds(handle, ref bounds);
            if (err != EVROverlayError.None) return err;
            var texture = _overlayTextureWriter.AsTextureT();
            err = overlay.SetOverlayTexture(handle, ref texture);
            if (err != EVROverlayError.None || visible) return err;
            err = overlay.ShowOverlay(handle);
            if (err == EVROverlayError.None) visible = true;
            return err;
        }

        public override ConcurrentQueue<KeyValuePair<string, string>> GetExecuteVrOverlayFunctionQueue()
        {
            return _overlayFunctionQueue;
        }

        public override void ExecuteVrOverlayFunction(string function, string json)
        {
            // State is resent when the renderer is ready. Transient notifications
            // received while overlays are disabled must not replay on next start.
            if (!_active && (function == "playNoty" || function == "addEntryHudFeed")) return;
            while (_overlayFunctionQueue.Count >= 512) _overlayFunctionQueue.TryDequeue(out _);
            _overlayFunctionQueue.Enqueue(new KeyValuePair<string, string>(function, json));
        }

        private void PollInput(CVROverlay overlay, ulong handle)
        {
            var input = new VREvent_t();
            while (overlay.PollNextOverlayEvent(handle, ref input, (uint)Marshal.SizeOf(input)))
            {
                var type = (EVREventType)input.eventType;
                object message;
                if (type == EVREventType.VREvent_MouseMove || type == EVREventType.VREvent_MouseButtonDown || type == EVREventType.VREvent_MouseButtonUp)
                {
                    var mouse = input.data.mouse;
                    message = new
                    {
                        type = type == EVREventType.VREvent_MouseMove ? "mouseMove" : type == EVREventType.VREvent_MouseButtonDown ? "mouseDown" : "mouseUp",
                        x = (int)Math.Clamp(mouse.x, 0, WRIST_FRAME_WIDTH - 1),
                        y = (int)Math.Clamp(WRIST_FRAME_HEIGHT - mouse.y, 0, WRIST_FRAME_HEIGHT - 1),
                        button = mouse.button == 2 ? "right" : mouse.button == 4 ? "middle" : "left",
                        clickCount = 1
                    };
                }
                else if (type == EVREventType.VREvent_ScrollDiscrete || type == EVREventType.VREvent_ScrollSmooth)
                {
                    message = new { type = "mouseWheel", deltaX = input.data.scroll.xdelta * 120, deltaY = input.data.scroll.ydelta * 120 };
                }
                else continue;
                while (_inputQueue.Count >= 128) _inputQueue.TryDequeue(out _);
                _inputQueue.Enqueue(JsonConvert.SerializeObject(message));
            }
        }

        public string[] GetOverlayInputEvents()
        {
            var events = new List<string>();
            while (_inputQueue.TryDequeue(out var input)) events.Add(input);
            return events.ToArray();
        }
    }
}
