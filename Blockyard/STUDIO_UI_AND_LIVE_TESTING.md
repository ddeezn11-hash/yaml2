# Blockyard Studio: UI Editor, Script Toolbar, and Live Team Testing

This release adds a Studio workflow with a separate game-preview canvas while leaving the editor active.

## UI Editor

1. Open a project in Blockyard Studio.
2. Select the **UI** tab in the top ribbon.
3. Choose **Frame**, **TextLabel**, **TextButton**, or **TextBox**, or open **UI Editor** for the full designer.
4. Drag elements in the UI designer and edit their text, size, position, color, visibility, and layering.
5. UI objects are stored with the place and synchronized to Team Create collaborators.
6. The separate test client and published-game player render the current StarterGui overlay.

## Script toolbar

1. Select the **Script** tab.
2. Choose **Server Script**, **LocalScript**, or **ModuleScript**.
3. New scripts are created in the corresponding service container and opened in Script Editor.
4. Save with **Ctrl+S**. Saved scripts synchronize to Team Create collaborators.
5. A script source update during a test refreshes the test client's script runtime. A script that is already mid-action may restart from its beginning; this is not a production-grade hot-reload debugger.

## Separate local testing

- **Test Here** opens a separate test-client window and spawns near the editor camera's ground target.
- **Run** opens a separate local test-client window using the place's normal spawn location.
- The main Studio editor stays active. You can continue selecting, moving, scaling, rotating, and editing objects while the test window is running.
- Close the test-client window or use **Stop Player** to stop that local player.

## Shared Team Create test

1. Each collaborator opens the top-right **Connect** menu, enters their display name and the same room name, then clicks **Connect**. The room name must match exactly for everyone.
2. The owner or an editor selects the **Test** tab and clicks **Start Server**.
3. The host opens a separate test client automatically.
4. Other collaborators click **Start Player** to open their own separate test client and join the room test.
5. Close a player's test client or click **Stop Player** to leave. The host/owner/editor can click **Stop Server** to end the shared test session.
6. Place-part transforms are mirrored to collaborators while dragging (throttled), and committed transforms are always sent. Script saves and UI edits also synchronize. Their separate test clients mirror the latest synchronized place changes.

### Important implementation limits

- The shared Studio test session is a collaboration preview, not a fully authoritative game server. Each collaborator currently runs local movement, physics, and scripts in their own test client. The sync service relays test-player positions so teammates can see one another, but it does not yet run one shared physics simulation or replicate every gameplay event, inventory mutation, NPC, tool action, and script state.
- The Team Create room currently limits the number of connected collaborators/test players to its configured room limit (24 by default). This is separate from the 200-player target for published-game multiplayer; the Studio test-room feature has not been load-tested at 200 players.
- Server Script and LocalScript labels describe intended script locations and behavior. BloxScript remains Blockyard's own Lua-like runtime; it is not the full Roblox Luau engine, so Roblox APIs that Blockyard has not implemented will not work automatically.
- UI editor support currently focuses on Frame, TextLabel, TextButton, and TextBox. ImageLabel and ImageButton can be inserted as placeholders, but image-source/asset binding is not implemented yet. It is not a complete replacement for Roblox's full UI system/layout constraints.

## Editable Baseplate and camera controls

- Baseplate is a real Workspace part. Select it in the viewport or Explorer, then use Select, Move, Scale, or Rotate and the Properties panel.
- Its grid follows its transform. The test client's collision ground follows the Baseplate collider.
- Drag with the left mouse button on empty sky/background to orbit the Studio camera. Clicking a part selects it; dragging a transform gizmo edits that part. Right-drag also orbits and middle-drag pans.

## Deployment

No new environment variables or Supabase migrations are required for these Studio UI/test-preview features. Commit and push the updated source to the GitHub branch connected to Render; Render can rebuild the website and Studio sync service from the repository.
