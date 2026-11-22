# Optional NexVR party bridge

NexVR handles party invites, party join requests, and camera offers inside the game. The NexVR realtime API does not send them. The optional bridge copies the pending rows from the in-game notification feed to a local file for Nexy to display. Use NexVR to respond to the requests.

Build the bridge with PowerShell 7 and the .NET 10 SDK against the installed NexVR CoreCLR client:

```powershell
./tools/party-bridge/Prepare-Release.ps1 -NexVRPath 'C:/Games/NexVR' -OutputDirectory './party-bridge-release'
```

Close NexVR. Copy the generated `current.json` and `releases` directory into `BepInEx/ReloadableMods/nexy-party-bridge` under the selected NexVR installation. Add `"nexy-party-bridge"` to the `ReloadableMods` array in that install's `BepInEx/coreclr-mods.json`, preserving existing entries. Start NexVR and sign in to Nexy with the same NexVR account. Rebuild the bridge after a NexVR update so the release identity matches the new install.

Nexy shows only current requests from the same signed-in account. The file contains sender names, notification kinds and times, and the local account ID. Nexy removes the rows when a request leaves the game inbox or the file stops updating. To disable the bridge, remove its entry from `ReloadableMods` and restart NexVR.
