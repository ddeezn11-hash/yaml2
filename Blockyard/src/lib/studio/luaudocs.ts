import { BRICK_COLORS, MATERIALS } from "./data";

/* ------------------------------------------------------------------ */
/* BloxScript / Luau documentation database.                          */
/* Every entry has a runnable example, a category and a context       */
/* badge showing WHERE it runs:                                       */
/*   server  — Script (ServerScriptService)                          */
/*   client  — LocalScript (StarterPlayerScripts)                    */
/*   both    — any script                                            */
/*   module  — ModuleScript (loaded with require)                    */
/* ------------------------------------------------------------------ */

export type DocContext = "server" | "client" | "both" | "module";

export interface DocEntry {
  id: string;
  name: string;
  sig: string;
  category: string;
  context: DocContext;
  desc: string;
  example: string;
}

const D: DocEntry[] = [];
function add(name: string, sig: string, category: string, context: DocContext, desc: string, example: string) {
  D.push({ id: `d${D.length}`, name, sig, category, context, desc, example });
}

/* ============================== Language ============================= */

const KEYWORD_DOCS: [string, string, string][] = [
  ["if", "if cond then ... end", "Run code only when a condition is true."],
  ["elseif", "if a then ... elseif b then ... end", "A second condition when the first fails."],
  ["else", "if cond then ... else ... end", "Code that runs when the condition is false."],
  ["then", "if cond then ... end", "Separates a condition from its body."],
  ["end", "if/for/while/function ... end", "Closes a block."],
  ["for", "for i = 1, 10 do ... end", "Counted loop."],
  ["in", "for k, v in pairs(t) do ... end", "Used by pairs/ipairs loops."],
  ["while", "while cond do ... end", "Loop while a condition holds — always task.wait() inside!"],
  ["repeat", "repeat ... until cond", "Loop that runs at least once."],
  ["until", "repeat ... until cond", "Stops the repeat loop when true."],
  ["do", "do ... end", "Groups statements (also part of for/while)."],
  ["function", "function f(a, b) ... end", "Define a function."],
  ["local", "local x = 5", "Declare a local variable."],
  ["return", "return value", "Give a value back / exit a function."],
  ["break", "break", "Exit a loop early."],
  ["and", "a and b", "True when both sides are true."],
  ["or", "a or b", "True when either side is true (also picks a default)."],
  ["not", "not a", "Invert true/false."],
  ["true", "true", "The boolean true value."],
  ["false", "false", "The boolean false value."],
  ["nil", "nil", "Nothing / no value (like null)."],
];
for (const [kw, sig, desc] of KEYWORD_DOCS) {
  const example =
    kw === "for" ? `for i = 1, 5 do\n  print("count " .. i)\nend` :
    kw === "while" ? `while true do\n  print("tick")\n  task.wait(1)\nend` :
    kw === "repeat" ? `local n = 0\nrepeat\n  n = n + 1\nuntil n >= 3\nprint(n) -- 3` :
    kw === "function" ? `function greet(name)\n  return "hi " .. name\nend\nprint(greet("builder"))` :
    kw === "local" ? `local speed = 16\nlocal name = "Part"` :
    kw === "return" ? `function add(a, b)\n  return a + b\nend\nprint(add(2, 3)) -- 5` :
    kw === "break" ? `for i = 1, 100 do\n  if i > 3 then break end\n  print(i)\nend` :
    kw === "and" ? `local hp = 80\nif hp > 50 and hp < 100 then print("ok") end` :
    kw === "or" ? `local name = nil\nlocal shown = name or "Guest"\nprint(shown) -- Guest` :
    kw === "not" ? `local dead = false\nif not dead then print("alive") end` :
    kw === "nil" ? `local x = nil\nif x == nil then print("empty") end` :
    kw === "if" ? `local health = 75\nif health < 100 then\n  print("hurt!")\nend` :
    kw === "elseif" ? `local speed = 32\nif speed > 100 then\n  print("sonic")\nelseif speed > 16 then\n  print("fast")\nelse\n  print("normal")\nend` :
    `print(${kw === "true" || kw === "false" ? kw : "2 " + (kw === "then" || kw === "end" || kw === "do" ? "== 2" : "> 1")})`;
  add(kw, sig, "Language", "both", desc, example);
}

const OPERATORS: [string, string, string, string][] = [
  ["+ (add)", "a + b", "Add numbers (or offset a Vector3 axis value first).", "print(2 + 3) -- 5"],
  ["- (subtract)", "a - b", "Subtract numbers.", "print(10 - 4) -- 6"],
  ["* (multiply)", "a * b", "Multiply numbers.", "print(6 * 7) -- 42"],
  ["/ (divide)", "a / b", "Divide numbers.", "print(10 / 4) -- 2.5"],
  ["% (modulo)", "a % b", "Remainder — great for even/odd checks.", "if 10 % 2 == 0 then print(\"even\") end"],
  ["^ (power)", "a ^ b", "Raise to a power.", "print(2 ^ 10) -- 1024"],
  [".. (concat)", "a .. b", "Join strings.", "print(" + '"score: " .. 10)'],
  ["== (equal)", "a == b", "Compare for equality.", "if part.Name == " + '"Goal" then print("win") end'],
  ["~= (not equal)", "a ~= b", "Compare for inequality.", "if hp ~= 0 then print(" + '"alive") end'],
  ["< (less)", "a < b", "Less than.", "if health < 25 then print(" + '"low") end'],
  ["<= (less or equal)", "a <= b", "Less than or equal.", "if speed <= 16 then print(" + '"walking") end'],
  ["> (greater)", "a > b", "Greater than.", "if score > 99 then print(" + '"pro") end'],
  [">= (greater or equal)", "a >= b", "Greater than or equal.", "if players >= 10 then print(" + '"full") end'],
  ["# (length)", "#s", "Length of a string (and array size with table.getn).", "print(#" + '"hello") -- 5'],
  ["+= (add assign)", "x += 1", "Add to a variable in place.", "local coins = 0\ncoins += 10"],
  ["-= (sub assign)", "x -= 1", "Subtract from a variable in place.", "local hp = 100\nhp -= 20"],
  ["*= (mul assign)", "x *= 2", "Multiply a variable in place.", "local mult = 2\nmult *= 5"],
  ["/= (div assign)", "x /= 2", "Divide a variable in place.", "local size = 8\nsize /= 2"],
];
for (const [name, sig, desc, ex] of OPERATORS) add(name, sig, "Language", "both", desc, ex);

add("-- (comment)", "-- note", "Language", "both", "Single-line comment.", "-- this line is ignored\nprint(" + '"hi")');
add("--[[ block ]]", "--[[ long\ncomment ]]", "Language", "both", "Multi-line comment.", "--[\n  documentation\n  block\n]]\nprint(" + '"hi")');
add("\\n (newline)", '"line1\\nline2"', "Language", "both", "Escape: newline inside a string.", "print(" + '"first line\\nsecond line")');
add("\\t (tab)", '"a\\tb"', "Language", "both", "Escape: tab character.", "print(" + '"name\\tvalue")');
add("\\\\ (backslash)", '"c:\\\\folder"', "Language", "both", "Escape: a literal backslash.", "print(" + '"c:\\\\folder")');
add('\\" (quote)', '"say \\"hi\\""', "Language", "both", "Escape: a quote inside a string.", "print(" + '"she said \\"hi\\"")');
add("0x (hex literal)", "local n = 0xFF", "Language", "both", "Hexadecimal number literal.", "local n = 0xFF\nprint(n) -- 255");
add("1e5 (exponent)", "local n = 1e5", "Language", "both", "Scientific notation number.", "local n = 1e5\nprint(n) -- 100000");
add(".5 (decimal)", "local n = .5", "Language", "both", "Leading-dot decimal.", "local n = .5\nprint(n) -- 0.5");

/* ============================== Globals ============================= */

add("print", "print(...)", "Globals", "both", "Log a message to the Output panel.", 'print("hello world")\nprint("hp:", 100)');
add("warn", "warn(...)", "Globals", "both", "Log an orange warning to the Output panel.", 'warn("part not found!")');
add("tostring", "tostring(v)", "Globals", "both", "Convert any value to a string.", 'print("hp: " .. tostring(85))');
add("tonumber", "tonumber(s)", "Globals", "both", "Convert a string to a number (nil if it can't).", 'local n = tonumber("42")\nprint(n + 1) -- 43');
add("type", "type(v)", "Globals", "both", "The raw type name: number, string, table, boolean, nil...", 'print(type(42))        -- number\nprint(type("hi"))      -- string\nprint(type({1,2}))     -- table');
add("typeof", "typeof(v)", "Globals", "both", "Roblox style type name: also Vector3, Color3, Instance...", 'print(typeof(Vector3.new(1,1,1))) -- Vector3');
add("tick", "tick()", "Globals", "both", "Seconds since the epoch — use os.clock() for smooth timers instead.", "local t0 = tick()\ntask.wait(1)\nprint(tick() - t0)");
add("wait", "wait(1)", "Globals", "both", "Old-style wait. Prefer task.wait(1).", "wait(0.5)\nprint(\"half a second later\")");
add("shared", "shared.x = 1", "Globals", "both", "A table shared between every script.", 'shared.coins = 100\n-- any other script can read shared.coins');
add("require", "require(moduleScript)", "Globals", "both", "Load a ModuleScript and get whatever it returns.", 'local M = require(script.Parent.MyModule)\nprint(M.greet("builder"))');
add("pairs", "for k, v in pairs(t) do end", "Globals", "both", "Loop over every key/value in a table.", 'local t = {name = "sword", damage = 25}\nfor k, v in pairs(t) do\n  print(k, v)\nend');
add("ipairs", "for i, v in ipairs(t) do end", "Globals", "both", "Loop over the array part of a table (1, 2, 3...).", 'local parts = {"Head", "Torso", "Legs"}\nfor i, name in ipairs(parts) do\n  print(i, name)\nend');
add("unpack", "unpack(t)", "Globals", "both", "Spread an array into separate values.", 'local args = {1, 2, 3}\nprint(math.max(unpack(args))) -- 3');
add("script", "script", "Globals", "both", "The running script itself.", 'print(script.Name)\nprint(script.Parent.Name)');
add("game", "game", "Globals", "both", "The root of the data model — every service hangs off it.", 'local part = game.Workspace:FindFirstChild("Part")\nif part then print(part.Name) end');
add("workspace", "workspace", "Globals", "both", "Shortcut for game.Workspace — the 3D world.", 'local spawn = workspace:FindFirstChild("SpawnLocation")\nprint(spawn ~= nil)');

/* =============================== task =============================== */

add("task.wait", "task.wait(seconds)", "task", "both", "Pause the script without freezing the game. ALWAYS use this inside loops.", 'print("3...")\ntask.wait(1)\nprint("2...")\ntask.wait(1)\nprint("1...")');
add("task.spawn", "task.spawn(fn)", "task", "both", "Run a function alongside the current code.", 'task.spawn(function()\n  task.wait(2)\n  print("2 seconds later")\nend)\nprint("immediately")');
add("task.delay", "task.delay(2, fn)", "task", "both", "Run a function after a delay.", 'task.delay(3, function()\n  print("3 seconds passed")\nend)');
add("task.defer", "task.defer(fn)", "task", "both", "Same as task.spawn — runs soon.", 'task.defer(function()\n  print("deferred")\nend)');

