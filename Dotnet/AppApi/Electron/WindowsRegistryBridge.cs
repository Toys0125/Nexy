using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

namespace VRCX
{
    // Native Windows PlayerPrefs support for the Electron .NET bridge.
    // On Linux the existing Wine registry implementation is still used.
    internal static class WindowsRegistryBridge
    {
        private const string KeyPath = @"SOFTWARE\VRChat\VRChat";

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
            var fullName = HashedName(name);
            var value = key?.GetValue(fullName);
            if (value == null)
                return null;

            return key.GetValueKind(fullName) switch
            {
                RegistryValueKind.Binary => Encoding.ASCII.GetString((byte[])value).TrimEnd('\0'),
                RegistryValueKind.QWord => BitConverter.Int64BitsToDouble(Convert.ToInt64(value)),
                _ => value
            };
        }

        public static bool Set(string name, object value, int kindInt)
        {
            var kind = (RegistryValueKind)kindInt;
            using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
            if (key == null)
                return false;

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
            var output = new Dictionary<string, Dictionary<string, object>>();
            using var key = Registry.CurrentUser.OpenSubKey(KeyPath);
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
                        data = Convert.ToInt32(value);
                        type = (int)RegistryValueKind.DWord;
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
            var entries = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(json);
            if (entries == null)
                return;

            Create();
            foreach (var (name, entry) in entries)
            {
                if (!entry.TryGetValue("type", out var typeElement) ||
                    !entry.TryGetValue("data", out var value))
                    continue;

                var type = typeElement.GetInt32();
                if (type == 100)
                {
                    Set(name, BitConverter.DoubleToInt64Bits(value.GetDouble()), (int)RegistryValueKind.QWord);
                }
                else
                {
                    Set(name, value, type);
                }
            }
        }
    }
}
