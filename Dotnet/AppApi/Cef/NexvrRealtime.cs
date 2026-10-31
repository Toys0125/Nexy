using System;
using System.IO;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;

namespace VRCX
{
    public partial class AppApiCef
    {
        private readonly object realtimeLock = new object();
        private ClientWebSocket realtimeSocket;
        private string realtimeId;

        // CEF's ordinary resource callbacks do not provide a WebSocket handshake
        // interceptor. ClientWebSocket omits Origin; keep this bridge restricted
        // to the first-party endpoint, with normal TLS validation.
        public async Task<string> NexvrRealtimeOpen()
        {
            var socket = new ClientWebSocket();
            var id = Guid.NewGuid().ToString();
            lock (realtimeLock)
            {
                realtimeSocket?.Dispose();
                realtimeSocket = socket;
                realtimeId = id;
            }
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                await socket.ConnectAsync(new Uri("wss://nexvr.net/api/realtime"), timeout.Token);
                return id;
            }
            catch
            {
                NexvrRealtimeClose(id);
                throw;
            }
        }

        private ClientWebSocket GetRealtimeSocket(string id)
        {
            lock (realtimeLock)
                return realtimeId == id ? realtimeSocket : null;
        }

        public async Task NexvrRealtimeSend(string id, string base64)
        {
            var socket = GetRealtimeSocket(id) ?? throw new InvalidOperationException("Socket closed");
            var bytes = Convert.FromBase64String(base64);
            await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Binary, true, CancellationToken.None);
        }

        // Exactly one outstanding read per socket. Assemble fragments before
        // crossing the bridge, preserving protobuf message boundaries and order.
        public async Task<string> NexvrRealtimeReceive(string id)
        {
            var socket = GetRealtimeSocket(id) ?? throw new InvalidOperationException("Socket closed");
            var buffer = new byte[16384];
            using var message = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                    return "close:" + (int)(result.CloseStatus ?? WebSocketCloseStatus.Empty) + ":" + result.CloseStatusDescription;
                if (result.MessageType != WebSocketMessageType.Binary || message.Length + result.Count > 16 * 1024 * 1024)
                    throw new InvalidDataException("Invalid realtime message");
                message.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);
            return Convert.ToBase64String(message.ToArray());
        }

        public void NexvrRealtimeClose(string id)
        {
            lock (realtimeLock)
            {
                if (id != null && realtimeId != id) return;
                realtimeSocket?.Dispose(); // cancels blocked receive/connect immediately
                realtimeSocket = null;
                realtimeId = null;
            }
        }
    }
}
