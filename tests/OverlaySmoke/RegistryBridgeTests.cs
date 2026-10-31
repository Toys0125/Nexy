using System;
using System.ComponentModel;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;
using VRCX;

internal static class RegistryBridgeTests
{
    [DllImport("advapi32.dll", EntryPoint = "RegSetValueExW", CharSet = CharSet.Unicode)]
    private static extern int WriteValue(SafeRegistryHandle key, string name, uint reserved, uint type, byte[] data, uint size);
    [DllImport("advapi32.dll", EntryPoint = "RegQueryValueExW", CharSet = CharSet.Unicode)]
    private static extern int QueryValue(SafeRegistryHandle key, string name, IntPtr reserved, out uint type, byte[] data, ref uint size);

    [SupportedOSPlatform("windows")]
    internal static void Run()
    {
        // Never touch the user's VRChat/NexVR PlayerPrefs while testing restore.
        var path = @"Software\Nexy\Tests\Registry-" + Guid.NewGuid().ToString("N");
        try
        {
            using var source = Registry.CurrentUser.CreateSubKey(path + @"\Source");
            using var destination = Registry.CurrentUser.CreateSubKey(path + @"\Destination");
            WindowsRegistryBridge.Set(source, "Integer", int.MinValue, 4);
            WindowsRegistryBridge.Set(source, "InjectedFloat", 0, 4);
            var injectedBytes = BitConverter.GetBytes(-1234.125);
            var result = WriteValue(source.Handle, FullName(source, "InjectedFloat"), 0, 4, injectedBytes, 8);
            if (result != 0) throw new Win32Exception(result);
            Check(source.GetValue(FullName(source, "InjectedFloat")) is long, "Runtime did not expose an 8-byte DWORD as Int64");
            Check((double)WindowsRegistryBridge.Get(source, "InjectedFloat") == -1234.125, "Single-value read lost Unity float bits");

            var values = new[] { 1.25, -123.5, double.Epsilon, -0.0, double.MaxValue };
            for (var i = 0; i < values.Length; i++)
            {
                var name = "Float" + i;
                Check(WindowsRegistryBridge.Set(source, name, values[i], 100), "Setting type 100 failed");
                AssertRawFloat(source, name, values[i]);
            }
            // Old bridge versions wrote QWORD floats. Read those backups too,
            // but restore them using Unity's canonical DWORD/8-byte encoding.
            WindowsRegistryBridge.Set(source, "LegacyQword", BitConverter.DoubleToInt64Bits(3.75), 11);
            var snapshot = WindowsRegistryBridge.GetAll(source);
            Check((int)snapshot["Integer"]["type"] == 4 && (int)snapshot["Integer"]["data"] == int.MinValue,
                "Ordinary signed DWORD was changed");
            Check((int)snapshot["InjectedFloat"]["type"] == 100 && (double)snapshot["InjectedFloat"]["data"] == -1234.125,
                "Export overflowed or changed an oversized DWORD");
            WindowsRegistryBridge.Restore(destination, JsonSerializer.Serialize(snapshot));
            for (var i = 0; i < values.Length; i++) AssertRawFloat(destination, "Float" + i, values[i]);
            AssertRawFloat(destination, "InjectedFloat", -1234.125);
            AssertRawFloat(destination, "LegacyQword", 3.75);
            var integer = ReadRaw(destination, "Integer");
            Check(integer.Type == 4 && integer.Bytes.SequenceEqual(BitConverter.GetBytes(int.MinValue)), "Integer backup changed type or bytes");
            Console.WriteLine("Isolated Windows registry: Unity DWORD/8-byte float reads, JSON backup/restore, and raw types/bytes passed");
        }
        finally { Registry.CurrentUser.DeleteSubKeyTree(path, false); }
    }

    [SupportedOSPlatform("windows")]
    private static void AssertRawFloat(RegistryKey key, string name, double expected)
    {
        var raw = ReadRaw(key, name);
        Check(raw.Type == 4 && raw.Bytes.Length == 8, "Unity float was not stored as an 8-byte REG_DWORD");
        Check(raw.Bytes.SequenceEqual(BitConverter.GetBytes(expected)), "Unity float's exact bit pattern changed");
        Check(BitConverter.DoubleToInt64Bits((double)WindowsRegistryBridge.Get(key, name)) == BitConverter.DoubleToInt64Bits(expected),
            "Single-value float read changed its sign or precision");
    }

    [SupportedOSPlatform("windows")]
    private static (uint Type, byte[] Bytes) ReadRaw(RegistryKey key, string name)
    {
        var bytes = new byte[16];
        uint size = (uint)bytes.Length;
        var result = QueryValue(key.Handle, FullName(key, name), IntPtr.Zero, out var type, bytes, ref size);
        if (result != 0) throw new Win32Exception(result);
        return (type, bytes[..(int)size]);
    }

    [SupportedOSPlatform("windows")]
    private static string FullName(RegistryKey key, string name) => key.GetValueNames().Single(value => value.StartsWith(name + "_h", StringComparison.Ordinal));

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
