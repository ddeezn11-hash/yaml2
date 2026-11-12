# Blockyard Explorer service audit

The Explorer now shows the standard Roblox-style service layout so creators can see where Blockyard's Studio model is similar to Roblox Studio and where it is still incomplete.

## Available or partially available

- **Workspace** — editable parts and models. The `Camera` row identifies the editor viewport camera; it is not currently a movable place object. `Terrain` is shown as a future feature.
- **Players** — the scripting runtime exposes a local-player approximation and basic player signals. Player rows appear only during Play mode; this is not yet a full multi-player Players tree.
- **Lighting** — the current lighting properties are editable.
- **ReplicatedStorage** — scripts and ModuleScripts can be stored here; generic replicated instances are not implemented.
- **ServerScriptService** — server scripts and ModuleScripts can be stored here.
- **ServerStorage** — script containers are shown; general server-only object storage is not implemented.
- **StarterGui** — scripts can be stored here; visual ScreenGui/Frame/TextLabel editing is not implemented.
- **StarterPack** — custom tool templates appear here and are copied to a player's Backpack by the play-mode tool system.
- **StarterPlayerScripts** — LocalScripts can be stored here and are executed by the current play-mode runtime.
- **StarterCharacterScripts** — LocalScripts can be stored here. A complete character-spawn/re-spawn lifecycle is not yet simulated.
- **RunService** — visible as a runtime API entry; `Heartbeat` is supported, but it is not a place-content container.

## Visible future services (not implemented yet)

- MaterialService
- ReplicatedFirst
- Teams
- SoundService
- TextChatService
- Chat (legacy)
- Workspace Terrain editing

These rows are intentionally dimmed and marked `soon`. They are visible for discoverability, but their corresponding APIs and editor workflows are not claimed to work yet.

## Adding scripts to service containers

Right-click a supported script container in Explorer and choose `Script`, `LocalScript`, or `ModuleScript`. For StarterPlayer script containers, right-click `StarterPlayerScripts` or `StarterCharacterScripts` specifically. This stores the script under that container's ID, so `script.Parent` resolves to that service container in BloxScript.
