Run `dotnet run --project tests/NexvrRealtime.Native -- --live` from the repository root.
This opt-in probe compiles the actual native bridge source and contacts NexVR
without credentials. It checks the no-Origin TLS handshake, replacement socket
isolation, sending binary empty-token auth, and cancellation of a blocked read.
An empty token currently receives a server close (1000), rather than an authResult.
It does not validate a signed-in friends/notifications session or the Cef JS binding.

The production bridge accepts no URL: only wss://nexvr.net/api/realtime is reachable.
The JS adapter selects it only when CefSharp and the bound bridge are present and
the configured URL exactly matches. Electron's existing workaround is unchanged.
The native receive loop assembles binary fragments (maximum 16 MiB per message);
the JS adapter queues writes and delivers one complete ArrayBuffer at a time.
Socket identifiers prevent late closes from destroying a replacement connection.
Logout aborts the socket; main-frame loads and browser disposal also release it.

CEF's public resource request interface exposes ordinary resource interception,
but no dedicated WebSocket handshake modification callback. Do not assume
OnBeforeResourceLoad rewrites WebSocket Origin. Reference inspected:
https://github.com/chromiumembedded/cef/blob/master/include/cef_resource_request_handler.h
and the repository's CefSharp IRequestHandler implementation. The native bridge
avoids depending on that unsupported interception path and preserves TLS checks.