/* =============================== math =============================== */

const MATH_DOCS: [string, string, string, string][] = [
  ["math.floor", "math.floor(x)", "Round down to a whole number.", "print(math.floor(3.7)) -- 3"],
  ["math.ceil", "math.ceil(x)", "Round up to a whole number.", "print(math.ceil(3.2)) -- 4"],
  ["math.abs", "math.abs(x)", "Absolute value (drops the minus).", "print(math.abs(-10)) -- 10"],
  ["math.sqrt", "math.sqrt(x)", "Square root.", "print(math.sqrt(144)) -- 12"],
  ["math.sin", "math.sin(x)", "Sine — great for wave/bob animations.", "local bob = math.sin(os.clock() * 2)"],
  ["math.cos", "math.cos(x)", "Cosine — circles and waves.", "local x = math.cos(t) * 10"],
  ["math.tan", "math.tan(x)", "Tangent.", "print(math.tan(0)) -- 0"],
  ["math.asin", "math.asin(x)", "Arc sine.", "print(math.asin(1)) -- 1.5707..."],
  ["math.acos", "math.acos(x)", "Arc cosine.", "print(math.acos(1)) -- 0"],
  ["math.atan", "math.atan(x)", "Arc tangent.", "print(math.atan(1)) -- 0.785..."],
  ["math.atan2", "math.atan2(y, x)", "Angle of a direction — perfect for facing targets.", "local angle = math.atan2(dz, dx)"],
  ["math.exp", "math.exp(x)", "e to the power x.", "print(math.exp(0)) -- 1"],
  ["math.log", "math.log(x)", "Natural logarithm.", "print(math.log(1)) -- 0"],
  ["math.pow", "math.pow(a, b)", "a to the power b (same as a ^ b).", "print(math.pow(2, 8)) -- 256"],
  ["math.min", "math.min(a, b, ...)", "Smallest of the values.", "print(math.min(10, 3, 7)) -- 3"],
  ["math.max", "math.max(a, b, ...)", "Largest of the values.", "print(math.max(10, 3, 7)) -- 10"],
  ["math.random", "math.random(a, b)", "Random integer between a and b (or 0..1 with no args).", 'local dice = math.random(1, 6)\nprint("rolled", dice)'],
  ["math.randomseed", "math.randomseed(n)", "Seed the random generator.", "math.randomseed(os.time())"],
  ["math.pi", "math.pi", "The constant π (3.14159...).", "print(math.pi)"],
  ["math.huge", "math.huge", "Infinity — useful for huge health.", "local boss = Instance.new(\"Part\")\nboss.Anchored = true"],
];
for (const [name, sig, desc, ex] of MATH_DOCS) add(name, sig, "math", "both", desc, ex);

/* ============================== string ============================== */

const STRING_DOCS: [string, string, string, string][] = [
  ["string.format", 'string.format("%d apples", n)', "Format text with placeholders.", 'print(string.format("%d damage!", 25))\nprint(string.format("hp: %.1f", 99.4))'],
  ["string.upper", "string.upper(s)", "UPPERCASE a string.", 'print(string.upper("wow")) -- WOW'],
  ["string.lower", "string.lower(s)", "lowercase a string.", 'print(string.lower("HI")) -- hi'],
  ["string.len", "string.len(s)", "Length of a string (same as #s).", 'print(string.len("blockyard")) -- 9'],
  ["string.rep", "string.rep(s, n)", "Repeat a string n times.", 'print(string.rep("=", 10)) -- =========='],
  ["string.sub", "string.sub(s, i, j)", "Slice characters i through j.", 'print(string.sub("Blockyard", 1, 5)) -- Block'],
  ["string.find", "string.find(s, needle)", "Find a substring — returns start and end index (or nil).", 'local s, e = string.find("hello world", "world")\nprint(s, e) -- 7 11'],
  ["string.split", 'string.split(s, ",")', "Split a string into a table.", 'local parts = string.split("a,b,c", ",")\nprint(parts[1]) -- a'],
];
for (const [name, sig, desc, ex] of STRING_DOCS) add(name, sig, "string", "both", desc, ex);
add("%d (format)", 'string.format("%d", x)', "string", "both", "Format placeholder: whole number.", 'print(string.format("%d", 42))');
add("%s (format)", 'string.format("%s", s)', "string", "both", "Format placeholder: string.", 'print(string.format("hi %s", "builder"))');
add("%f (format)", 'string.format("%f", x)', "string", "both", "Format placeholder: decimal number.", 'print(string.format("%f", 0.5))');
add("%.2f (format)", 'string.format("%.2f", x)', "string", "both", "Format placeholder: 2 decimal places.", 'print(string.format("%.2f", 3.14159)) -- 3.14');
add("%x (format)", 'string.format("%x", n)', "string", "both", "Format placeholder: hexadecimal.", 'print(string.format("%x", 255)) -- ff');
add("%q (format)", 'string.format("%q", s)', "string", "both", "Format placeholder: quoted string.", 'print(string.format("%q", "hi")) -- "hi"');

/* =============================== table ============================== */

add("table.insert", "table.insert(t, v)", "table", "both", "Append a value to an array (or insert at a position).", 'local bag = {}\ntable.insert(bag, "sword")\ntable.insert(bag, "coil")\nprint(bag[1]) -- sword');
add("table.remove", "table.remove(t, i)", "table", "both", "Remove a value (last by default).", 'local t = {"a", "b", "c"}\ntable.remove(t, 1)\nprint(t[1]) -- b');
add("table.concat", "table.concat(t, sep)", "table", "both", "Join an array into one string.", 'local t = {"red", "green", "blue"}\nprint(table.concat(t, ", "))');
add("table.getn", "table.getn(t)", "table", "both", "How many items are in the array part.", 'local t = {5, 6, 7}\nprint(table.getn(t)) -- 3');
add("table.create", "table.create()", "table", "both", "Create a fresh empty table.", "local t = table.create()\nt[1] = 100");
add("t.key (index)", "t.name / t[1]", "table", "both", "Read or write a table field.", 'local part = {name = "Lava", damage = 20}\nprint(part.name, part.damage)');
add("#t (array size)", "#t", "table", "both", "Length of a string; use table.getn for arrays.", 'local t = {1, 2, 3}\nprint(table.getn(t)) -- 3');

/* ================================ os ================================ */

add("os.time", "os.time()", "os", "both", "Current unix timestamp (seconds).", "print(os.time())");
add("os.clock", "os.clock()", "os", "both", "Smooth seconds counter — perfect for animations.", "local start = os.clock()\ntask.wait(1)\nprint(os.clock() - start)");

/* ============================== Vector3 ============================= */

add("Vector3.new", "Vector3.new(x, y, z)", "Vector3", "both", "Build a 3D position or size.", 'part.Position = Vector3.new(0, 10, 0)\npart.Size = Vector3.new(4, 1, 8)');
add("Vector3.zero", "Vector3.zero", "Vector3", "both", "The vector (0, 0, 0).", "print(Vector3.zero.X) -- 0");
add("Vector3.one", "Vector3.one", "Vector3", "both", "The vector (1, 1, 1).", "print(Vector3.one.Y) -- 1");
add("Vector3.xAxis", "Vector3.xAxis", "Vector3", "both", "The vector (1, 0, 0).", "print(Vector3.xAxis.X) -- 1");
add("Vector3.yAxis", "Vector3.yAxis", "Vector3", "both", "The vector (0, 1, 0) — straight up.", "print(Vector3.yAxis.Y) -- 1");
add("Vector3.zAxis", "Vector3.zAxis", "Vector3", "both", "The vector (0, 0, 1).", "print(Vector3.zAxis.Z) -- 1");
add(".X / .Y / .Z", "v.X  v.Y  v.Z", "Vector3", "both", "Read one axis of a vector.", "local p = part.Position\nprint(p.X, p.Y, p.Z)");

/* =============================== Color3 ============================= */

add("Color3.new", "Color3.new(r, g, b)", "Color3", "both", "Color from 0..1 values.", "part.Color = Color3.new(1, 0, 0) -- red");
add("Color3.fromRGB", "Color3.fromRGB(r, g, b)", "Color3", "both", "Color from 0..255 values — the friendly one.", "part.Color = Color3.fromRGB(255, 128, 0) -- orange");
add(".R / .G / .B", "c.R  c.G  c.B", "Color3", "both", "Read a channel of a color (0..1).", "local c = part.Color\nprint(c.R, c.G, c.B)");

const NAMED_COLORS: [string, number, number, number][] = [
  ["Red", 255, 60, 60], ["Orange", 255, 140, 0], ["Yellow", 255, 220, 0], ["Lime", 120, 255, 0],
  ["Green", 40, 200, 80], ["Teal", 0, 220, 200], ["Cyan", 0, 230, 255], ["Sky Blue", 120, 200, 255],
  ["Blue", 60, 120, 255], ["Indigo", 100, 80, 255], ["Violet", 160, 90, 255], ["Purple", 180, 60, 255],
  ["Magenta", 255, 60, 220], ["Pink", 255, 120, 200], ["Hot Pink", 255, 40, 140], ["Crimson", 220, 20, 60],
  ["Brown", 139, 69, 19], ["Tan", 210, 180, 140], ["Beige", 245, 245, 220], ["White", 255, 255, 255],
  ["Light Grey", 200, 200, 200], ["Dark Grey", 80, 80, 80], ["Black", 20, 20, 20], ["Gold", 255, 200, 40],
];
for (const [name, r, g, b] of NAMED_COLORS) {
  add(`Color3 ${name}`, `Color3.fromRGB(${r}, ${g}, ${b})`, "Color palette", "both", `The color ${name.toLowerCase()} in RGB.`, `part.Color = Color3.fromRGB(${r}, ${g}, ${b}) -- ${name}`);
}

/* ============================= BrickColor =========================== */

add("BrickColor.new", 'BrickColor.new("Bright red")', "BrickColor", "both", "Named Roblox color — see the palette category for all 180+.", 'part.BrickColor = BrickColor.new("Really red")');
for (const alias of ["White", "Gray", "Black", "Red", "Yellow", "Green", "Blue", "Brown"] as const) {
  add(`BrickColor.${alias}`, `BrickColor.${alias}()`, "BrickColor", "both", `Shortcut for the classic ${alias.toLowerCase()} BrickColor.`, `part.BrickColor = BrickColor.${alias}()`);
}

/* =============================== CFrame ============================= */

