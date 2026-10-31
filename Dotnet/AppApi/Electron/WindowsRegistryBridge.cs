using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace VRCX
{
    // Native Windows PlayerPrefs support for the Electron .NET bridge.
    // On Linux the existing Wine registry implementation is still used.
    [SupportedOSPlatform("windows")]
    internal static class WindowsRegistryBridge
    {
        private const string KeyPath = @"SOFTWARE\VRChat\VRChat";

        [DllImport("advapi32.dll", EntryPoint = "RegSetValueExW", CharSet = CharSet.Unicode)]
        private static extern int RegSetValueEx(SafeRegistryHandle key, string name, uint reserved, uint type, byte[] data, uint size);

        private static string HashedName(string name)
        {
            uint hash = 5381;
            foreach (var character in name)
                hash = unchecked((hash * 33) ^ character);
            return name + "_h" + hash;
        }

        public static bool Exists()
        {
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath);
            return key != null;
        }

        public static void Create()
        {
            using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        }

        public static void Delete()
        {
            Registry.CurrentUser.DeleteSubKeyTree(KeyPath, false);
        }

        public static object Get(string name)
        {
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath);
            return Get(key, name);
        }

        internal static object Get(RegistryKey key, string name)
        {
            var fullName = HashedName(name);
            var value = key?.GetValue(fullName);
            if (value == null)
                return null;

            return key.GetValueKind(fullName) switch
            {
                RegistryValueKind.Binary => Encoding.ASCII.GetString((byte[])value).TrimEnd('\0'),
                RegistryValueKind.DWord when value is long bits => BitConverter.Int64BitsToDouble(bits),
                RegistryValueKind.QWord => BitConverter.Int64BitsToDouble(Convert.ToInt64(value)),
                _ => value
            };
        }

        public static bool Set(string name, object value, int kindInt)
        {
            using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
            return Set(key, name, value, kindInt);
        }

        internal static bool Set(RegistryKey key, string name, object value, int kindInt)
        {
            if (key == null)
                return false;

            if (kindInt == 100)
            {
                var number = value is JsonElement json ? json.GetDouble() : Convert.ToDouble(value, CultureInfo.InvariantCulture);
                var bytes = BitConverter.GetBytes(number);
                // Unity stores doubles as an oversized REG_DWORD, not REG_QWORD.
                // RegistryKey.SetValue enforces the ordinary four-byte DWORD
                // size, so preserve Unity's eight-byte payload with the Win32 API.
                var error = RegSetValueEx(key.Handle, HashedName(name), 0, (uint)RegistryValueKind.DWord, bytes, (uint)bytes.Length);
                if (error != 0) throw new Win32Exception(error);
                return true;
            }

            var kind = (RegistryValueKind)kindInt;

            object converted = value;
            if (value is JsonElement element)
            {
                converted = element.ValueKind switch
                {
                    JsonValueKind.String => element.GetString(),
                    JsonValueKind.Number when kind == RegistryValueKind.QWord => element.GetInt64(),
                    JsonValueKind.Number => element.GetInt32(),
                    JsonValueKind.Array => element.EnumerateArray().Select(item => (byte)item.GetInt32()).ToArray(),
                    _ => null
                };
            }

            if (kind == RegistryValueKind.Binary)
            {
                converted = converted is byte[] bytes ? bytes : Encoding.ASCII.GetBytes(converted?.ToString() ?? "");
            }
            else if (kind == RegistryValueKind.DWord)
            {
                converted = Convert.ToInt32(converted);
            }
            else if (kind == RegistryValueKind.QWord)
            {
                converted = Convert.ToInt64(converted);
            }
            else
            {
                return false;
            }

            key.SetValue(HashedName(name), converted, kind);
            return true;
        }

        public static void SetBytes(string name, byte[] value)
        {
            using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
            key?.SetValue(HashedName(name), value, RegistryValueKind.Binary);
        }

        public static Dictionary<string, Dictionary<string, object>> GetAll()
        {
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath);
            return GetAll(key);
        }

        internal static Dictionary<string, Dictionary<string, object>> GetAll(RegistryKey key)
        {
            var output = new Dictionary<string, Dictionary<string, object>>();
            if (key == null)
                return output;

            foreach (var fullName in key.GetValueNames())
            {
                var suffix = fullName.LastIndexOf("_h", StringComparison.Ordinal);
                if (suffix <= 0)
                    continue;

                var kind = key.GetValueKind(fullName);
                var value = key.GetValue(fullName);
                if (value == null)
                    continue;

                object data;
                int type;
                switch (kind)
                {
                    case RegistryValueKind.Binary:
                        data = Encoding.ASCII.GetString((byte[])value).TrimEnd('\0');
                        type = (int)RegistryValueKind.Binary;
                        break;
                    case RegistryValueKind.DWord:
                        if (value is long floatBits)
                        {
                            data = BitConverter.Int64BitsToDouble(floatBits);
                            type = 100;
                        }
                        else
                        {
                            data = Convert.ToInt32(value);
                            type = (int)RegistryValueKind.DWord;
                        }
                        break;
                    case RegistryValueKind.QWord:
                        data = BitConverter.Int64BitsToDouble(Convert.ToInt64(value));
                        type = 100;
                        break;
                    default:
                        continue;
                }

                output[fullName.Substring(0, suffix)] = new Dictionary<string, object>
                {
                    { "data", data },
                    { "type", type }
                };
            }

            return output;
        }

        public static string GetJson()
        {
            return JsonSerializer.Serialize(GetAll());
        }

        public static void Restore(string json)
        {
            using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
            Restore(key, json);
        }

        internal static void Restore(RegistryKey key, string json)
        {
            var entries = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(json);
            if (entries == null)
                return;

            foreach (var (name, entry) in entries)
            {
                if (!entry.TryGetValue("type", out var typeElement) ||
                    !entry.TryGetValue("data", out var value))
                    continue;

                var type = typeElement.GetInt32();
                if (type == 100)
                {
                    Set(key, name, value.GetDouble(), 100);
                }
                else
                {
                    Set(key, name, value, type);
                }
            }
        }
    }
}
