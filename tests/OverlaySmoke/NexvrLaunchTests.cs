using System;
using VRCX;

internal static class NexvrLaunchTests
{
    internal static void Run()
    {
        const string instance = "123abc_ABC-456";
        var link = "nexvr://instances/" + instance + "/join";
        foreach (var start in new[] { NexvrLaunch.ForInstance(instance), NexvrLaunch.FromUrl(link) })
            if (start == null || start.FileName != link || !start.UseShellExecute || start.Arguments != "")
                throw new Exception("NexVR did not use its installed protocol handler");

        foreach (var invalid in new[] { "", null, "../escape", "id?other=1", "id\n", "id/join", "id\" --flag", "日本語" })
            if (NexvrLaunch.ForInstance(invalid) != null)
                throw new Exception("NexVR accepted an invalid instance ID");
        foreach (var invalid in new[] { "", null, "--no-vr", "steam://run/438100//", "vrchat://launch", link + "?extra=1", link + "#hash", "nexvr://instances//join" })
            if (NexvrLaunch.FromUrl(invalid) != null)
                throw new Exception("NexVR accepted a foreign protocol or unsupported arguments");

        var api = new AppApiElectron();
        if (api.StartGame("--no-vr") || api.StartGame("steam://run/438100//"))
            throw new Exception("The native bridge accepted a legacy Steam launch");
        if (api.TryOpenInstanceInVrc("vrchat://launch").GetAwaiter().GetResult())
            throw new Exception("The legacy attach API accepted a VRChat link");
        Console.WriteLine("NexVR protocol launch plans and explicit rejection of legacy Steam/unsupported options passed");
    }
}