add("CFrame.new", "CFrame.new(x, y, z)", "CFrame", "both", "A position + rotation. PivotTo accepts one.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  part:PivotTo(Vector3.new(0, 20, 0))\nend');
add("part.CFrame (set)", "part.CFrame = Vector3.new(...)", "CFrame", "both", "Move a part instantly (position form in Blockyard).", "part.CFrame = Vector3.new(10, 5, 10)");

/* ================================ Enum ============================== */

add("Enum", "Enum.Material.Neon", "Enum", "both", "Enumerations — named constant lists like materials.", 'part.Material = Enum.Material.Neon');
add("Enum.Material", "Enum.Material.<name>", "Enum", "both", "The material enum. See the Materials category for every value.", 'part.Material = Enum.Material.Grass');

/* ============================== Instance ============================ */

add("Instance.new (Part)", 'Instance.new("Part")', "Instance", "both", "Create a brand new block part.", 'local p = Instance.new("Part")\np.Position = Vector3.new(0, 10, 0)\np.Color = Color3.fromRGB(90, 200, 255)\nprint(p.Name)');
add("Instance.new (Ball)", 'Instance.new("Ball")', "Instance", "both", "Create a sphere part.", 'local ball = Instance.new("Ball")\nball.Color = Color3.fromRGB(255, 220, 0)');
add("Instance.new (Wedge)", 'Instance.new("Wedge")', "Instance", "both", "Create a ramp part.", 'local ramp = Instance.new("Wedge")\nramp.Color = Color3.fromRGB(150, 150, 150)');
add("Instance.new (Cylinder)", 'Instance.new("Cylinder")', "Instance", "both", "Create a cylinder part.", 'local pole = Instance.new("Cylinder")\npole.Color = Color3.fromRGB(80, 80, 80)');
add("Instance.new (SpawnLocation)", 'Instance.new("SpawnLocation")', "Instance", "both", "Create a spawn pad players appear on.", 'local spawn = Instance.new("SpawnLocation")\nprint(spawn.ClassName)');
add("Instance.new (Model)", 'Instance.new("Model")', "Instance", "both", "Create a model (group) container.", 'local m = Instance.new("Model")\nprint(m.Name)');
add("Instance.new (Folder)", 'Instance.new("Folder")', "Instance", "both", "Create a folder container.", 'local f = Instance.new("Folder")\nprint(f.Name)');

/* ============================ Part (properties) ===================== */

const PART_PROPS: [string, string, DocContext, string, string][] = [
  ["part.Name", 'part.Name = "Lava"', "both", "The part's name — how scripts find it.", 'local p = workspace:FindFirstChild("Part")\nif p then p.Name = "Lava" end'],
  ["part.ClassName", "part.ClassName", "both", "Read-only class: Part or SpawnLocation.", 'print(part.ClassName) -- "Part"'],
  ["part.Position", "part.Position = Vector3.new(x, y, z)", "both", "World position of the part center.", "part.Position = Vector3.new(0, 10, -20)"],
  ["part.Size", "part.Size = Vector3.new(x, y, z)", "both", "Dimensions in studs.", "part.Size = Vector3.new(8, 1, 8)"],
  ["part.Color", "part.Color = Color3.fromRGB(r, g, b)", "both", "The part's color.", "part.Color = Color3.fromRGB(255, 80, 80)"],
  ["part.Color3", "part.Color3 = Color3.fromRGB(r, g, b)", "both", "Alias for Color.", "part.Color3 = Color3.fromRGB(80, 255, 120)"],
  ["part.BrickColor", 'part.BrickColor = BrickColor.new(name)', "both", "Named color (see the palette).", 'part.BrickColor = BrickColor.new("Bright blue")'],
  ["part.Material", 'part.Material = "Neon"  or  Enum.Material.Neon', "both", "Surface look: Plastic, Neon, Wood, Grass...", 'part.Material = Enum.Material.Neon'],
  ["part.Transparency", "part.Transparency = 0.5", "both", "0 = solid, 1 = invisible.", "part.Transparency = 0.5 -- ghost"],
  ["part.Reflectance", "part.Reflectance = 0.8", "both", "0..1 shine.", "part.Reflectance = 0.9 -- chrome"],
  ["part.Anchored", "part.Anchored = true", "both", "Freeze the part so it never falls.", "part.Anchored = true -- must for floating builds"],
  ["part.CanCollide", "part.CanCollide = false", "both", "Walk through the part when false.", "part.CanCollide = false -- ghost wall"],
  ["part.Parent", "part.Parent = model", "both", "Move the part into a model/folder/workspace.", "part.Parent = workspace"],
  ["part.Touched", "part.Touched:Connect(fn)", "both", "Fires when the player touches the part. THE classic event.", 'part.Touched:Connect(function(hit)\n  print(hit.Name .. " touched me!")\nend)'],
];
for (const [name, sig, ctx, desc, ex] of PART_PROPS) add(name, sig, "Part", ctx, desc, ex);

add("baseplate.Name", "workspace.Baseplate.Name", "Part", "both", "The baseplate's name.", 'print(workspace.Baseplate.Name) -- "Baseplate"');
add("baseplate.Size", "workspace.Baseplate.Size", "Part", "both", "The baseplate size (512 × 16 × 512).", "print(workspace.Baseplate.Size.X) -- 512");
add("baseplate.Position", "workspace.Baseplate.Position", "Part", "both", "The baseplate's center position.", "print(workspace.Baseplate.Position.Y) -- -8");
add("baseplate.Anchored", "workspace.Baseplate.Anchored", "Part", "both", "The baseplate is always anchored.", "print(workspace.Baseplate.Anchored) -- true");
add("baseplate.Color", "workspace.Baseplate.Color = Color3...", "Part", "both", "Recolor the whole baseplate from a script.", "game.Workspace.Baseplate.Color = Color3.fromRGB(90, 160, 90)");

/* ============================ Part (methods) ======================== */

add("FindFirstChild", "parent:FindFirstChild(name)", "Instance methods", "both", "Get a child by name, or nil — always check!", 'local part = workspace:FindFirstChild("Lava")\nif part then\n  print("found", part.Name)\nend');
add("WaitForChild", "parent:WaitForChild(name)", "Instance methods", "both", "Like FindFirstChild (Blockyard returns instantly).", 'local part = workspace:WaitForChild("Part")\nprint(part.Name)');
add("GetChildren", "parent:GetChildren()", "Instance methods", "both", "Every child of a container as a table.", 'for _, child in ipairs(workspace:GetChildren()) do\n  print(child.Name)\nend');
add("GetPivot", "part:GetPivot()", "Instance methods", "both", "Read a part's current position.", "local cf = part:GetPivot()\nprint(cf.Position.X, cf.Position.Y, cf.Position.Z)");
add("PivotTo", "part:PivotTo(Vector3.new(...))", "Instance methods", "both", "Teleport a part (or model) to a position.", "part:PivotTo(Vector3.new(0, 50, 0))");
add("Destroy", "part:Destroy()", "Instance methods", "both", "Delete a part forever (this play session).", 'local trap = workspace:FindFirstChild("Trap")\nif trap then trap:Destroy() end');
add("Connect", "signal:Connect(fn)", "Instance methods", "both", "Hook a function to an event (Touched, Heartbeat...).", 'part.Touched:Connect(function(hit)\n  print("touched by", hit.Name)\nend)');

/* ============================== Humanoid ============================ */

const HUMANOID_DOCS: [string, string, DocContext, string, string][] = [
  ["humanoid.Health", "humanoid.Health = 50", "both", "Current health. 0 kills the player.", "humanoid.Health = 50"],
  ["humanoid.MaxHealth", "humanoid.MaxHealth = 200", "both", "The health bar's full size.", "humanoid.MaxHealth = 200\nhumanoid.Health = 200"],
  ["humanoid.WalkSpeed", "humanoid.WalkSpeed = 32", "both", "Movement speed (16 default).", "humanoid.WalkSpeed = 32 -- sprint speed"],
  ["humanoid.JumpPower", "humanoid.JumpPower = 75", "both", "Jump strength (50 default).", "humanoid.JumpPower = 75 -- higher jumps"],
  ["humanoid.JumpHeight", "humanoid.JumpHeight = 75", "both", "Alias for JumpPower.", "humanoid.JumpHeight = 100"],
  ["humanoid.TakeDamage", "humanoid:TakeDamage(20)", "both", "Damage the player (respects god mode).", "humanoid:TakeDamage(20)"],
  ["humanoid.Heal", "humanoid:Heal(25)", "both", "Restore health.", "humanoid:Heal(25)"],
  ["humanoid.MoveTo", "humanoid:MoveTo(Vector3)", "both", "Send the character to a point (teleports in Blockyard).", "humanoid:MoveTo(Vector3.new(0, 0, 50))"],
  ["humanoid.Died", "humanoid.Died:Connect(fn)", "both", "Fires when the player dies.", 'humanoid.Died:Connect(function()\n  print("RIP")\nend)'],
  ["humanoid.HealthChanged", "humanoid.HealthChanged:Connect(fn)", "both", "Fires whenever health changes.", 'humanoid.HealthChanged:Connect(function(hp)\n  print("hp is now", hp)\nend)'],
  ["humanoid.ClassName", "humanoid.ClassName", "both", "Always the string \"Humanoid\".", 'print(humanoid.ClassName)'],
];
for (const [name, sig, ctx, desc, ex] of HUMANOID_DOCS) add(name, sig, "Humanoid", ctx, desc, ex);

/* =============================== Player ============================= */

const PLAYER_DOCS: [string, string, DocContext, string, string][] = [
  ["player.Name", "player.Name", "both", "The player's username.", 'print("welcome " .. player.Name)'],
  ["player.DisplayName", "player.DisplayName", "both", "The friendly display name.", 'print(player.DisplayName)'],
  ["player.UserId", "player.UserId", "both", "Numeric id of the player.", "print(player.UserId)"],
  ["player.Character", "player.Character", "both", "The player's character model.", "local char = player.Character\nprint(char.Name)"],
  ["player.Humanoid", "player.Humanoid", "both", "The character's humanoid (health, speed...).", "local hum = player.Humanoid\nhum.WalkSpeed = 24"],
  ["player.Kick", "player:Kick()", "both", "Disconnect the player.", "player:Kick()"],
  ["Players.LocalPlayer", "game.Players.LocalPlayer", "client", "The player running this game — LocalScripts only!", 'local player = game.Players.LocalPlayer\nprint("hi " .. player.Name)'],
];
for (const [name, sig, ctx, desc, ex] of PLAYER_DOCS) add(name, sig, "Player", ctx, desc, ex);

/* ============================== Services ============================ */

const SERVICE_DOCS: [string, string, DocContext, string, string][] = [
  ["game.Workspace", "game.Workspace", "both", "The 3D world — parts and models live here.", 'local part = game.Workspace:FindFirstChild("Part")'],
  ["game.Players", "game.Players", "both", "Every connected player.", "local players = game.Players:GetPlayers()"],
  ["game.Lighting", "game.Lighting", "both", "Sky, sun and fog settings.", "game.Lighting.ClockTime = 18 -- sunset"],
  ["game.ReplicatedStorage", "game.ReplicatedStorage", "both", "Shared objects both sides can see (modules...).", 'local M = game.ReplicatedStorage:FindFirstChild("MyModule")'],
  ["game.ServerStorage", "game.ServerStorage", "server", "Server-only storage — LocalScripts get an error here!", 'local secret = game.ServerStorage:FindFirstChild("LootTable")'],
  ["game.ServerScriptService", "game.ServerScriptService", "server", "Where server Scripts live. Client code cannot read it.", 'print(game.ServerScriptService.Name)'],
  ["game.StarterPlayer", "game.StarterPlayer", "both", "Per-player settings container.", 'print(game.StarterPlayer.Name)'],
  ["game.StarterGui", "game.StarterGui", "client", "Where LocalScripts build their UI.", 'print(game.StarterGui.Name)'],
  ["game.RunService", "game.RunService", "both", "Heartbeat — runs every frame.", 'game.RunService.Heartbeat:Connect(function(dt)\n  -- smooth motion\nend)'],
  ["game:GetService", 'game:GetService("Players")', "both", "Fetch a service by name.", 'local Players = game:GetService("Players")\nprint(Players.Name)'],
  ["game.PlaceId", "game.PlaceId", "both", "The id of this experience.", "print(game.PlaceId)"],
  ["game.JobId", "game.JobId", "both", "The id of this server instance.", "print(game.JobId)"],
  ["Players.GetPlayers", "Players:GetPlayers()", "both", "Table of every player (you + bots).", 'for _, p in ipairs(game.Players:GetPlayers()) do\n  print(p.Name)\nend'],
  ["Players.PlayerAdded", "Players.PlayerAdded:Connect(fn)", "both", "Fires when someone joins.", 'game.Players.PlayerAdded:Connect(function(player)\n  print(player.Name .. " joined!")\nend)'],
  ["Players.MaxPlayers", "Players.MaxPlayers", "both", "Server slot count.", "print(game.Players.MaxPlayers)"],
];
for (const [name, sig, ctx, desc, ex] of SERVICE_DOCS) add(name, sig, "Services", ctx, desc, ex);

const LIGHTING_DOCS: [string, string, string, string][] = [
  ["Lighting.ClockTime", "game.Lighting.ClockTime = 14", "Time of day 0..24 (14 = afternoon, 22 = night).", "game.Lighting.ClockTime = 22 -- night"],
  ["Lighting.Brightness", "game.Lighting.Brightness = 2", "Sun intensity.", "game.Lighting.Brightness = 2 -- vivid"],
  ["Lighting.FogEnd", "game.Lighting.FogEnd = 500", "Where fog fully hides the world (studs).", "game.Lighting.FogEnd = 300 -- spooky"],
  ["Lighting.Ambient", "game.Lighting.Ambient = Color3.new(0.3, 0.3, 0.35)", "Base light color of the scene.", "game.Lighting.Ambient = Color3.new(0.2, 0.2, 0.3)"],
];
for (const [name, sig, desc, ex] of LIGHTING_DOCS) add(name, sig, "Services", "both", desc, ex);

add("script.Name", "script.Name", "script", "both", "This script's name.", "print(script.Name)");
add("script.Enabled", "script.Enabled", "script", "both", "Whether the script runs on Play.", "print(script.Enabled)");
add("script.ClassName", "script.ClassName", "script", "both", "Script, LocalScript or ModuleScript.", 'print(script.ClassName) -- "Script"');
add("script.Parent", "script.Parent", "script", "both", "The service or model holding this script.", "print(script.Parent.Name)");

/* ============================ Materials list ======================== */

for (const m of MATERIALS) {
  add(`Enum.Material.${m.name}`, `Enum.Material.${m.name}`, "Materials", "both", `The ${m.name} material.`, `part.Material = Enum.Material.${m.name}`);
}
for (const m of MATERIALS) {
  add(`Material "${m.name}"`, `part.Material = "${m.name}"`, "Materials (string form)", "both", `Set ${m.name} using the string form.`, `part.Material = "${m.name}"`);
}

/* =========================== BrickColor palette ===================== */

for (const [name, num, hex] of BRICK_COLORS) {
  add(`BrickColor "${name}"`, `BrickColor.new("${name}")`, "BrickColor palette", "both", `Palette #${num} — hex ${hex}.`, `part.BrickColor = BrickColor.new("${name}")`);
}

/* ====================== BrickColor → Color3 chart =================== */

for (const [name, , hex] of BRICK_COLORS) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  add(`${name} RGB`, `Color3.fromRGB(${r}, ${g}, ${b})`, "Color chart", "both", `The exact RGB of BrickColor "${name}".`, `part.Color = Color3.fromRGB(${r}, ${g}, ${b}) -- ${name}`);
}

