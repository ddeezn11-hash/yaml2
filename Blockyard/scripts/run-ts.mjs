/* Node loader hook: resolves extensionless relative imports to .ts files,
 * so the BloxScript integration test can run with plain `node`
 * (`--experimental-strip-types`) while Bun's transpiler is crashing on
 * bloxscript.ts (Bun 1.3.14 bug — crashes on committed HEAD too). */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./ts-hooks.mjs", import.meta.url), pathToFileURL("."));
