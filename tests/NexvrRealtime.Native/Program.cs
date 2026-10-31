using System;
using System.Threading.Tasks;
using VRCX;

// Opt-in integration probe: exercises the production native bridge against the
// public endpoint without credentials, installation or launching the app.
if (Array.IndexOf(args, "--live") < 0)
{
    Console.WriteLine("Pass --live to test the NexVR handshake and binary auth rejection.");
    return;
}
var api = new AppApiCef();
try
{
    var first = await api.NexvrRealtimeOpen();
    Console.WriteLine("Native no-Origin handshake succeeded");
    var second = await api.NexvrRealtimeOpen();
    api.NexvrRealtimeClose(first); // a stale close must not kill its replacement
    // ClientMessage.auth.accessToken = empty (protobuf field 1, empty message).
    await api.NexvrRealtimeSend(second, "CgA=");
    var frame = await api.NexvrRealtimeReceive(second).WaitAsync(TimeSpan.FromSeconds(10));
    if (frame.StartsWith("close:"))
        Console.WriteLine("Empty-token binary auth rejected by server: " + frame);
    else
    {
        if (Convert.FromBase64String(frame).Length == 0) throw new Exception("Empty auth response");
        Console.WriteLine("Binary auth response received: " + frame);
    }
    var third = await api.NexvrRealtimeOpen();
    var pending = api.NexvrRealtimeReceive(third);
    api.NexvrRealtimeClose(third);
    try { await pending.WaitAsync(TimeSpan.FromSeconds(2)); }
    catch (TimeoutException) { throw; }
    catch { /* disposal must unblock the reader */ }
    Console.WriteLine("Replacement isolation and pending-read cleanup passed");
}
finally
{
    api.NexvrRealtimeClose(null);
}