/* ============================== Hue wheel =========================== */

for (let h = 0; h < 360; h += 10) {
  add(`Hue ${h}°`, `hue ${h}`, "Hue reference", "both", `A ${h}° hue reference for rainbow scripts (use Color3.fromRGB values below).`, `-- ${h} degrees around the color wheel\npart.Color = Color3.fromRGB(${Math.round(255 * Math.abs(Math.sin((h + 0) * Math.PI / 180)))}, ${Math.round(255 * Math.abs(Math.sin((h + 120) * Math.PI / 180)))}, ${Math.round(255 * Math.abs(Math.sin((h + 240) * Math.PI / 180)))})`);
}

/* =========================== OnTouch recipes ======================== */

const ONTOUCH_RECIPES: [string, string, string][] = [
  ["OnTouch: kill brick", "Instantly kill the player.", 'local part = workspace:FindFirstChild("Lava")\nif part then\n  part.Touched:Connect(function(hit)\n    local player = game.Players.LocalPlayer\n    if player and hit.Name == "HumanoidRootPart" then\n      player.Humanoid:TakeDamage(1000)\n    end\n  end)\nend'],
  ["OnTouch: damage 25", "Hurt the player a little on each touch.", 'local part = workspace:FindFirstChild("Trap")\nif part then\n  part.Touched:Connect(function()\n    game.Players.LocalPlayer.Humanoid:TakeDamage(25)\n  end)\nend'],
  ["OnTouch: heal brick", "Restore health on touch.", 'local part = workspace:FindFirstChild("HealthPad")\nif part then\n  part.Touched:Connect(function()\n    game.Players.LocalPlayer.Humanoid:Heal(50)\n  end)\nend'],
  ["OnTouch: speed pad", "Double the player's speed.", 'local part = workspace:FindFirstChild("SpeedPad")\nif part then\n  part.Touched:Connect(function()\n    game.Players.LocalPlayer.Humanoid.WalkSpeed = 32\n  end)\nend'],
  ["OnTouch: jump pad", "Launch the player upward.", 'local part = workspace:FindFirstChild("JumpPad")\nif part then\n  part.Touched:Connect(function()\n    game.Players.LocalPlayer.Humanoid.JumpPower = 150\n  end)\nend'],
  ["OnTouch: recolor", "Change the part's color when touched.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  part.Touched:Connect(function()\n    part.Color = Color3.fromRGB(255, 80, 80)\n  end)\nend'],
  ["OnTouch: make neon", "Glow on touch.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  part.Touched:Connect(function()\n    part.Material = Enum.Material.Neon\n  end)\nend'],
  ["OnTouch: disappear", "Vanish 2 seconds after being touched.", 'local part = workspace:FindFirstChild("Platform")\nif part then\n  part.Touched:Connect(function()\n    part.Transparency = 1\n    part.CanCollide = false\n    task.wait(2)\n    part.Transparency = 0\n    part.CanCollide = true\n  end)\nend'],
  ["OnTouch: teleporter", "Teleport the player to a target point.", 'local pad = workspace:FindFirstChild("TeleportA")\nif pad then\n  pad.Touched:Connect(function()\n    game.Players.LocalPlayer.Humanoid:MoveTo(Vector3.new(0, 10, -80))\n  end)\nend'],
  ["OnTouch: grow", "Make the part bigger each touch.", 'local part = workspace:FindFirstChild("GrowBall")\nif part then\n  part.Touched:Connect(function()\n    part.Size = Vector3.new(part.Size.X + 1, part.Size.Y + 1, part.Size.Z + 1)\n  end)\nend'],
  ["OnTouch: spin forever", "Start spinning after the first touch.", 'local part = workspace:FindFirstChild("Spinner")\nif part then\n  local spinning = false\n  part.Touched:Connect(function()\n    spinning = true\n  end)\n  game.RunService.Heartbeat:Connect(function(dt)\n    if spinning then\n      part.Position = part.Position -- keep place (rotation via rot below)\n    end\n  end)\nend'],
  ["OnTouch: message", "Print who touched it.", 'local part = workspace:FindFirstChild("Sensor")\nif part then\n  part.Touched:Connect(function(hit)\n    print(hit.Name .. " stepped on the sensor")\n  end)\nend'],
];
for (const [name, desc, ex] of ONTOUCH_RECIPES) add(name, name, "Recipes · OnTouch", "server", desc, ex);

for (const m of ["Neon", "Wood", "Grass", "Ice", "Metal", "Glass", "Sand", "Snow", "Fabric", "Brick", "Marble", "ForceField"]) {
  add(`OnTouch: ${m}`, `part.Material = Enum.Material.${m}`, "Recipes · OnTouch", "server", `Material-swap recipe for ${m}.`, `local part = workspace:FindFirstChild("Part")\nif part then\n  part.Touched:Connect(function()\n    part.Material = Enum.Material.${m}\n  end)\nend`);
}

/* OnTouch recolor matrix — the classic "touch = new color" pattern for 80 colors */
for (const [name, , hex] of BRICK_COLORS.slice(0, 80)) {
  add(`OnTouch: recolor ${name}`, `part.BrickColor = BrickColor.new("${name}")`, "Recipes · OnTouch", "server", `Recolor a part to ${name} (${hex}) on touch.`, `local part = workspace:FindFirstChild("Part")\nif part then\n  part.Touched:Connect(function()\n    part.BrickColor = BrickColor.new("${name}")\n  end)\nend`);
}

/* Part size catalog — classic brick dimensions */
const SIZE_CATALOG: [string, string, string][] = [
  ["Size: stud 1×1×1", "Vector3.new(1, 1, 1)", "Tiny detail cube."],
  ["Size: brick 2×1×2", "Vector3.new(2, 1, 2)", "The classic brick."],
  ["Size: plate 4×0.4×4", "Vector3.new(4, 0.4, 4)", "Thin floor plate."],
  ["Size: block 4×4×4", "Vector3.new(4, 4, 4)", "Default new part."],
  ["Size: tile 8×0.4×8", "Vector3.new(8, 0.4, 8)", "Wide walkway tile."],
  ["Size: slab 8×1×8", "Vector3.new(8, 1, 8)", "Chunky platform."],
  ["Size: beam 16×1×1", "Vector3.new(16, 1, 1)", "Long thin beam."],
  ["Size: wall 16×8×1", "Vector3.new(16, 8, 1)", "Room wall."],
  ["Size: floor 32×1×32", "Vector3.new(32, 1, 32)", "Room floor."],
  ["Size: platform 64×1×64", "Vector3.new(64, 1, 64)", "Arena platform."],
  ["Size: tower 8×64×8", "Vector3.new(8, 64, 8)", "Tall pillar."],
  ["Size: road 256×0.2×16", "Vector3.new(256, 0.2, 16)", "Long road strip."],
  ["Size: field 128×1×128", "Vector3.new(128, 1, 128)", "Big grass field."],
  ["Size: step 4×2×4", "Vector3.new(4, 2, 4)", "Obby step."],
  ["Size: stairs 4×8×16", "Vector3.new(4, 8, 16)", "Stair block."],
  ["Size: door 6×10×1", "Vector3.new(6, 10, 1)", "Doorway fill."],
  ["Size: window 6×4×1", "Vector3.new(6, 4, 1)", "Window fill."],
  ["Size: pillar 2×20×2", "Vector3.new(2, 20, 2)", "Slim column."],
  ["Size: arch 24×4×4", "Vector3.new(24, 4, 4)", "Arch top."],
  ["Size: ramp 8×4×12", "Vector3.new(8, 4, 12)", "Sized for a wedge ramp."],
  ["Size: bridge 48×1×8", "Vector3.new(48, 1, 8)", "Gap bridge."],
  ["Size: roof 12×1×16", "Vector3.new(12, 1, 16)", "Flat roof."],
  ["Size: baseplate 512×16×512", "Vector3.new(512, 16, 512)", "The baseplate itself."],
  ["Size: killzone 512×1×512", "Vector3.new(512, 1, 512)", "Full-floor hazard."],
  ["Size: checkpoint 12×1×12", "Vector3.new(12, 1, 12)", "Spawn-size pad."],
  ["Size: truss 2×32×2", "Vector3.new(2, 32, 2)", "Climbable-looking tower."],
  ["Size: half 2×2×1", "Vector3.new(2, 2, 1)", "Half brick."],
  ["Size: long 32×2×2", "Vector3.new(32, 2, 2)", "Fence rail."],
  ["Size: cube 6×6×6", "Vector3.new(6, 6, 6)", "Chunky cube."],
  ["Size: sphere pad 10×1×10", "Vector3.new(10, 1, 10)", "Round-feeling pad."],
  ["Size: megablock 16×16×16", "Vector3.new(16, 16, 16)", "Mega block."],
  ["Size: giant 100×10×100", "Vector3.new(100, 10, 100)", "Giant slab."],
];
for (const [name, sig, desc] of SIZE_CATALOG) add(name, `part.Size = ${sig}`, "Recipes · sizes", "both", desc, `part.Size = ${sig}`);

/* Command aliases (each documented like a real CLI) */
const ALIAS_DOCS: [string, string, string][] = [
  [":ws <n>", "Alias of :speed.", ":ws 60"],
  [":walkspeed <n>", "Alias of :speed.", ":walkspeed 60"],
  [":jp <n>", "Alias of :jump.", ":jp 120"],
  [":jumppower <n>", "Alias of :jump.", ":jumppower 120"],
  [":hp <n>", "Alias of :health.", ":hp 250"],
  [":dmg <n>", "Alias of :damage.", ":dmg 10"],
  [":help", "Alias of :cmds.", ":help"],
  [";speed <n>", "; also works as a command prefix (Kohl's style).", ";speed 60"],
];
for (const [name, desc, ex] of ALIAS_DOCS) add(name, name, "Game commands (OP)", "both", desc, `-- in game chat:\n${ex}`);

/* OnTouch property matrix — every settable Part property, touched */
const ONTOUCH_PROPS: [string, string, string, string][] = [
  ["OnTouch: move up 10", "part.Position", "Teleport the touched part 10 studs up.", "part.Touched:Connect(function()\n  part.Position = Vector3.new(part.Position.X, part.Position.Y + 10, part.Position.Z)\nend)"],
  ["OnTouch: grow X", "part.Size", "Widen the part by 2 each touch.", "part.Touched:Connect(function()\n  part.Size = Vector3.new(part.Size.X + 2, part.Size.Y, part.Size.Z)\nend)"],
  ["OnTouch: shrink", "part.Size", "Shrink by 1 each touch.", "part.Touched:Connect(function()\n  part.Size = Vector3.new(math.max(1, part.Size.X - 1), part.Size.Y, part.Size.Z)\nend)"],
  ["OnTouch: transparency", "part.Transparency", "Fade to half-visible.", "part.Touched:Connect(function()\n  part.Transparency = 0.5\nend)"],
  ["OnTouch: reflectance", "part.Reflectance", "Polish to a shine.", "part.Touched:Connect(function()\n  part.Reflectance = 1\nend)"],
  ["OnTouch: anchor", "part.Anchored", "Freeze the part.", "part.Touched:Connect(function()\n  part.Anchored = true\nend)"],
  ["OnTouch: unanchor", "part.Anchored", "Let the part fall.", "part.Touched:Connect(function()\n  part.Anchored = false\nend)"],
  ["OnTouch: no-collide", "part.CanCollide", "Make it walk-through.", "part.Touched:Connect(function()\n  part.CanCollide = false\nend)"],
  ["OnTouch: rename", "part.Name", "Change identity.", 'part.Touched:Connect(function()\n  part.Name = "Activated"\nend)'],
  ["OnTouch: humanoid health", "humanoid.Health", "Set health to full on touch.", "part.Touched:Connect(function()\n  local hum = game.Players.LocalPlayer.Humanoid\n  hum.Health = hum.MaxHealth\nend)"],
  ["OnTouch: speed change", "humanoid.WalkSpeed", "Change the player's speed.", "part.Touched:Connect(function()\n  game.Players.LocalPlayer.Humanoid.WalkSpeed = 8\nend)"],
  ["OnTouch: jump change", "humanoid.JumpPower", "Change jump strength.", "part.Touched:Connect(function()\n  game.Players.LocalPlayer.Humanoid.JumpPower = 100\nend)"],
  ["OnTouch: heal 10", "humanoid:Heal", "Small heal every touch.", "part.Touched:Connect(function()\n  game.Players.LocalPlayer.Humanoid:Heal(10)\nend)"],
  ["OnTouch: damage over time", "humanoid:TakeDamage", "5 damage per touch — stack them.", "part.Touched:Connect(function()\n  game.Players.LocalPlayer.Humanoid:TakeDamage(5)\nend)"],
  ["OnTouch: max health up", "humanoid.MaxHealth", "Bigger health bar on touch.", "part.Touched:Connect(function()\n  local hum = game.Players.LocalPlayer.Humanoid\n  hum.MaxHealth = hum.MaxHealth + 50\nend)"],
  ["OnTouch: night", "Lighting.ClockTime", "Turn day into night.", "part.Touched:Connect(function()\n  game.Lighting.ClockTime = 22\nend)"],
  ["OnTouch: day", "Lighting.ClockTime", "Turn night into day.", "part.Touched:Connect(function()\n  game.Lighting.ClockTime = 14\nend)"],
  ["OnTouch: fog", "Lighting.FogEnd", "Roll in the fog.", "part.Touched:Connect(function()\n  game.Lighting.FogEnd = 200\nend)"],
  ["OnTouch: spawn part", "Instance.new", "Spawn a new part above.", "part.Touched:Connect(function()\n  local p = Instance.new(\"Part\")\n  p.Position = Vector3.new(0, 20, 0)\nend)"],
  ["OnTouch: spawn ball", "Instance.new", "Spawn a ball.", "part.Touched:Connect(function()\n  local b = Instance.new(\"Ball\")\n  b.Position = Vector3.new(0, 10, 0)\nend)"],
  ["OnTouch: two-step", "Touched + task.wait", "React, wait, react again.", "part.Touched:Connect(function()\n  part.Color = Color3.fromRGB(255, 0, 0)\n  task.wait(1)\n  part.Color = Color3.fromRGB(255, 255, 255)\nend)"],
  ["OnTouch: once only", "Touched + flag", "Fire a single time.", "local fired = false\npart.Touched:Connect(function()\n  if fired then return end\n  fired = true\n  print(\"first touch!\")\nend)"],
  ["OnTouch: counter", "Touched + variable", "Count every touch.", "local touches = 0\npart.Touched:Connect(function()\n  touches += 1\n  print(\"touch #\" .. touches)\nend)"],
];
for (const [name, sig, desc, ex] of ONTOUCH_PROPS) add(name, sig, "Recipes · OnTouch", "server", desc, `local part = workspace:FindFirstChild("Part")\nif part then\n  ${ex}\nend`);

/* Timer ladder */
const TIMER_LADDER: [string, string, string][] = [
  ["Delay: 0.1s", "One frame-ish — smooth effects.", "task.wait(0.1)"],
  ["Delay: 0.25s", "Fast pulse.", "task.wait(0.25)"],
  ["Delay: 0.5s", "Standard tick.", "task.wait(0.5)"],
  ["Delay: 1s", "One second.", "task.wait(1)"],
  ["Delay: 2s", "Door timing.", "task.wait(2)"],
  ["Delay: 3s", "Respawn timing.", "task.wait(3)"],
  ["Delay: 5s", "Round timing.", "task.wait(5)"],
  ["Delay: 10s", "Long cooldown.", "task.wait(10)"],
  ["Delay: 30s", "Match phase.", "task.wait(30)"],
  ["Delay: 60s", "A full minute.", "task.wait(60)"],
];
for (const [name, desc, ex] of TIMER_LADDER) add(name, ex, "Recipes · timing", "both", desc, `${ex}\nprint("done waiting")`);

/* Random pack */
const RANDOM_PACK: [string, string, string][] = [
  ["Random: color", "Random bright color.", "part.Color = Color3.fromRGB(math.random(60, 255), math.random(60, 255), math.random(60, 255))"],
  ["Random: position", "Teleport somewhere in a 100-stud square.", "part.Position = Vector3.new(math.random(-50, 50), 5, math.random(-50, 50))"],
  ["Random: size", "Cube of random size.", "local s = math.random(1, 8)\npart.Size = Vector3.new(s, s, s)"],
  ["Random: material", "Pick a random material.", 'local mats = {"Neon", "Wood", "Metal", "Grass", "Ice"}\npart.Material = mats[math.random(1, 5)]'],
  ["Random: walkspeed", "Chaos speed.", "game.Players.LocalPlayer.Humanoid.WalkSpeed = math.random(4, 60)"],
  ["Random: jump", "Random jump power.", "game.Players.LocalPlayer.Humanoid.JumpPower = math.random(20, 150)"],
  ["Random: coin flip", "Heads or tails.", 'if math.random(0, 1) == 1 then print("heads") else print("tails") end'],
  ["Random: dice", "Roll a d6.", "print(\"rolled a \" .. math.random(1, 6))"],
  ["Random: yes/no", "Decide anything.", 'local answers = {"yes", "no", "maybe"}\nprint(answers[math.random(1, 3)])'],
  ["Random: lottery", "1 in 100 wins.", 'if math.random(1, 100) == 1 then print("JACKPOT!") else print("try again") end'],
  ["Random: team", "Split into teams.", 'local teams = {"red", "blue"}\nprint("team " .. teams[math.random(1, 2)])'],
  ["Random: spawn point", "Random spawn among pads.", "local x = math.random(-100, 100)\ngame.Players.LocalPlayer.Humanoid:MoveTo(Vector3.new(x, 5, 0))"],
  ["Random: time of day", "Random lighting.", "game.Lighting.ClockTime = math.random(0, 24)"],
  ["Random: fog", "Random atmosphere.", "game.Lighting.FogEnd = math.random(100, 2000)"],
  ["Random: damage", "Unpredictable hits.", "game.Players.LocalPlayer.Humanoid:TakeDamage(math.random(5, 40))"],
  ["Random: heal", "Unpredictable heals.", "game.Players.LocalPlayer.Humanoid:Heal(math.random(5, 50))"],
];
for (const [name, desc, ex] of RANDOM_PACK) add(name, name, "Recipes · random", "both", desc, `-- ${desc}\n${ex}`);

/* Model & workspace pack */
const MODEL_PACK: [string, string, string][] = [
  ["Model: list children", "Print every child of Workspace.", "for _, child in ipairs(workspace:GetChildren()) do\n  print(child.Name)\nend"],
  ["Model: count parts", "How many parts exist.", "local n = 0\nfor _, child in ipairs(workspace:GetChildren()) do\n  n += 1\nend\nprint(n .. \" children\")"],
  ["Model: recolor all", "Recolor every part.", "for _, child in ipairs(workspace:GetChildren()) do\n  child.Color = Color3.fromRGB(120, 200, 255)\nend"],
  ["Model: anchor all", "Anchor everything in Workspace.", "for _, child in ipairs(workspace:GetChildren()) do\n  child.Anchored = true\nend"],
  ["Model: neon all", "Make everything glow.", "for _, child in ipairs(workspace:GetChildren()) do\n  child.Material = Enum.Material.Neon\nend"],
  ["Model: no-collide all", "Ghost world.", "for _, child in ipairs(workspace:GetChildren()) do\n  child.CanCollide = false\nend"],
  ["Model: find by name part", "Find children whose name contains text.", 'for _, child in ipairs(workspace:GetChildren()) do\n  if child.Name == "Wall" then\n    print("found a wall")\n  end\nend'],
  ["Model: create group", "Make a new model container.", 'local m = Instance.new("Model")\nprint(m.Name)'],
  ["Model: create folder", "Make a folder.", 'local f = Instance.new("Folder")\nprint(f.Name)'],
  ["Model: delete by name", "Remove all parts named Trap.", 'for _, child in ipairs(workspace:GetChildren()) do\n  if child.Name == "Trap" then\n    child:Destroy()\n  end\nend'],
  ["Model: bob all", "Make every part bob.", "while true do\n  for _, child in ipairs(workspace:GetChildren()) do\n    child.Position = Vector3.new(child.Position.X, child.Position.Y + 0.1, child.Position.Z)\n  end\n  task.wait(0.5)\nend"],
  ["Model: mass rename", "Number every part.", "local i = 0\nfor _, child in ipairs(workspace:GetChildren()) do\n  i += 1\n  child.Name = \"Part\" .. i\nend"],
];
for (const [name, desc, ex] of MODEL_PACK) add(name, name, "Recipes · models", "both", desc, ex);

/* Safety & debugging pack */
const SAFETY_PACK: [string, string, string][] = [
  ["Safety: nil check", "Always check FindFirstChild results.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  print("safe to use", part.Name)\nelse\n  warn("part missing!")\nend'],
  ["Safety: type check", "Verify a value's type.", 'local x = 5\nif type(x) == "number" then print("ok") end'],
  ["Safety: number check", "Verify user-ish input is numeric.", 'local s = tonumber("abc")\nif s == nil then warn("not a number") end'],
  ["Safety: range clamp", "Keep a value between limits.", "local hp = math.max(0, math.min(100, 130))\nprint(hp) -- 100"],
  ["Safety: anchored check", "Check before physics tricks.", "if part.Anchored then\n  print(\"this part never falls\")\nend"],
  ["Safety: health check", "React to low health.", "local hum = game.Players.LocalPlayer.Humanoid\nif hum.Health < 20 then\n  warn(\"critical!\")\nend"],
  ["Safety: loop guard", "Never loop without task.wait.", "local i = 0\nwhile i < 10 do\n  i += 1\n  task.wait(0.1) -- REQUIRED\nend"],
];
for (const [name, desc, ex] of SAFETY_PACK) add(name, name, "Recipes · safety", "both", desc, ex);

/* Directional movement from current position */
const DIRECTION_PACK: [string, string, string][] = [
  ["Move part: +X (east)", "Shift along positive X.", "part.Position = Vector3.new(part.Position.X + 10, part.Position.Y, part.Position.Z)"],
  ["Move part: -X (west)", "Shift along negative X.", "part.Position = Vector3.new(part.Position.X - 10, part.Position.Y, part.Position.Z)"],
  ["Move part: +Z (south)", "Shift along positive Z.", "part.Position = Vector3.new(part.Position.X, part.Position.Y, part.Position.Z + 10)"],
  ["Move part: -Z (north)", "Shift along negative Z.", "part.Position = Vector3.new(part.Position.X, part.Position.Y, part.Position.Z - 10)"],
  ["Move part: +Y (up)", "Shift along positive Y.", "part.Position = Vector3.new(part.Position.X, part.Position.Y + 10, part.Position.Z)"],
  ["Move part: -Y (down)", "Shift along negative Y.", "part.Position = Vector3.new(part.Position.X, part.Position.Y - 10, part.Position.Z)"],
];
for (const [name, desc, ex] of DIRECTION_PACK) add(name, name, "Recipes · movement", "both", desc, `-- ${desc}\n${ex}`);

/* ========================= Classic game recipes ====================== */

const RECIPES: [string, DocContext, string, string][] = [
  ["Recipe: day-night cycle", "server", "Slowly cycle the sun.", 'while true do\n  game.Lighting.ClockTime = (game.Lighting.ClockTime + 0.02) % 24\n  task.wait(0.05)\nend'],
  ["Recipe: night mode", "both", "Instant midnight.", "game.Lighting.ClockTime = 22\ngame.Lighting.FogEnd = 400"],
  ["Recipe: sunset", "both", "Golden hour lighting.", "game.Lighting.ClockTime = 18.3\ngame.Lighting.Brightness = 1.4"],
  ["Recipe: dawn", "both", "Early morning light.", "game.Lighting.ClockTime = 6.2\ngame.Lighting.Brightness = 1.1"],
  ["Recipe: rainbow part", "server", "Cycle a part through colors.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  local t = 0\n  while true do\n    t = t + 0.02\n    part.Color = Color3.new((math.sin(t) + 1) / 2, (math.sin(t + 2) + 1) / 2, (math.sin(t + 4) + 1) / 2)\n    task.wait(0.05)\n  end\nend'],
  ["Recipe: pulse transparency", "server", "Ghost pulse effect.", 'local part = workspace:FindFirstChild("Part")\nif part then\n  local t = 0\n  while true do\n    t = t + 0.03\n    part.Transparency = (math.sin(t) + 1) / 2 * 0.8\n    task.wait(0.03)\n  end\nend'],
  ["Recipe: bobbing platform", "server", "Float up and down smoothly.", 'local part = workspace:FindFirstChild("Platform")\nif part then\n  local base = part.Position.Y\n  local t = 0\n  while true do\n    t = t + 0.02\n    part.Position = Vector3.new(part.Position.X, base + math.sin(t) * 3, part.Position.Z)\n    task.wait(0.02)\n  end\nend'],
  ["Recipe: moving wall", "server", "Slide a part back and forth.", 'local part = workspace:FindFirstChild("Wall")\nif part then\n  local x0 = part.Position.X\n  local t = 0\n  while true do\n    t = t + 0.01\n    part.Position = Vector3.new(x0 + math.sin(t) * 20, part.Position.Y, part.Position.Z)\n    task.wait(0.01)\n  end\nend'],
  ["Recipe: countdown", "both", "Count down from 10.", 'for i = 10, 1, -1 do\n  print(i)\n  task.wait(1)\nend\nprint("GO!")'],
  ["Recipe: timed door", "both", "Open a wall for 3 seconds.", 'local wall = workspace:FindFirstChild("Door")\nif wall then\n  while true do\n    task.wait(5)\n    wall.Transparency = 0.8\n    wall.CanCollide = false\n    task.wait(3)\n    wall.Transparency = 0\n    wall.CanCollide = true\n  end\nend'],
  ["Recipe: spawn parts rain", "server", "Raining blocks from the sky.", 'while true do\n  local p = Instance.new("Part")\n  p.Position = Vector3.new(math.random(-40, 40), 60, math.random(-40, 40))\n  p.Color = Color3.fromRGB(math.random(80, 255), math.random(80, 255), math.random(80, 255))\n  p.Anchored = false\n  task.wait(0.5)\nend'],
  ["Recipe: health drain zone", "server", "Damage over time in a zone.", 'local zone = workspace:FindFirstChild("PoisonZone")\nif zone then\n  local hurting = false\n  zone.Touched:Connect(function() hurting = true end)\n  while true do\n    if hurting then\n      game.Players.LocalPlayer.Humanoid:TakeDamage(5)\n      hurting = false\n    end\n    task.wait(1)\n  end\nend'],
  ["Recipe: KO announcement", "server", "Announce every death.", 'local player = game.Players.LocalPlayer\nplayer.Humanoid.Died:Connect(function()\n  print(player.Name .. " was knocked out!")\n  task.wait(3)\nend)'],
  ["Recipe: speed boost pickup", "server", "Temporary speed boost.", 'local coil = workspace:FindFirstChild("SpeedCoil")\nif coil then\n  coil.Touched:Connect(function()\n    local hum = game.Players.LocalPlayer.Humanoid\n    hum.WalkSpeed = 40\n    task.wait(5)\n    hum.WalkSpeed = 16\n  end)\nend'],
  ["Recipe: shrinking platform", "server", "Platform shrinks every second.", 'local p = workspace:FindFirstChild("Platform")\nif p then\n  while p.Size.X > 1 do\n    task.wait(1)\n    p.Size = Vector3.new(p.Size.X - 1, p.Size.Y, p.Size.Z - 1)\n  end\nend'],
  ["Recipe: color maze walls", "server", "Randomize wall colors every 5s.", 'for _, child in ipairs(workspace:GetChildren()) do\n  if child.Name == "MazeWall" then\n    child.Color = Color3.fromRGB(math.random(60, 255), math.random(60, 255), math.random(60, 255))\n  end\nend'],
  ["Recipe: welcome message", "client", "Greet the local player by name.", 'local player = game.Players.LocalPlayer\nprint("Welcome, " .. player.Name .. "!")'],
  ["Recipe: boss health bar", "server", "Set up a tanky encounter.", 'local hum = game.Players.LocalPlayer.Humanoid\nhum.MaxHealth = 500\nhum.Health = 500\nprint("Boss mode ON")'],
  ["Recipe: instant respawn effects", "server", "React to death with a message.", 'local hum = game.Players.LocalPlayer.Humanoid\nhum.Died:Connect(function()\n  print("You will respawn in a moment...")\nend)'],
  ["Recipe: track health", "client", "Watch the health bar value.", 'local hum = game.Players.LocalPlayer.Humanoid\nhum.HealthChanged:Connect(function(hp)\n  print("HP: " .. hp)\nend)'],
];
for (const [name, ctx, desc, ex] of RECIPES) add(name, name, "Recipes", ctx, desc, ex);

/* ===================== OP admin command reference =================== */

const GAME_COMMANDS: [string, string, string][] = [
  [":speed <n>", "Set your WalkSpeed (try :speed 100).", ":speed 100"],
  [":jump <n>", "Set your JumpPower.", ":jump 150"],
  [":health <n>", "Set your Health.", ":health 200"],
  [":maxhealth <n>", "Set your MaxHealth.", ":maxhealth 500"],
  [":heal", "Full heal.", ":heal"],
  [":damage <n>", "Hurt yourself to test the health bar.", ":damage 30"],
  [":god", "Invincibility ON.", ":god"],
  [":ungod", "Invincibility OFF.", ":ungod"],
  [":kill", "Kill yourself (dramatic).", ":kill"],
  [":respawn", "Back to the spawn pad.", ":respawn"],
  [":tp <x> <y> <z>", "Teleport to coordinates.", ":tp 0 100 0"],
  [":goto <bot>", "Teleport next to a bot.", ":goto NoobSlayer42"],
  [":bots <n>", "Set the number of bots.", ":bots 8"],
  [":kick <bot>", "Remove a bot from the server.", ":kick xX_Builder_Xx"],
  [":ban <bot>", "Ban a bot forever.", ":ban CoolKat"],
  [":give <tool>", "Equip sword / speedcoil / gravitycoil.", ":give sword"],
  [":tools", "List your backpack tools.", ":tools"],
  [":drop", "Drop the equipped tool into the world.", ":drop"],
  [":clearbackpack", "Empty your Backpack (respawn refills it).", ":clearbackpack"],
  [":fly", "Fly mode — SPACE up, C down, WASD to fly.", ":fly"],
  [":unfly", "Fly mode off.", ":unfly"],
  [":flyspeed <n>", "Set fly speed in studs/s.", ":flyspeed 120"],
  [":emote <name>", "Play an animation on your character.", ":emote dance"],
  [":emotes", "List every emote.", ":emotes"],
  [":stopemote", "Stop the current emote.", ":stopemote"],
  [":time <0-24>", "Set the time of day.", ":time 22"],
  [":fog <n>", "Set fog distance in studs.", ":fog 200"],
  [":clear", "Clear the chat window.", ":clear"],
  [":cmds", "List every command in chat.", ":cmds"],
];
for (const [name, desc, ex] of GAME_COMMANDS) add(name, name, "Game commands (OP)", "both", `${desc} — type it in the game chat or the ~ console.`, `-- in game chat:\n${ex}`);

/* ====================== Tools (backpack) reference ================== */

add("Tool: Sword", "Backpack slot 1", "Tools", "both", "Click to slash — damages bots in front of you (34 per hit).", "-- press 1 in game, then click to swing\n-- combo: :speed 40 + sword = doom");
add("Tool: Speed Coil", "Backpack slot 2", "Tools", "both", "+75% walk speed while equipped.", "-- press 2 in game to equip");
add("Tool: Gravity Coil", "Backpack slot 3", "Tools", "both", "+35% jump power and slow, floaty falls.", "-- press 3 in game to equip");

/* ===================== Vector3 movement recipes ===================== */

const MOVE_RECIPES: [string, string, string][] = [
  ["Move: up", "Place a part higher.", "part.Position = Vector3.new(0, 50, 0)"],
  ["Move: to spawn", "Center of the world.", "part.Position = Vector3.new(0, 5, 0)"],
  ["Move: read then set", "Offset using the current position.", "local p = part.Position\npart.Position = Vector3.new(p.X + 10, p.Y, p.Z)"],
  ["Move: stage platform", "Classic obby spacing.", "part.Position = Vector3.new(0, 20, -100)"],
  ["Move: sky base", "High altitude.", "part.Position = Vector3.new(30, 120, 30)"],
  ["Move: underground", "Below the baseplate.", "part.Position = Vector3.new(0, -20, 0)"],
];
for (const [name, desc, ex] of MOVE_RECIPES) add(name, name, "Recipes · movement", "both", desc, ex);

/* ======================== Lighting time presets ===================== */

const TIME_PRESETS: [string, number, string][] = [
  ["Time: midnight", 0, "Deep night."],
  ["Time: dawn", 6.3, "Sunrise glow."],
  ["Time: morning", 9, "Bright morning."],
  ["Time: noon", 12, "Overhead sun."],
  ["Time: afternoon", 14, "Default Studio light."],
  ["Time: golden hour", 17.8, "Warm long shadows."],
  ["Time: sunset", 18.6, "Orange sky."],
  ["Time: dusk", 19.4, "Blue hour."],
  ["Time: night", 22, "Dark and moody."],
  ["Time: late night", 23.5, "Almost midnight."],
];
for (const [name, t, desc] of TIME_PRESETS) add(name, `game.Lighting.ClockTime = ${t}`, "Recipes · lighting", "both", desc, `game.Lighting.ClockTime = ${t}`);

const FOG_PRESETS: [string, number, string][] = [
  ["Fog: clear", 2000, "See everything."],
  ["Fog: misty", 800, "Default distance."],
  ["Fog: foggy", 400, "Cozy and close."],
  ["Fog: spooky", 220, "Horror vibes."],
  ["Fog: void", 90, "You can barely see."],
];
for (const [name, d, desc] of FOG_PRESETS) add(name, `game.Lighting.FogEnd = ${d}`, "Recipes · lighting", "both", desc, `game.Lighting.FogEnd = ${d}`);

const SPEED_PRESETS: [string, number, string][] = [
  ["WalkSpeed: slow", 6, "Sneaky."],
  ["WalkSpeed: walk", 16, "Roblox default."],
  ["WalkSpeed: brisk", 24, "Sprint default."],
  ["WalkSpeed: fast", 40, "Speed coil feel."],
  ["WalkSpeed: sonic", 100, "Very fast."],
  ["WalkSpeed: glitchy", 250, "Hold on."],
  ["WalkSpeed: max", 500, "Engine cap."],
];
for (const [name, s, desc] of SPEED_PRESETS) add(name, `humanoid.WalkSpeed = ${s}`, "Recipes · humanoid", "both", desc, `game.Players.LocalPlayer.Humanoid.WalkSpeed = ${s}`);

const JUMP_PRESETS: [string, number, string][] = [
  ["JumpPower: moon", 25, "Low gravity hops."],
  ["JumpPower: normal", 50, "Roblox default."],
  ["JumpPower: double", 75, "Coil boost."],
  ["JumpPower: super", 120, "Buildings cleared."],
  ["JumpPower: insane", 300, "Orbital."],
];
for (const [name, j, desc] of JUMP_PRESETS) add(name, `humanoid.JumpPower = ${j}`, "Recipes · humanoid", "both", desc, `game.Players.LocalPlayer.Humanoid.JumpPower = ${j}`);

const HEALTH_PRESETS: [string, number, string][] = [
  ["MaxHealth: fragile", 25, "One-shot territory."],
  ["MaxHealth: normal", 100, "Default health."],
  ["MaxHealth: tanky", 300, "Fights last longer."],
  ["MaxHealth: boss", 1000, "Raid boss."],
  ["MaxHealth: titan", 10000, "Basically unkillable."],
];
for (const [name, h, desc] of HEALTH_PRESETS) add(name, `humanoid.MaxHealth = ${h}`, "Recipes · humanoid", "both", desc, `local hum = game.Players.LocalPlayer.Humanoid\nhum.MaxHealth = ${h}\nhum.Health = ${h}`);

const TRANSPARENCY_PRESETS: [string, number, string][] = [
  ["Transparency: solid", 0, "Fully visible."],
  ["Transparency: ghost", 0.35, "Spooky."],
  ["Transparency: glass", 0.5, "Window."],
  ["Transparency: barely", 0.8, "Fading out."],
  ["Transparency: invisible", 1, "Gone (still collides!)."],
];
for (const [name, t, desc] of TRANSPARENCY_PRESETS) add(name, `part.Transparency = ${t}`, "Recipes · parts", "both", desc, `part.Transparency = ${t}`);

/* ============================ Tools API ============================== */
/* How to build equippable tools (sword, gun, medkit…).                */
/* Design tools visually with the Tool Creator (Insert ▸ Tool…), or     */
/* script them Roblox-style with these members.                         */

add("Instance.new(\"Tool\")", "Instance.new(\"Tool\")", "Tools", "server",
  "Create a tool from a script. Put it in StarterPack so every player gets one on spawn.",
  `local tool = Instance.new("Tool")
tool.Name = "Magic Wand"
tool.RequiresHandle = true
tool.Parent = game.StarterPack`);

add("Tool.Handle", "tool.Handle", "Tools", "server",
  "The part the player holds. In this engine the held mesh is built for you (Tool Creator design or a default grip) — scripts connect events instead of modeling the handle.",
  `-- the handle visual is automatic — name one "Handle" in the
-- Tool Creator to design it. Script the behavior instead:
local tool = Instance.new("Tool")
tool.Name = "Magic Wand"
tool.ToolTip = "Click for magic"
tool.Parent = game.StarterPack`);

add("Tool.Equipped", "tool.Equipped:Connect(fn)", "Tools", "both",
  "Fires when the player pulls the tool out (number key or click). Great for stats and effects.",
  `tool.Equipped:Connect(function()
  local hum = game.Players.LocalPlayer.Humanoid
  hum.WalkSpeed = 28 -- faster while holding it
  print("equipped!")
end)`);

add("Tool.Unequipped", "tool.Unequipped:Connect(fn)", "Tools", "both",
  "Fires when the player puts the tool away. Reset any stat changes you made in Equipped.",
  `tool.Unequipped:Connect(function()
  local hum = game.Players.LocalPlayer.Humanoid
  hum.WalkSpeed = 16 -- back to normal
end)`);

add("Tool.Activated", "tool.Activated:Connect(fn)", "Tools", "both",
  "Fires every left-click while the tool is held — swings, shots, heals all start here.",
  `tool.Activated:Connect(function()
  print("swish!")
end)`);

add("Tool.Deactivated", "tool.Deactivated:Connect(fn)", "Tools", "both",
  "Fires when the mouse button is released — charge-up weapons listen to this.",
  `tool.Deactivated:Connect(function()
  print("released")
end)`);

add("Tool.RequiresHandle", "tool.RequiresHandle = true", "Tools", "server",
  "When true the tool needs a Handle part to equip. Set false for effect-only tools.",
  `tool.RequiresHandle = false -- invisible helper tool`);

add("Tool.CanBeDropped", "tool.CanBeDropped = false", "Tools", "server",
  "Whether pressing Backspace drops the tool on the ground.",
  `tool.CanBeDropped = false -- keep it forever`);

add("Tool.ToolTip", "tool.ToolTip = \"+40 HP per click\"", "Tools", "server",
  "The hint text shown when hovering the tool's backpack slot.",
  `tool.ToolTip = "+40 HP per click"`);

add("Tool.Grip", "tool.Grip = CFrame.new(0, 0, 1.5)", "Tools", "server",
  "Position/rotation of the Handle in the character's right hand. Accepted for script portability — the engine computes a natural grip automatically.",
  `tool.Grip = CFrame.new(0, -0.4, 1.5) * CFrame.Angles(math.rad(90), 0, 0) -- accepted, grip is auto here`);

add("Humanoid:EquipTool", "humanoid:EquipTool(tool)", "Tools", "both",
  "Force-equip a tool onto a character from code (the :give admin command does this).",
  `local hum = game.Players.LocalPlayer.Humanoid
local sword = game.StarterPack:FindFirstChild("Sword")
if sword then hum:EquipTool(sword) end`);

add("Humanoid.UnequipTools", "humanoid:UnequipTools()", "Tools", "both",
  "Put away whatever the player is holding.",
  `hum:UnequipTools()`);

add("Backpack", "player.Backpack", "Tools", "client",
  "The folder holding the player's unequipped tools. Listen for new ones with ChildAdded.",
  `local backpack = game.Players.LocalPlayer.Backpack
backpack.ChildAdded:Connect(function(item)
  print("picked up: " .. item.Name)
end)`);

add("StarterPack", "game.StarterPack", "Tools", "server",
  "Tools here are copied into every player's Backpack when they spawn. The Tool Creator adds here.",
  `tool.Parent = game.StarterPack`);

add("Recipe: speed + heal wand", "", "Tools", "both",
  "Full tool pattern: create from a script, StarterPack handout, stat boost while held, action on click.",
  `local tool = Instance.new("Tool")
tool.Name = "Med Wand"
tool.ToolTip = "+25 HP per click"
tool.Parent = game.StarterPack

local hum = game.Players.LocalPlayer.Humanoid
local base = hum.WalkSpeed

tool.Equipped:Connect(function()
  hum.WalkSpeed = base + 8
end)

tool.Unequipped:Connect(function()
  hum.WalkSpeed = base
end)

tool.Activated:Connect(function()
  hum.Health = math.min(hum.MaxHealth, hum.Health + 25)
  print("healed!")
end)`);

add("Recipe: dance rod", "", "Tools", "client",
  "Tool + animation together: click while holding to strike a pose.",
  `local tool = Instance.new("Tool")
tool.Name = "Dance Rod"
tool.ToolTip = "Click to dance"
tool.Parent = game.StarterPack

local hum = game.Players.LocalPlayer.Humanoid

tool.Activated:Connect(function()
  local track = hum:LoadAnimation("Dance")
  track:Play()
end)`);

/* ===================== Animator / AnimationTrack ==================== */
/* How Roblox plays animations: an Animation holds an AnimationId, the    */
/* Humanoid's Animator loads it into an AnimationTrack, and the track    */
/* plays/blends on the character. Draw animations in the Animation       */
/* editor, save them on a rig, then load them by name here.              */

add("Humanoid.Animator", "humanoid.Animator", "Animation", "client",
  "The object that plays animations on a character (a child of the Humanoid, like Roblox).",
  `local hum = game.Players.LocalPlayer.Humanoid
local animator = hum:FindFirstChildOfClass("Animator")
print(animator.Name) -- Animator`);

add("Instance.new(\"Animation\")", "Instance.new(\"Animation\")", "Animation", "both",
  "Create an Animation object. Set .AnimationId to a saved animation name (or rbxassetid://Dance for a built-in emote).",
  `local anim = Instance.new("Animation")
anim.AnimationId = "rbxassetid://Dance"`);

add("Animation.AnimationId", "anim.AnimationId = \"rbxassetid://Dance\"", "Animation", "both",
  "Which animation to load — an animation saved on a rig in the Animation editor, or a built-in emote (Dance, Wave, Cheer, Point, Sit, Robot, Spin, Headbang, Zombie, Jacks...).",
  `local anim = Instance.new("Animation")
anim.AnimationId = "Wave" -- saved animations + built-in emotes both work`);

add("Animator:LoadAnimation", "animator:LoadAnimation(anim)", "Animation", "both",
  "Load an Animation (or a name string) and get an AnimationTrack back. The track is NOT playing yet — call track:Play().",
  `local hum = game.Players.LocalPlayer.Humanoid
local animator = hum:FindFirstChildOfClass("Animator")
local track = animator:LoadAnimation("Dance")
track:Play()`);

add("Humanoid:LoadAnimation", "humanoid:LoadAnimation(anim)", "Animation", "both",
  "Shortcut — Humanoid forwards LoadAnimation to its Animator, exactly like Roblox.",
  `local hum = game.Players.LocalPlayer.Humanoid
local track = hum:LoadAnimation("Wave")
track:Play()`);

add("AnimationTrack:Play", "track:Play(fadeTime = 0.1, weight = 1, speed = 1)", "Animation", "both",
  "Start the track. fadeTime is how long it blends in, weight is how strongly it wins blended limbs, speed scales playback.",
  `local track = humanoid:LoadAnimation("Cheer")
track:Play(0.3, 1, 1.5) -- slow fade-in, 1.5x speed`);

add("AnimationTrack:Stop", "track:Stop(fadeTime = 0.1)", "Animation", "both",
  "Stop a playing track, fading out over fadeTime seconds. Fires track.Stopped.",
  `track:Stop(0.25)`);

add("AnimationTrack:AdjustSpeed", "track:AdjustSpeed(n)", "Animation", "both",
  "Change playback speed while playing (1 = normal, 2 = double, 0.5 = slow-mo, negative rewinds).",
  `track:Play()
track:AdjustSpeed(2) -- double time`);

add("AnimationTrack:AdjustWeight", "track:AdjustWeight(n)", "Animation", "both",
  "Change the blend weight while playing — mix two tracks over the same limbs.",
  `track:AdjustWeight(0.5) -- blend at half strength`);

add("AnimationTrack.Looped", "track.Looped = true", "Animation", "both",
  "Whether the track repeats forever. Set BEFORE :Play() for saved animations, or mid-play to change the behavior.",
  `local track = humanoid:LoadAnimation("Wave")
track.Looped = true
track:Play()`);

add("AnimationTrack.Speed", "track.Speed = 2", "Animation", "both",
  "Read or set the playback speed (same as AdjustSpeed but as a property).",
  `print(track.Speed) -- 1
track.Speed = 2`);

add("AnimationTrack.Priority", "track.Priority = Enum.AnimationPriority.Action", "Animation", "both",
  "Which track wins a limb: Core (0) < Idle (1) < Movement (2) < Action (3). Emotes play at Action so they beat the walk cycle.",
  `track.Priority = Enum.AnimationPriority.Action`);

add("AnimationTrack.TimePosition", "track.TimePosition = 0.5", "Animation", "both",
  "Where in the animation the playhead is, in seconds. Set it to seek.",
  `print(track.TimePosition)
track.TimePosition = 0 -- rewind`);

add("AnimationTrack.IsPlaying", "track.IsPlaying", "Animation", "both",
  "True while the track is playing.",
  `if track.IsPlaying then
  print("still going")
end`);

add("AnimationTrack.Length", "track.Length", "Animation", "both",
  "Duration of the animation in seconds.",
  `print("dance lasts " .. track.Length .. "s")`);

add("AnimationTrack.Name", "track.Name", "Animation", "both",
  "The animation's name (\"Dance\", \"Wave\"...).",
  `print(track.Name)`);

add("AnimationTrack.WeightCurrent", "track.WeightCurrent", "Animation", "both",
  "The current blend weight (eases toward the target when you AdjustWeight).",
  `print(track.WeightCurrent)`);

add("AnimationTrack.Stopped", "track.Stopped:Connect(fn)", "Animation", "both",
  "Fires when the track stops — by :Stop() or by reaching its natural end.",
  `track.Stopped:Connect(function()
  print("dance over, back to walking")
end)`);

add("AnimationTrack.DidLoop", "track.DidLoop:Connect(fn)", "Animation", "both",
  "Fires every time a looping track wraps back to the start — great for step sounds and effects per cycle.",
  `track.DidLoop:Connect(function()
  print("one full spin!")
end)`);

add("Recipe: emote on touch", "", "Animation", "both",
  "Classic dance floor — the player dances while standing on the part.",
  `local part = workspace:FindFirstChild("DanceFloor")
if part then
  local hum = game.Players.LocalPlayer.Humanoid
  local track = nil
  part.Touched:Connect(function()
    if not track then
      track = hum:LoadAnimation("Dance")
      track.Looped = true
      track:Play()
    end
  end)
end`);

add("Recipe: emote then callback", "", "Animation", "both",
  "Play a one-shot animation and run code when it finishes.",
  `local hum = game.Players.LocalPlayer.Humanoid
local track = hum:LoadAnimation("Cheer")
track:Play()
track.Stopped:Connect(function()
  print("done cheering — +10 points")
end)`);

add("Recipe: emote speed control", "", "Animation", "both",
  "Speed an animation up or slow it down live — a speed-boosted dance.",
  `local track = humanoid:LoadAnimation("Robot")
track.Looped = true
track:Play()
for i = 1, 4 do
  task.wait(1)
  track:AdjustSpeed(i) -- faster each second
end`);

/* ===================== Chat emotes (/e) reference ==================== */

const CHAT_EMOTES: [string, string][] = [
  ["/e dance", "\U0001F483 Dance"],
  ["/e wave", "\U0001F44B Wave"],
  ["/e cheer", "\U0001F44F Cheer"],
  ["/e point", "\U0001F446 Point"],
  ["/e sit", "\U0001F9CE Sit"],
  ["/e robot", "\U0001F916 Robot"],
  ["/e spin", "\U0001F501 Spin"],
  ["/e headbang", "\U0001F918 Headbang"],
  ["/e zombie", "\U0001F9DF Zombie"],
  ["/e jacks", "⭐ Jumping jacks"],
  ["/e laugh", "\U0001F602 Laugh (headbang)"],
  ["/e clap", "\U0001F44F Clap (cheer)"],
  ["/e stop", "Stop the current emote"],
];
for (const [name, label] of CHAT_EMOTES)
  add(name, name, "Chat emotes", "both", `${label} — anyone can type this in the game chat, no admin needed.`, `-- type in game chat:
${name}`);

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

export const LUAU_DOCS: DocEntry[] = D;

export const DOC_CATEGORIES: string[] = [...new Set(D.map((d) => d.category))];

export const DOC_COUNT = D.length;

export function searchDocs(query: string, category: string | null): DocEntry[] {
  const q = query.trim().toLowerCase();
  return D.filter((d) => {
    if (category && d.category !== category) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.sig.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q) ||
      d.example.toLowerCase().includes(q)
    );
  });
}

/* -------------------- script type comparison guide ------------------ */

export const SCRIPT_TYPE_GUIDE: { kind: string; color: string; where: string; runs: string; sees: string; useFor: string; example: string }[] = [
  {
    kind: "Script (server)",
    color: "#8ce6a5",
    where: "ServerScriptService",
    runs: "On the server — once per game",
    sees: "Everything, including ServerStorage & ServerScriptService",
    useFor: "Game rules, damage, spawning, saves, anti-cheat",
    example: '-- Script — the referee\nlocal lava = workspace:FindFirstChild("Lava")\nlava.Touched:Connect(function(hit)\n  local hum = game.Players.LocalPlayer.Humanoid\n  hum:TakeDamage(100)\nend)',
  },
  {
    kind: "LocalScript (client)",
    color: "#e8c76a",
    where: "StarterPlayerScripts",
    runs: "On the player's device — once per player",
    sees: "Everything EXCEPT ServerStorage & ServerScriptService",
    useFor: "Camera, UI, sounds, input, effects that only you see",
    example: '-- LocalScript — personal touches\nlocal player = game.Players.LocalPlayer\nprint("hi " .. player.Name)\ngame.Lighting.ClockTime = 22 -- night, just for you',
  },
  {
    kind: "ModuleScript",
    color: "#c39be8",
    where: "ReplicatedStorage",
    runs: "Only when required — in whoever required it",
    sees: "Whatever the requiring script sees",
    useFor: "Shared libraries: weapon stats, math helpers, config",
    example: '-- ModuleScript — a shared library\nlocal M = {}\n\nfunction M.damage(amount)\n  return amount * 2 -- crit!\nend\n\nreturn M\n\n-- anywhere else:\n-- local M = require(script.Parent.MyModule)\n-- print(M.damage(25))',
  },
];
