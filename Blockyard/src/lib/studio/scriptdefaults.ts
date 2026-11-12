import type { ScriptKind } from "./types";

/** Starter code inserted when you create each script type. */
export const DEFAULT_SCRIPT_SOURCE: Record<ScriptKind, string> = {
  Script: `-- Script (server-side) — runs on the server when you press Play
print("Hello from the server!")

-- Every property of a part can be changed from code:
-- local part = workspace:FindFirstChild("Part")
-- if part then
--   part.Color = Color3.fromRGB(255, 80, 80)
--   part.Material = Enum.Material.Neon
--   part.Anchored = true
-- end

-- React when the player steps on a part:
-- part.Touched:Connect(function(hit)
--   print(hit.Name .. " touched the part!")
-- end)

-- Useful:
-- task.wait(1)              -- wait 1 second
-- game.Lighting.ClockTime = 18   -- night time
-- Instance.new("Part")      -- create a brand new part
`,

  LocalScript: `-- LocalScript (client-side) — runs on the player's device
local player = game.Players.LocalPlayer
print("Welcome, " .. player.Name .. "!")

-- Loop forever while the game runs (task.wait keeps it smooth):
-- while true do
--   game.Lighting.ClockTime = 14 + math.sin(os.clock()) * 2
--   task.wait(0.1)
-- end

-- Script a tool + an animation (plays on YOUR character only):
-- local hum = player.Humanoid
-- local tool = Instance.new("Tool")
-- tool.Name = "Dance Rod"
-- tool.ToolTip = "Click to dance"
-- tool.Parent = game.StarterPack
-- tool.Activated:Connect(function()
--   local track = hum:LoadAnimation("Dance")
--   track:Play()
-- end)
`,

  ModuleScript: `-- ModuleScript — a library that other scripts load with require()
local M = {}

function M.greet(name)
  return "Hello, " .. name .. "!"
end

function M.countdown(from)
  for i = from, 1, -1 do
    print(i)
    task.wait(1)
  end
  print("Go!")
end

return M

-- Usage from any other script:
-- local M = require(script.Parent.MyModule)
-- print(M.greet("builder"))
`,
};

/** Where each script kind is filed in the Explorer by default. */
export const DEFAULT_SCRIPT_PARENT: Record<ScriptKind, string> = {
  Script: "ServerScriptService",
  LocalScript: "StarterPlayerScripts",
  ModuleScript: "ReplicatedStorage",
};
