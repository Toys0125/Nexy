using System.Text.Json;
using BasisMenuRestore.Contracts;
using NexVR.ReactiveUI;
using NexVR.Services;

namespace Nexy.PartyBridge;

public sealed class PartyBridge : IModRuntime
{
    private static readonly string SnapshotPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + "Low",
        "NexVR", "NexVR", "nexy-party-bridge", "requests.json");

    private readonly string session = Guid.NewGuid().ToString("N");
    private GatewayNotificationsFeed? feed;
    private IHostServices? host;
    private long nextWrite;
    private bool writeFailed;
    private bool publishedRequests;

    public void Prepare(IHostServices services) => host = services;

    public void Activate() => feed = new GatewayNotificationsFeed();

    public void Tick()
    {
        if (feed is null || Environment.TickCount64 < nextWrite)
            return;

        nextWrite = Environment.TickCount64 + 2000;
        var accountId = NexVRServicesContext.Instance?.Session?.User?.Id;
        var entries = string.IsNullOrEmpty(accountId)
            ? []
            : feed.Items.Where(IsPartyRequest).Take(25).Select(item => new PartyEntry(
                item.Id, item.SubKind, item.Data.GetValueOrDefault("fromName") ?? "",
                item.CreatedAt.ToUnixTimeMilliseconds())).ToArray();
        if (entries.Length == 0 && !publishedRequests)
            return;

        var snapshot = new
        {
            version = 1,
            session,
            accountId,
            updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            entries
        };
        var temporary = SnapshotPath + "." + session + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SnapshotPath)!);
            File.WriteAllText(temporary, JsonSerializer.Serialize(snapshot));
            File.Move(temporary, SnapshotPath, overwrite: true);
            publishedRequests = entries.Length > 0;
            writeFailed = false;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            if (!writeFailed)
                host?.LogWarning("Nexy could not write the party request snapshot: " + error.Message);
            writeFailed = true;
        }
    }

    private static bool IsPartyRequest(NxNotification item) =>
        item.Kind == NxNotificationKind.Party &&
        item.SubKind is "PartyInvite" or "PartyJoinRequest" or "CameraOffer" &&
        !string.IsNullOrEmpty(item.Id);

    public void Key(int virtualKey) { }
    public void OnEvent(RuntimeEvent kind, object? first, object? second) { }
    public void BeginTeardown() => Stop();
    public bool FinishTeardown() => true;

    public void Stop()
    {
        feed?.Dispose();
        feed = null;
    }

    private sealed record PartyEntry(string id, string kind, string sender, long createdAt);
}
