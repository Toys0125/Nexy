using System;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace VRCX;

internal static class NexvrLaunch
{
    /// <summary>Use the installed NexVR protocol handler without assuming a Steam application ID.</summary>
    internal static ProcessStartInfo ForInstance(string instanceId)
    {
        if (string.IsNullOrEmpty(instanceId) || !Regex.IsMatch(instanceId, @"\A[A-Za-z0-9_-]+\z")) return null;
        return new ProcessStartInfo($"nexvr://instances/{instanceId}/join") { UseShellExecute = true };
    }

    /// <summary>Accept only NexVR instance links; unsupported command-line options must fail explicitly.</summary>
    internal static ProcessStartInfo FromUrl(string url)
    {
        const string prefix = "nexvr://instances/";
        const string suffix = "/join";
        if (url == null || !url.StartsWith(prefix, StringComparison.Ordinal) || !url.EndsWith(suffix, StringComparison.Ordinal))
            return null;
        var length = url.Length - prefix.Length - suffix.Length;
        return length > 0 ? ForInstance(url.Substring(prefix.Length, length)) : null;
    }
}
