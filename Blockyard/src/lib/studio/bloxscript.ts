"use client";

/* ================================================================== */
/* BloxScript — a Luau-like scripting language for Blockyard Studio.  */
/*                                                                    */
/* Pipeline: tokenizer → recursive-descent parser → async tree-walk  */
/* interpreter with a play-mode host binding (game.Workspace, parts,  */
/* events, task.wait, Instance.new, Vector3/Color3/BrickColor...).    */
/* ================================================================== */

import type { LightingData, PartData, ScriptData, Vec3 } from "./types";
import { brickColorHex } from "./data";

/* ------------------------------ values ------------------------------ */

export interface BVector3 { __vec3: true; X: number; Y: number; Z: number }
export interface BColor3 { __color3: true; R: number; G: number; B: number }
export interface BTable { __table: true; arr: BValue[]; hash: Map<string, BValue> }
export interface BFunction {
  __fn: true;
  name?: string;
  params: string[];
  vararg: boolean;
  body: Stmt[];
  closure: Env;
  self?: BValue;
}
export interface BNative {
  __native: true;
  name: string;
  call: (args: BValue[], rt: RT) => Promise<BValue[]> | BValue[];
}
export type BInstanceKind = "game" | "service" | "part" | "model" | "script" | "player" | "baseplate" | "humanoid" | "animator" | "animation" | "track" | "tool" | "backpack";
export interface BInstance { __inst: true; kind: BInstanceKind; ref: string }
export interface BSignal { __signal: true; kind: "touched" | "heartbeat" | "playeradded" | "died" | "healthchanged" | "inputbegan" | "chat" | "stopped" | "diloop" | "equipped" | "unequipped" | "activated" | "deactivated" | "childadded"; partId?: string }
export interface BConnection { __conn: true; disconnect: () => void }

export type BValue = null | boolean | number | string | BTable | BFunction | BNative | BInstance | BVector3 | BColor3 | BSignal | BConnection;

const v3 = (x = 0, y = 0, z = 0): BVector3 => ({ __vec3: true, X: x, Y: y, Z: z });
const c3 = (r: number, g: number, b: number): BColor3 => ({ __color3: true, R: r, G: g, B: b });

export function bToString(v: BValue): string {
  if (v === null) return "nil";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  if (typeof v === "string") return v;
  if ("__vec3" in v) return `${trim(v.X)}, ${trim(v.Y)}, ${trim(v.Z)}`;
  if ("__color3" in v) return `${trim(v.R)}, ${trim(v.G)}, ${trim(v.B)}`;
  if ("__table" in v) return "table";
  if ("__fn" in v || "__native" in v) return `function: ${v.name ?? "anonymous"}`;
  if ("__inst" in v) return instName(v);
  if ("__signal" in v) return `Signal (${v.kind})`;
  return "?";
}
const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))));
const truthy = (v: BValue) => v !== null && v !== false;

function typeName(v: BValue): string {
  if (v === null) return "nil";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if ("__table" in v) return "table";
  if ("__fn" in v || "__native" in v) return "function";
  if ("__inst" in v) return "Instance";
  if ("__vec3" in v) return "Vector3";
  if ("__color3" in v) return "Color3";
  if ("__signal" in v) return "RBXScriptSignal";
  return "unknown";
}

class BError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}
class BreakSignal { }
class ReturnSignal { values: BValue[]; constructor(values: BValue[]) { this.values = values; } }
class AbortSignal_ { }

/* ------------------------------ host ------------------------------- */

export interface BloxHost {
  log: (level: "info" | "warn" | "error" | "success", text: string) => void;
  getParts: () => PartData[];
  getPart: (id: string) => PartData | null;
  updatePart: (id: string, patch: Partial<PartData>) => void;
  renamePart: (id: string, name: string) => void;
  createPart: (className: string) => string | null;
  createModel: (name: string) => string;
  deletePart: (id: string) => void;
  getModels: () => { id: string; name: string }[];
  /** True when the model is an animatable rig (limb-named parts) — exposes Humanoid/Animator. */
  modelIsRig?: (modelId: string) => boolean;
  getScripts: () => ScriptData[];
  getScript: (id: string) => ScriptData | null;
  getPlayer: () => { name: string; position: Vec3 } | null;
  setPlayerPosition?: (pos: Vec3) => void;
  setLighting: (patch: Partial<LightingData>) => void;
  getLighting: () => LightingData;
  setBaseplateColor: (hex: string) => void;
  /* Humanoid (health / movement) — implemented by the play controller */
  getHumanoid?: () => { health: number; maxHealth: number; walkSpeed: number; jumpPower: number } | null;
  setHumanoid?: (patch: { health?: number; maxHealth?: number; walkSpeed?: number; jumpPower?: number }) => void;
  humanoidTakeDamage?: (n: number) => void;
  /* Animation (Animator / AnimationTrack) — implemented by the play controller */
  listAnimations?: () => { name: string; source: string }[];
  /** rigId targets a MODEL rig (an NPC dummy) instead of the player character. */
  loadAnimation?: (nameOrId: string, rigId?: string) => { token: string; name: string; length: number; looped: boolean } | null;
  trackPlay?: (token: string, fade: number, weight: number, speed: number) => void;
  trackStop?: (token: string, fade: number) => void;
  trackAdjust?: (token: string, patch: { speed?: number; weight?: number }) => void;
  trackGet?: (token: string, prop: string) => number | boolean | string | null;
  trackSet?: (token: string, prop: string, value: number | boolean | string) => void;
  /* Tools (Tool / StarterPack / Backpack) — implemented by the play controller */
  createTool?: () => string | null;
  updateToolDef?: (id: string, patch: { name?: string; toolTip?: string; requiresHandle?: boolean; canBeDropped?: boolean }) => void;
  getToolDefs?: () => { id: string; name: string; toolTip?: string; requiresHandle?: boolean; canBeDropped?: boolean }[];
  carriedToolByName?: (name: string) => string | null;
  equipToolDef?: (id: string) => boolean;
  unequipTools?: () => void;
  /** tool.Parent = StarterPack → hand the player a copy right away. */
  grantToolToBackpack?: (id: string) => boolean;
}

/* ----------------------------- tokenizer ---------------------------- */

type TokType = "num" | "str" | "name" | "kw" | "op" | "eof";
interface Token { type: TokType; v: string; line: number }

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    // comments
    if (c === "-" && src[i + 1] === "-") {
      if (src[i + 2] === "[" && src[i + 3] === "[") {
        const end = src.indexOf("]]", i + 4);
        const chunk = src.slice(i, end < 0 ? n : end);
        for (const ch of chunk) if (ch === "\n") line++;
        i = end < 0 ? n : end + 2;
        continue;
      }
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? n : nl;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXeE.+-]/.test(src[j])) {
        // stop +/- unless right after e/E
        if ((src[j] === "+" || src[j] === "-") && !/[eE]/.test(src[j - 1] ?? "")) break;
        j++;
      }
      const text = src.slice(i, j);
      const value = Number(text);
      if (!isFinite(value)) throw new BError(`malformed number near '${text}'`, line);
      toks.push({ type: "num", v: text, line });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") {
          const e = src[j + 1];
          out += e === "n" ? "\n" : e === "t" ? "\t" : e === "\\" ? "\\" : e === '"' ? '"' : e === "'" ? "'" : e ?? "";
          j += 2;
        } else {
          if (src[j] === "\n") line++;
          out += src[j];
          j++;
        }
      }
      toks.push({ type: "str", v: out, line });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      toks.push({ type: KEYWORDS.has(word) ? "kw" : "name", v: word, line });
      i = j;
      continue;
    }
    // operators
    const three = src.slice(i, i + 3);
    if (three === "...") { toks.push({ type: "op", v: "...", line }); i += 3; continue; }
    const two = src.slice(i, i + 2);
    if (["==", "~=", "<=", ">=", "..", "//", "+=", "-=", "*=", "/="].includes(two)) {
      toks.push({ type: "op", v: two, line });
      i += 2;
      continue;
    }
    if ("+-*/%^#<>=(){}[];:,.".includes(c)) {
      toks.push({ type: "op", v: c, line });
      i++;
      continue;
    }
    throw new BError(`unexpected symbol '${c}'`, line);
  }
  toks.push({ type: "eof", v: "<eof>", line });
  return toks;
}

/* ------------------------------- AST ------------------------------- */

export type Expr =
  | { t: "num"; v: number; line: number }
  | { t: "str"; v: string; line: number }
  | { t: "bool"; v: boolean; line: number }
  | { t: "nil"; line: number }
  | { t: "vararg"; line: number }
  | { t: "var"; name: string; line: number }
  | { t: "bin"; op: string; a: Expr; b: Expr; line: number }
  | { t: "un"; op: string; a: Expr; line: number }
  | { t: "index"; obj: Expr; key: Expr; line: number }
  | { t: "dot"; obj: Expr; name: string; line: number }
  | { t: "call"; fn: Expr; args: Expr[]; self: Expr | null; line: number }
  | { t: "func"; func: BFunctionSeed; line: number }
  | { t: "table"; entries: { key: Expr | null; value: Expr; name: string | null }[]; line: number };

export interface BFunctionSeed { params: string[]; vararg: boolean; body: Stmt[]; name?: string }

export type Stmt =
  | { t: "local"; names: string[]; vararg: boolean; exprs: Expr[]; line: number }
  | { t: "assign"; targets: AssignTarget[]; exprs: Expr[]; line: number }
  | { t: "expr"; e: Expr; line: number }
  | { t: "if"; clauses: { cond: Expr; body: Stmt[] }[]; orelse: Stmt[] | null; line: number }
  | { t: "while"; cond: Expr; body: Stmt[]; line: number }
  | { t: "repeat"; body: Stmt[]; cond: Expr; line: number }
  | { t: "fornum"; name: string; from: Expr; to: Expr; step: Expr | null; body: Stmt[]; line: number }
  | { t: "forin"; names: string[]; exprs: Expr[]; body: Stmt[]; line: number }
  | { t: "return"; exprs: Expr[]; line: number }
  | { t: "break"; line: number }
  | { t: "localfunc"; name: string; func: BFunctionSeed; line: number };

export type AssignTarget = { k: "var"; name: string; line: number } | { k: "index"; obj: Expr; key: Expr; line: number } | { k: "dot"; obj: Expr; name: string; line: number };

/* ------------------------------- parser ---------------------------- */

class Parser {
  private toks: Token[];
  private pos = 0;
  constructor(src: string) {
    this.toks = tokenize(src);
  }
  private peek(o = 0): Token { return this.toks[Math.min(this.pos + o, this.toks.length - 1)]; }
  private next(): Token { return this.toks[this.pos++]; }
  private check(v: string): boolean {
    const t = this.peek();
    return (t.type === "op" || t.type === "kw") && t.v === v;
  }
  private accept(v: string): boolean {
    if (this.check(v)) { this.pos++; return true; }
    return false;
  }
  private expect(v: string): Token {
    if (!this.check(v)) throw new BError(`'${v}' expected near '${this.peek().v}'`, this.peek().line);
    return this.next();
  }
  private expectName(): string {
    const t = this.peek();
    if (t.type !== "name") throw new BError(`name expected near '${t.v}'`, t.line);
    this.pos++;
    return t.v;
  }

  parseChunk(): Stmt[] {
    const body: Stmt[] = [];
    while (this.peek().type !== "eof") body.push(this.parseStmt());
    return body;
  }

  private parseBlockUntil(...enders: string[]): Stmt[] {
    const body: Stmt[] = [];
    for (;;) {
      const t = this.peek();
      if (t.type === "eof") throw new BError(`'<eof>' expected before '${t.v}'`, t.line);
      if ((t.type === "kw" || t.type === "op") && enders.includes(t.v)) return body;
      body.push(this.parseStmt());
    }
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.type === "kw") {
      switch (t.v) {
        case "local": {
          this.next();
          if (this.check("function")) {
            this.next();
            const name = this.expectName();
            const func = this.parseFuncBody(name);
            return { t: "localfunc", name, func, line };
          }
          const names = [this.expectName()];
          let vararg = false;
          while (this.accept(",")) {
            if (this.accept("...")) { vararg = true; break; }
            names.push(this.expectName());
          }
          const exprs: Expr[] = [];
          if (this.accept("=")) {
            exprs.push(this.parseExpr());
            while (this.accept(",")) exprs.push(this.parseExpr());
          }
          return { t: "local", names, vararg, exprs, line };
        }
        case "if": {
          this.next();
          const clauses: { cond: Expr; body: Stmt[] }[] = [];
          const cond = this.parseExpr();
          this.expect("then");
          clauses.push({ cond, body: this.parseBlockUntil("elseif", "else", "end") });
          while (this.check("elseif")) {
            this.next();
            const c2 = this.parseExpr();
            this.expect("then");
            clauses.push({ cond: c2, body: this.parseBlockUntil("elseif", "else", "end") });
          }
          let orelse: Stmt[] | null = null;
          if (this.accept("else")) orelse = this.parseBlockUntil("end");
          this.expect("end");
          return { t: "if", clauses, orelse, line };
        }
        case "while": {
          this.next();
          const cond = this.parseExpr();
          this.expect("do");
          const body = this.parseBlockUntil("end");
          this.expect("end");
          return { t: "while", cond, body, line };
        }
        case "repeat": {
          this.next();
          const body = this.parseBlockUntil("until");
          this.expect("until");
          const cond = this.parseExpr();
          return { t: "repeat", body, cond, line };
        }
        case "for": {
          this.next();
          const first = this.expectName();
          if (this.accept("=")) {
            const from = this.parseExpr();
            this.expect(",");
            const to = this.parseExpr();
            let step: Expr | null = null;
            if (this.accept(",")) step = this.parseExpr();
            this.expect("do");
            const body = this.parseBlockUntil("end");
            this.expect("end");
            return { t: "fornum", name: first, from, to, step, body, line };
          }
          const names = [first];
          while (this.accept(",")) names.push(this.expectName());
          this.expect("in");
          const exprs = [this.parseExpr()];
          while (this.accept(",")) exprs.push(this.parseExpr());
          this.expect("do");
          const body = this.parseBlockUntil("end");
          this.expect("end");
          return { t: "forin", names, exprs, body, line };
        }
        case "function": {
          this.next();
          // function a.b.c() or a:b()
          let obj: Expr | null = null;
          let name = this.expectName();
          let self: Expr | null = null;
          while (this.check(".") || this.check(":")) {
            const isColon = this.peek().v === ":";
            this.next();
            if (obj === null) obj = { t: "var", name, line };
            else obj = { t: "dot", obj, name, line };
            if (isColon && self === null) self = obj;
            name = this.expectName();
          }
          const func = this.parseFuncBody(name);
          if (self) func.params.unshift("self");
          const target: AssignTarget =
            obj === null
              ? { k: "var", name, line }
              : { k: "dot", obj, name, line };
          const fnExpr: Expr = { t: "func", func, line };
          return { t: "assign", targets: [target], exprs: [fnExpr], line };
        }
        case "return": {
          this.next();
          const exprs: Expr[] = [];
          if (!this.check("end") && !this.check("else") && !this.check("elseif") && !this.check("until") && this.peek().type !== "eof" && !this.check(";")) {
            exprs.push(this.parseExpr());
            while (this.accept(",")) exprs.push(this.parseExpr());
          }
          this.accept(";");
          return { t: "return", exprs, line };
        }
        case "break":
          this.next();
          this.accept(";");
          return { t: "break", line };
        case "do": {
          this.next();
          const body = this.parseBlockUntil("end");
          this.expect("end");
          return { t: "if", clauses: [{ cond: { t: "bool", v: true, line }, body }], orelse: null, line };
        }
      }
    }
    // expression / assignment
    const first = this.parseSuffixed();
    if (this.check("=") || this.check(",") || this.check("+=") || this.check("-=") || this.check("*=") || this.check("/=")) {
      // compound assignment sugar
      const compound = this.peek().v;
      if (["+=", "-=", "*=", "/="].includes(compound)) {
        this.next();
        const rhs = this.parseExpr();
        const binOp = compound[0];
        const expr: Expr = { t: "bin", op: binOp, a: first, b: rhs, line };
        const target = this.toTarget(first);
        return { t: "assign", targets: [target], exprs: [expr], line };
      }
      const targets = [this.toTarget(first)];
      while (this.accept(",")) targets.push(this.toTarget(this.parseSuffixed()));
      this.expect("=");
      const exprs = [this.parseExpr()];
      while (this.accept(",")) exprs.push(this.parseExpr());
      return { t: "assign", targets, exprs, line };
    }
    this.accept(";");
    return { t: "expr", e: first, line };
  }

  private toTarget(e: Expr): AssignTarget {
    if (e.t === "var") return { k: "var", name: e.name, line: e.line };
    if (e.t === "dot") return { k: "dot", obj: e.obj, name: e.name, line: e.line };
    if (e.t === "index") return { k: "index", obj: e.obj, key: e.key, line: e.line };
    throw new BError("cannot assign to this expression", e.line);
  }

  private parseFuncBody(name?: string): BFunctionSeed & { selfParam?: boolean } {
    this.expect("(");
    const params: string[] = [];
    let vararg = false;
    if (!this.check(")")) {
      do {
        if (this.accept("...")) { vararg = true; break; }
        params.push(this.expectName());
      } while (this.accept(","));
    }
    this.expect(")");
    const body = this.parseBlockUntil("end");
    this.expect("end");
    return { params, vararg, body, name };
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    const line = t.line;
    if (t.type === "num") { this.next(); return { t: "num", v: Number(t.v), line }; }
    if (t.type === "str") { this.next(); return { t: "str", v: t.v, line }; }
    if (t.type === "kw") {
      if (t.v === "true") { this.next(); return { t: "bool", v: true, line }; }
      if (t.v === "false") { this.next(); return { t: "bool", v: false, line }; }
      if (t.v === "nil") { this.next(); return { t: "nil", line }; }
      if (t.v === "function") { this.next(); return { t: "func", func: this.parseFuncBody(), line }; }
    }
    if (t.type === "op") {
      if (t.v === "...") { this.next(); return { t: "vararg", line }; }
      if (t.v === "{") return this.parseTable();
      if (t.v === "(") {
        this.next();
        const e = this.parseExpr();
        this.expect(")");
        return e;
      }
    }
    if (t.type === "name") { this.next(); return { t: "var", name: t.v, line }; }
    throw new BError(`unexpected symbol near '${t.v}'`, line);
  }

  private parseSuffixed(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && t.v === ".") {
        this.next();
        const name = this.expectName();
        e = { t: "dot", obj: e, name, line: t.line };
      } else if (t.type === "op" && t.v === "[") {
        this.next();
        const key = this.parseExpr();
        this.expect("]");
        e = { t: "index", obj: e, key, line: t.line };
      } else if (t.type === "op" && t.v === "(") {
        this.next();
        const args = this.parseArgs();
        e = { t: "call", fn: e, args, self: null, line: t.line };
      } else if (t.type === "op" && t.v === ":") {
        this.next();
        const name = this.expectName();
        // method call — parse args, self becomes obj
        this.expect("(");
        const args = this.parseArgs();
        e = { t: "call", fn: { t: "dot", obj: e, name, line: t.line }, args, self: e, line: t.line };
      } else if (t.type === "str") {
        // f"string" sugar
        this.next();
        e = { t: "call", fn: e, args: [{ t: "str", v: t.v, line: t.line }], self: null, line: t.line };
      } else {
        return e;
      }
    }
  }

  private parseArgs(): Expr[] {
    const args: Expr[] = [];
    if (!this.check(")")) {
      do {
        args.push(this.parseExpr());
      } while (this.accept(","));
    }
    this.expect(")");
    return args;
  }

  private parseTable(): Expr {
    const line = this.peek().line;
    this.expect("{");
    const entries: { key: Expr | null; value: Expr; name: string | null }[] = [];
    while (!this.check("}")) {
      if (this.check("[")) {
        this.next();
        const key = this.parseExpr();
        this.expect("]");
        this.expect("=");
        entries.push({ key, value: this.parseExpr(), name: null });
      } else if (this.peek().type === "name" && this.peek(1).v === "=" && this.peek(1).type === "op") {
        const name = this.expectName();
        this.expect("=");
        entries.push({ key: null, value: this.parseExpr(), name });
      } else {
        entries.push({ key: null, value: this.parseExpr(), name: null });
      }
      if (!this.accept(",") && !this.accept(";")) break;
    }
    this.expect("}");
    return { t: "table", entries, line };
  }

  /* expression precedence climbing */
  parseExpr(): Expr { return this.parseOr(); }
  private parseOr(): Expr {
    let a = this.parseAnd();
    while (this.check("or")) { const line = this.next().line; const b = this.parseAnd(); a = { t: "bin", op: "or", a, b, line }; }
    return a;
  }
  private parseAnd(): Expr {
    let a = this.parseCompare();
    while (this.check("and")) { const line = this.next().line; const b = this.parseCompare(); a = { t: "bin", op: "and", a, b, line }; }
    return a;
  }
  private parseCompare(): Expr {
    let a = this.parseConcat();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && ["==", "~=", "<", ">", "<=", ">="].includes(t.v)) {
        this.next();
        const b = this.parseConcat();
        a = { t: "bin", op: t.v, a, b, line: t.line };
      } else return a;
    }
  }
  private parseConcat(): Expr {
    const a = this.parseAdd();
    if (this.check("..")) {
      const line = this.next().line;
      const b = this.parseConcat(); // right assoc
      return { t: "bin", op: "..", a, b, line };
    }
    return a;
  }
  private parseAdd(): Expr {
    let a = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.v === "+" || t.v === "-")) {
        this.next();
        const b = this.parseMul();
        a = { t: "bin", op: t.v, a, b, line: t.line };
      } else return a;
    }
  }
  private parseMul(): Expr {
    let a = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && ["*", "/", "//", "%"].includes(t.v)) {
        this.next();
        const b = this.parseUnary();
        a = { t: "bin", op: t.v, a, b, line: t.line };
      } else return a;
    }
  }
  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === "op" && (t.v === "-" || t.v === "not" || t.v === "#") ) {
      this.next();
      const a = this.parseUnary();
      return { t: "un", op: t.v === "not" ? "not" : t.v, a, line: t.line };
    }
    if (t.type === "kw" && t.v === "not") {
      this.next();
      const a = this.parseUnary();
      return { t: "un", op: "not", a, line: t.line };
    }
    return this.parsePow();
  }
  private parsePow(): Expr {
    const a = this.parseSuffixed();
    if (this.check("^")) {
      const line = this.next().line;
      const b = this.parseUnary(); // right assoc, binds tighter than unary on left
      return { t: "bin", op: "^", a, b, line };
    }
    return a;
  }
}

/* -------------------------------- env ------------------------------- */

export class Env {
  vars = new Map<string, BValue>();
  varargs: BValue[] = [];
  parent: Env | null;
  constructor(parent: Env | null = null) { this.parent = parent; }
  lookup(name: string): { env: Env } | null {
    if (this.vars.has(name)) return { env: this };
    return this.parent ? this.parent.lookup(name) : null;
  }
  get(name: string): BValue {
    const f = this.lookup(name);
    return f ? f.env.vars.get(name) ?? null : null;
  }
  setExisting(name: string, v: BValue): boolean {
    const f = this.lookup(name);
    if (!f) return false;
    f.env.vars.set(name, v);
    return true;
  }
  declare(name: string, v: BValue) { this.vars.set(name, v); }
}

/* ------------------------------- runtime --------------------------- */

interface Sleeper { resolve: () => void; reject: (e: unknown) => void; until: number }

export class RT {
  host: BloxHost;
  scriptName: string;
  /** Script kind — used to enforce client/server boundaries. */
  scriptKind: ScriptData["kind"] = "Script";
  aborted = false;
  steps = 0;
  deadline = 0;
  sleepers: Sleeper[] = [];
  globals = new Env();
  signals = new Map<string, BSignal>();
  moduleCache = new Map<string, BValue>();
  currentLine = 0;

  constructor(host: BloxHost, scriptName: string) {
    this.host = host;
    this.scriptName = scriptName;
    installGlobals(this);
  }

  sleep(seconds: number): Promise<BValue[]> {
    return new Promise((resolve, reject) => {
      this.sleepers.push({ resolve: () => resolve([]), reject, until: Date.now() + Math.max(0, seconds) * 1000 });
    });
  }

  tick(now: number) {
    if (!this.sleepers.length) return;
    const due = this.sleepers.filter((s) => s.until <= now);
    if (!due.length) return;
    this.sleepers = this.sleepers.filter((s) => s.until > now);
    // a yield happened — renew the instruction budget for the next burst
    this.deadline = now + 1500;
    for (const s of due) s.resolve();
  }

  abort() {
    this.aborted = true;
    const pending = this.sleepers;
    this.sleepers = [];
    for (const s of pending) s.reject(new AbortSignal_());
  }

  /** instruction + wall-clock budget guard */
  step(line: number) {
    this.currentLine = line;
    if (this.aborted) throw new AbortSignal_();
    this.steps++;
    if ((this.steps & 2047) === 0) {
      if (Date.now() > this.deadline) {
        this.aborted = true;
        throw new BError("script exhausted its instruction budget — possible infinite loop without task.wait()", line);
      }
    }
  }

  log(level: "info" | "warn" | "error" | "success", text: string) {
    this.host.log(level, `[${this.scriptName}] ${text}`);
  }

  err(message: string, line = this.currentLine): BError {
    return new BError(message, line);
  }
}

/* --------------------------- value helpers -------------------------- */

function newTable(): BTable { return { __table: true, arr: [], hash: new Map() }; }

function tableGet(t: BTable, key: BValue): BValue {
  if (typeof key === "number") {
    const i = Math.floor(key);
    if (i >= 1 && i <= t.arr.length && key === i) return t.arr[i - 1] ?? null;
    return t.hash.get(String(key)) ?? null;
  }
  if (typeof key === "string") return t.hash.get(key) ?? null;
  return t.hash.get(bToString(key)) ?? null;
}

function tableSet(t: BTable, key: BValue, v: BValue) {
  if (typeof key === "number") {
    const i = Math.floor(key);
    if (key === i && i >= 1) {
      if (i <= t.arr.length) t.arr[i - 1] = v;
      else if (i === t.arr.length + 1) t.arr.push(v);
      else t.hash.set(String(key), v);
      return;
    }
  }
  const k = typeof key === "string" ? key : bToString(key);
  if (v === null) t.hash.delete(k);
  else t.hash.set(k, v);
}

function hexOfColor(v: BValue): string | null {
  if (v && typeof v === "object" && "__color3" in v) {
    const h = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, "0");
    return `#${h(v.R)}${h(v.G)}${h(v.B)}`;
  }
  if (typeof v === "string") return v;
  return null;
}

/* ------------------------ instance wrappers ------------------------- */

function instName(inst: BInstance): string {
  const rt = currentRT!;
  if (inst.kind === "game") return "game";
  if (inst.kind === "player") return rt.host.getPlayer()?.name ?? "Player";
  if (inst.kind === "baseplate") return "Baseplate";
  if (inst.kind === "animator") return "Animator";
  if (inst.kind === "animation") return "Animation";
  if (inst.kind === "track") return String(rt.host.trackGet?.(inst.ref, "Name") ?? "AnimationTrack");
  if (inst.kind === "tool") return rt.host.getToolDefs?.().find((t) => t.id === inst.ref)?.name ?? "Tool";
  if (inst.kind === "backpack") return "Backpack";
  if (inst.kind === "part") {
    if (inst.ref === "__player__") return "HumanoidRootPart";
    return rt.host.getPart(inst.ref)?.name ?? "Part";
  }
  if (inst.kind === "model") return rt.host.getModels().find((m) => m.id === inst.ref)?.name ?? "Model";
  if (inst.kind === "script") return rt.host.getScript(inst.ref)?.name ?? "Script";
  return inst.ref; // service
}

function makeInst(kind: BInstanceKind, ref: string): BInstance { return { __inst: true, kind, ref }; }

/** current runtime — set during evaluate so native helpers can reach it */
let currentRT: RT | null = null;

function getSignal(rt: RT, kind: BSignal["kind"], partId?: string): BSignal {
  const key = `${kind}:${partId ?? ""}`;
  let s = rt.signals.get(key);
  if (!s) {
    s = { __signal: true, kind, partId };
    rt.signals.set(key, s);
  }
  return s;
}

/* signal handlers are stored on the signal object via a hidden map */
const signalHandlers = new WeakMap<BSignal, BFunction[]>();
function connectSignal(rt: RT, sig: BSignal, fn: BValue, line: number): BConnection {
  if (!fn || typeof fn !== "object" || !("__fn" in fn))
    throw rt.err(`expected function for ${sig.kind}:Connect`, line);
  const list = signalHandlers.get(sig) ?? [];
  list.push(fn as BFunction);
  signalHandlers.set(sig, list);
  if (sig.kind === "playeradded") {
    // fire immediately for the local player (single-player approximation)
    const player = makeInst("player", "LocalPlayer");
    queueMicrotask(() => { callFunction(fn as BFunction, [player], rt).catch(() => { }); });
  }
  return {
    __conn: true,
    disconnect: () => {
      const l = signalHandlers.get(sig);
      if (l) signalHandlers.set(sig, l.filter((f) => f !== fn));
    },
  };
}

export function getSignalHandlers(sig: BSignal): BFunction[] {
  return signalHandlers.get(sig) ?? [];
}

/* ------------------------- instance properties ---------------------- */

function instGetIndex(rt: RT, inst: BInstance, name: string, line: number): BValue {
  const H = rt.host;
  switch (inst.kind) {
    case "game": {
      if (name === "Workspace" || name === "workspace") return makeInst("service", "Workspace");
      if (["Players", "Lighting", "ReplicatedStorage", "ServerStorage", "StarterPlayer", "StarterGui", "StarterPack", "RunService", "ServerScriptService"].includes(name))
        return makeInst("service", name);
      if (name === "PlaceId" || name === "JobId") return 0;
      break;
    }
    case "service": {
      if (name === "Name") return inst.ref;
      if (name === "ClassName") return "Service";
      if (name === "Parent" && (inst.ref === "StarterPlayerScripts" || inst.ref === "StarterCharacterScripts"))
        return makeInst("service", "StarterPlayer");
      if (inst.ref === "Workspace" && name === "Baseplate") return makeInst("baseplate", "Baseplate");
      // StarterPlayer owns two script containers in the Explorer hierarchy.
      if (inst.ref === "StarterPlayer" && (name === "StarterPlayerScripts" || name === "StarterCharacterScripts"))
        return makeInst("service", name);
      // client/server boundary — like Roblox, LocalScripts cannot reach server-only containers
      if (rt.scriptKind === "LocalScript" && (inst.ref === "ServerStorage" || inst.ref === "ServerScriptService"))
        throw rt.err(`${inst.ref} is server-only — a LocalScript cannot access it (use a Script or ReplicatedStorage)`, line);
      const part = H.getParts().find((p) => !p.parentId && p.name === name);
      if (part) return makeInst("part", part.id);
      const model = H.getModels().find((m) => m.name === name);
      if (model) return makeInst("model", model.id);
      const script = H.getScripts().find((s) => s.parentId === inst.ref && s.name === name);
      if (script) return makeInst("script", script.id);
      // StarterPack holds the place's tools (by name, like Roblox)
      if (inst.ref === "StarterPack") {
        const tool = H.getToolDefs?.().find((t) => t.name === name);
        if (tool) return makeInst("tool", tool.id);
      }
      if (inst.ref === "Players") {
        if (name === "LocalPlayer") return makeInst("player", "LocalPlayer");
        if (name === "MaxPlayers") return 12;
      }
      if (inst.ref === "RunService" && name === "Heartbeat") return getSignal(rt, "heartbeat");
      if (inst.ref === "Players" && name === "PlayerAdded") return getSignal(rt, "playeradded");
      break;
    }
    case "model": {
      const part = H.getParts().find((p) => p.parentId === inst.ref && p.name === name);
      if (part) return makeInst("part", part.id);
      const script = H.getScripts().find((s) => s.parentId === inst.ref && s.name === name);
      if (script) return makeInst("script", script.id);
      // rig-like models (dummies) expose a Humanoid + Animator, like Roblox NPCs
      if (H.modelIsRig?.(inst.ref)) {
        if (name === "Humanoid") return makeInst("humanoid", inst.ref);
        if (name === "Animator") return makeInst("animator", inst.ref);
      }
      break;
    }
    case "part": {
      if (inst.ref === "__player__") {
        const p = H.getPlayer();
        if (name === "Name") return "HumanoidRootPart";
        if (name === "Humanoid") return makeInst("humanoid", "LocalPlayer");
        if (name === "Position" && p) return v3(p.position[0], p.position[1] + 2.5, p.position[2]);
        if (name === "Size") return v3(2, 5, 1);
        if (name === "ClassName" || name === "ClassNameView") return "Part";
        if (name === "Parent") return makeInst("player", "LocalPlayer");
        return null;
      }
      const d = H.getPart(inst.ref);
      if (!d) return null;
      switch (name) {
        case "Name": return d.name;
        case "ClassName": return d.isSpawn ? "SpawnLocation" : "Part";
        case "Position": return v3(d.position[0], d.position[1], d.position[2]);
        case "Size": return v3(d.size[0], d.size[1], d.size[2]);
        case "Color": case "Color3": {
          const hex = d.color.startsWith("#") ? d.color : brickColorHex(d.color);
          return c3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
        }
        case "BrickColor": {
          const tbl = newTable();
          tbl.hash.set("Name", d.color);
          return tbl;
        }
        case "Transparency": return d.transparency;
        case "Reflectance": return d.reflectance;
        case "Anchored": return d.anchored;
        case "CanCollide": return d.canCollide;
        case "Material": return d.material;
        case "Parent": return d.parentId ? makeInst("model", d.parentId) : makeInst("service", "Workspace");
        case "Touched": return getSignal(rt, "touched", d.id);
      }
      break;
    }
    case "baseplate": {
      if (name === "Name") return "Baseplate";
      if (name === "Size") return v3(512, 16, 512);
      if (name === "Position") return v3(0, -8, 0);
      if (name === "ClassName") return "Part";
      if (name === "Anchored") return true;
      if (name === "Parent") return makeInst("service", "Workspace");
      break;
    }
    case "script": {
      const s = H.getScript(inst.ref);
      if (!s) return null;
      if (name === "Name") return s.name;
      if (name === "Enabled") return s.enabled;
      if (name === "ClassName") return s.kind;
      if (name === "Parent") return makeInst("service", s.parentId);
      break;
    }
    case "player": {
      const p = H.getPlayer();
      if (name === "Name") return p?.name ?? "Player";
      if (name === "DisplayName") return p?.name ?? "Player";
      if (name === "UserId") return 1;
      if (name === "Character") return makeInst("part", "__player__");
      if (name === "Humanoid") return makeInst("humanoid", "LocalPlayer");
      if (name === "Backpack") return makeInst("backpack", "LocalPlayer");
      if (name === "Parent") return makeInst("service", "Players");
      break;
    }
    case "backpack": {
      // carried tools are children of the Backpack
      const carried = H.carriedToolByName?.(name);
      if (carried) return makeInst("tool", carried);
      if (name === "Name") return "Backpack";
      if (name === "ClassName") return "Backpack";
      if (name === "ChildAdded") return getSignal(rt, "childadded");
      if (name === "Parent") return makeInst("player", "LocalPlayer");
      break;
    }
    case "tool": {
      const def = H.getToolDefs?.().find((t) => t.id === inst.ref);
      if (!def) return null;
      if (name === "Name") return def.name;
      if (name === "ClassName") return "Tool";
      if (name === "ToolTip") return def.toolTip ?? "";
      if (name === "RequiresHandle") return def.requiresHandle ?? true;
      if (name === "CanBeDropped") return def.canBeDropped ?? true;
      if (name === "Enabled") return true;
      if (name === "Parent") return makeInst("service", "StarterPack");
      if (name === "Equipped") return getSignal(rt, "equipped", inst.ref);
      if (name === "Unequipped") return getSignal(rt, "unequipped", inst.ref);
      if (name === "Activated") return getSignal(rt, "activated", inst.ref);
      if (name === "Deactivated") return getSignal(rt, "deactivated", inst.ref);
      break;
    }
    case "humanoid": {
      // a model-bound Humanoid (an NPC dummy) — Health is cosmetic, the
      // interesting member is .Animator (and LoadAnimation works on it too)
      if (inst.ref !== "LocalPlayer") {
        if (name === "Name") return "Humanoid";
        if (name === "ClassName") return "Humanoid";
        if (name === "Health" || name === "MaxHealth") return 100;
        if (name === "WalkSpeed") return 16;
        if (name === "JumpPower" || name === "JumpHeight") return 50;
        if (name === "Animator") return makeInst("animator", inst.ref);
        if (name === "Parent") return makeInst("model", inst.ref);
        break;
      }
      const hum = H.getHumanoid?.() ?? { health: 100, maxHealth: 100, walkSpeed: 16, jumpPower: 50 };
      if (name === "Name") return "Humanoid";
      if (name === "ClassName") return "Humanoid";
      if (name === "Health") return hum.health;
      if (name === "MaxHealth") return hum.maxHealth;
      if (name === "WalkSpeed") return hum.walkSpeed;
      if (name === "JumpPower" || name === "JumpHeight") return hum.jumpPower;
      if (name === "Animator") return makeInst("animator", "LocalPlayer");
      if (name === "Parent") return makeInst("player", "LocalPlayer");
      if (name === "Died") return getSignal(rt, "died");
      if (name === "HealthChanged") return getSignal(rt, "healthchanged");
      break;
    }
    case "animator": {
      if (name === "Name") return "Animator";
      if (name === "ClassName") return "Animator";
      if (name === "Parent") return makeInst("humanoid", inst.ref);
      break;
    }
    case "animation": {
      // ref doubles as the AnimationId ("Dance" or "rbxassetid://Dance")
      if (name === "Name") return "Animation";
      if (name === "ClassName") return "Animation";
      if (name === "AnimationId") return inst.ref;
      if (name === "Parent") return null;
      break;
    }
    case "track": {
      if (name === "IsPlaying" || name === "Length" || name === "Looped" || name === "Speed" ||
          name === "Priority" || name === "TimePosition" || name === "WeightCurrent" || name === "Name") {
        return (H.trackGet?.(inst.ref, name) ?? null) as BValue;
      }
      if (name === "ClassName") return "AnimationTrack";
      if (name === "Stopped") return getSignal(rt, "stopped", inst.ref);
      if (name === "DidLoop") return getSignal(rt, "diloop", inst.ref);
      if (name === "Parent") {
        // rig tracks carry "<modelId>#<token>" — route back to that rig's Animator
        const hash = inst.ref.indexOf("#");
        return makeInst("animator", hash >= 0 ? inst.ref.slice(0, hash) : "LocalPlayer");
      }
      break;
    }
  }
  // methods
  const method = instMethod(rt, inst, name, line);
  if (method) return method;
  return null;
}

const BRICK_FALLBACK = "#a3a2a5";
function brickHex(name: string): string {
  // handled by engine data; small local fallback for common names
  const common: Record<string, string> = {
    "bright red": "#C4281C", "bright blue": "#0D69AC", "bright yellow": "#F5CD30",
    "bright green": "#4B974B", "medium stone grey": "#A3A2A5", "dark stone grey": "#635F62",
    "really red": "#FF0000", "really blue": "#0000FF", "new yeller": "#FFFF00",
    "institutional white": "#F8F8F8", "really black": "#111111", "white": "#F2F3F3",
  };
  return common[name.toLowerCase()] ?? BRICK_FALLBACK;
}

/** Animation id from an Animation instance or a raw name string. */
function animIdOf(v: BValue): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "__inst" in v && v.kind === "animation") return v.ref || null;
  return null;
}
const numOr = (v: BValue, d: number): number => (typeof v === "number" && isFinite(v) ? v : d);

function instMethod(rt: RT, inst: BInstance, name: string, _line: number): BNative | null {
  const H = rt.host;
  const mk = (fn: (args: BValue[]) => BValue | Promise<BValue>, label: string): BNative => ({
    __native: true, name: `${label}.${name}`, call: (args) => {
      const r = fn(args);
      return r instanceof Promise ? r.then((v) => [v]) : [r];
    },
  });
  const container = inst.kind === "service" || inst.kind === "model" || inst.kind === "part"
    || inst.kind === "backpack" || inst.kind === "humanoid" || inst.kind === "animator" || inst.kind === "tool";
  if (container && name === "FindFirstChild") {
    return mk(([, childName]) => {
      if (typeof childName !== "string") return null;
      const res = instGetIndex(rt, inst, childName, _line);
      return res;
    }, "Instance");
  }
  if (container && name === "WaitForChild") {
    return mk(([, childName]) => {
      if (typeof childName !== "string") return null;
      return instGetIndex(rt, inst, childName, _line);
    }, "Instance");
  }
  if (container && name === "GetChildren") {
    return mk(() => {
      const t = newTable();
      if (inst.kind === "service" && inst.ref === "Workspace") {
        for (const p of H.getParts()) if (!p.parentId) t.arr.push(makeInst("part", p.id));
        for (const m of H.getModels()) t.arr.push(makeInst("model", m.id));
        for (const s of H.getScripts()) if (s.parentId === inst.ref) t.arr.push(makeInst("script", s.id));
      } else if (inst.kind === "service" && inst.ref === "StarterPlayer") {
        t.arr.push(makeInst("service", "StarterPlayerScripts"));
        t.arr.push(makeInst("service", "StarterCharacterScripts"));
      } else if (inst.kind === "service") {
        for (const s of H.getScripts()) if (s.parentId === inst.ref) t.arr.push(makeInst("script", s.id));
        if (inst.ref === "StarterPack") {
          for (const def of H.getToolDefs?.() ?? []) t.arr.push(makeInst("tool", def.id));
        }
      } else if (inst.kind === "model") {
        for (const p of H.getParts()) if (p.parentId === inst.ref) t.arr.push(makeInst("part", p.id));
      } else if (inst.kind === "backpack") {
        for (const def of H.getToolDefs?.() ?? []) {
          if (H.carriedToolByName?.(def.name)) t.arr.push(makeInst("tool", def.id));
        }
      } else if (inst.kind === "part") {
        return t;
      }
      return t;
    }, "Instance");
  }
  if (inst.kind === "game" && name === "GetService") {
    return mk(([, svc]) => {
      if (typeof svc !== "string") return null;
      if (svc === "Workspace" || svc === "Players" || svc === "Lighting" || svc === "ReplicatedStorage" || svc === "ServerStorage" || svc === "StarterPlayer" || svc === "StarterGui" || svc === "StarterPack" || svc === "RunService" || svc === "ServerScriptService")
        return makeInst("service", svc);
      return null;
    }, "game");
  }
  if (inst.kind === "service" && inst.ref === "Players" && name === "GetPlayers") {
    return mk(() => {
      const t = newTable();
      t.arr.push(makeInst("player", "LocalPlayer"));
      return t;
    }, "Players");
  }
  if (inst.kind === "part" && name === "Destroy") {
    return mk(() => {
      if (inst.ref !== "__player__") H.deletePart(inst.ref);
      return null;
    }, "Part");
  }
  if (inst.kind === "player" && name === "Kick") {
    return mk(() => null, "Player");
  }
  if (inst.kind === "humanoid" && name === "EquipTool") {
    return mk(([, tool]) => {
      if (inst.ref !== "LocalPlayer") throw rt.err("EquipTool works on your own character, not an NPC dummy", _line);
      if (!tool || typeof tool !== "object" || !("__inst" in tool) || tool.kind !== "tool")
        throw rt.err("EquipTool expects a Tool (get one from StarterPack or Instance.new)", _line);
      const ok = H.equipToolDef?.(tool.ref) ?? false;
      if (!ok) throw rt.err("that Tool is not in the Backpack or StarterPack", _line);
      return null;
    }, "Humanoid");
  }
  if (inst.kind === "humanoid" && name === "UnequipTools") {
    return mk(() => {
      if (inst.ref === "LocalPlayer") H.unequipTools?.();
      return null;
    }, "Humanoid");
  }
  if (inst.kind === "humanoid" && name === "TakeDamage") {
    return mk(([, amount]) => {
      if (inst.ref !== "LocalPlayer") return null; // NPC health is cosmetic here
      const n = Number(amount);
      if (!isFinite(n)) return null;
      H.humanoidTakeDamage?.(Math.max(0, n));
      return null;
    }, "Humanoid");
  }
  if (inst.kind === "humanoid" && name === "Heal") {
    return mk(([, amount]) => {
      if (inst.ref !== "LocalPlayer") return null;
      const hum = H.getHumanoid?.();
      if (!hum) return null;
      const n = Number(amount);
      if (isFinite(n)) H.setHumanoid?.({ health: Math.min(hum.maxHealth, hum.health + n) });
      return null;
    }, "Humanoid");
  }
  if (inst.kind === "humanoid" && name === "MoveTo") {
    return mk(([, target]) => {
      // Blockyard approximation: teleport the character to the target point
      if (inst.ref !== "LocalPlayer") return null; // NPC pathfinding not supported yet
      if (target && typeof target === "object" && "__vec3" in target) {
        H.setPlayerPosition?.([target.X, target.Y, target.Z]);
      }
      return null;
    }, "Humanoid");
  }
  /* ---------------------- animation methods ---------------------- */
  if ((inst.kind === "animator" || inst.kind === "humanoid") && name === "LoadAnimation") {
    const label = inst.kind === "animator" ? "Animator" : "Humanoid";
    return mk(([, anim]) => {
      const id = animIdOf(anim);
      if (id === null) throw rt.err("LoadAnimation expects an Animation (set .AnimationId) or an animation name string", _line);
      // bound to an NPC rig (ref = model id) → animate that dummy, not the player
      const rigId = inst.ref === "LocalPlayer" ? undefined : inst.ref;
      const info = H.loadAnimation?.(id, rigId);
      if (!info) throw rt.err(`no animation named "${id}" — animations saved on rigs + built-in emotes (Dance, Wave, Cheer…)`, _line);
      return makeInst("track", info.token);
    }, label);
  }
  if (inst.kind === "humanoid" && name === "FindFirstChildOfClass") {
    return mk(([, cls]) => {
      if (cls === "Animator") return makeInst("animator", inst.ref);
      if (cls === "Humanoid") return makeInst("humanoid", inst.ref);
      return null;
    }, "Humanoid");
  }
  if (inst.kind === "track" && name === "Play") {
    return mk(([, fade, weight, speed]) => {
      H.trackPlay?.(inst.ref, numOr(fade, 0.1), numOr(weight, 1), numOr(speed, 1));
      return null;
    }, "AnimationTrack");
  }
  if (inst.kind === "track" && name === "Stop") {
    return mk(([, fade]) => {
      H.trackStop?.(inst.ref, numOr(fade, 0.1));
      return null;
    }, "AnimationTrack");
  }
  if (inst.kind === "track" && name === "AdjustSpeed") {
    return mk(([, n]) => {
      if (typeof n === "number" && isFinite(n)) H.trackAdjust?.(inst.ref, { speed: n });
      return null;
    }, "AnimationTrack");
  }
  if (inst.kind === "track" && name === "AdjustWeight") {
    return mk(([, n]) => {
      if (typeof n === "number" && isFinite(n)) H.trackAdjust?.(inst.ref, { weight: n });
      return null;
    }, "AnimationTrack");
  }
  if (inst.kind === "part" && (name === "GetPivot" || name === "PivotTo")) {
    if (name === "PivotTo") {
      return mk(([, cf]) => {
        const d = H.getPart(inst.ref);
        if (!d || !cf || typeof cf !== "object" || !("__vec3" in cf)) return null;
        H.updatePart(inst.ref, { position: [cf.X, cf.Y, cf.Z] });
        return null;
      }, "Part");
    }
    return mk(() => {
      const d = H.getPart(inst.ref);
      if (!d) return null;
      const t = newTable();
      t.hash.set("Position", v3(d.position[0], d.position[1], d.position[2]));
      return t;
    }, "Part");
  }
  return null;
}

function instSetIndex(rt: RT, inst: BInstance, name: string, value: BValue, line: number) {
  const H = rt.host;
  if (inst.kind === "tool") {
    // Roblox Tool properties — patch the live tool definition
    switch (name) {
      case "Name":
        if (typeof value === "string") H.updateToolDef?.(inst.ref, { name: value.slice(0, 50) });
        return;
      case "ToolTip":
        if (typeof value === "string") H.updateToolDef?.(inst.ref, { toolTip: value.slice(0, 120) });
        return;
      case "RequiresHandle":
        if (typeof value === "boolean") H.updateToolDef?.(inst.ref, { requiresHandle: value });
        return;
      case "CanBeDropped":
        if (typeof value === "boolean") H.updateToolDef?.(inst.ref, { canBeDropped: value });
        return;
      case "Grip": case "GripPos": case "GripForward": case "GripRight": case "GripUp": case "TextureId":
        // grip/texture are visual-only here — accepted so scripts don't error
        return;
      case "Parent":
        // parenting to StarterPack hands the player a copy right away
        // (and every respawn after); other parents are accepted as-is
        if (value && typeof value === "object" && "__inst" in value && (value.kind === "service" || value.kind === "game")) {
          if (value.kind !== "service" || value.ref === "StarterPack") H.grantToolToBackpack?.(inst.ref);
        }
        return;
    }
    return;
  }
  if (inst.kind === "animation") {
    // the AnimationId is stored on the instance ref
    if (name === "AnimationId" && typeof value === "string") inst.ref = value.trim();
    return;
  }
  if (inst.kind === "track") {
    const prop = name === "Weight" ? "WeightCurrent" : name;
    if (value !== null && ["Looped", "Speed", "TimePosition", "Priority", "WeightCurrent"].includes(prop)) {
      if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
        H.trackSet?.(inst.ref, prop, value);
      }
    }
    return;
  }
  if (inst.kind === "part") {
    if (inst.ref === "__player__") return;
    const d = H.getPart(inst.ref);
    if (!d) return;
    const patch: Partial<PartData> = {};
    switch (name) {
      case "Name": if (typeof value === "string") H.renamePart(inst.ref, value.slice(0, 50)); return;
      case "Position": case "CFrame": {
        if (!value || typeof value !== "object" || !("__vec3" in value)) throw rt.err(`${name} must be a Vector3/CFrame`, line);
        patch.position = [value.X, value.Y, value.Z];
        break;
      }
      case "Size": {
        if (!value || typeof value !== "object" || !("__vec3" in value)) throw rt.err("Size must be a Vector3", line);
        patch.size = [Math.max(0.05, value.X), Math.max(0.05, value.Y), Math.max(0.05, value.Z)];
        break;
      }
      case "Color": case "Color3": case "BrickColor": {
        const hex = hexOfColor(value) ?? (value && typeof value === "object" && "__table" in value ? tableGet(value, "Name") : null);
        if (typeof hex === "string") patch.color = hex.startsWith("#") ? hex : hex;
        break;
      }
      case "Transparency": if (typeof value === "number") patch.transparency = Math.min(1, Math.max(0, value)); break;
      case "Reflectance": if (typeof value === "number") patch.reflectance = Math.min(1, Math.max(0, value)); break;
      case "Anchored": if (typeof value === "boolean") patch.anchored = value; break;
      case "CanCollide": if (typeof value === "boolean") patch.canCollide = value; break;
      case "Material": if (typeof value === "string") patch.material = value; break;
      case "Parent": {
        if (value === null) { patch.parentId = null; }
        else if (value && typeof value === "object" && "__inst" in value) {
          if (value.kind === "service" && value.ref === "Workspace") patch.parentId = null;
          else if (value.kind === "model") patch.parentId = value.ref;
          else if (value.kind === "game") patch.parentId = null;
        }
        break;
      }
      default: return; // unknown properties are silently ignored (like Roblox warning)
    }
    H.updatePart(inst.ref, patch);
    return;
  }
  if (inst.kind === "baseplate") {
    if (name === "Color" || name === "Color3" || name === "BrickColor") {
      const hex = hexOfColor(value) ?? (typeof value === "string" ? value : null);
      if (hex) H.setBaseplateColor(hex.startsWith("#") ? hex : brickHex(hex));
    }
    return;
  }
  if (inst.kind === "service" && inst.ref === "Lighting") {
    const L: Partial<LightingData> = {};
    if (name === "Brightness" && typeof value === "number") L.brightness = value;
    else if (name === "ClockTime" && typeof value === "number") L.clockTime = Math.min(24, Math.max(0, value));
    else if (name === "FogEnd" && typeof value === "number") L.fogEnd = value;
    else if (name === "Ambient" && value && typeof value === "object" && "__color3" in value) L.ambient = (value.R + value.G + value.B) / 3;
    else return;
    H.setLighting(L);
    return;
  }
  if (inst.kind === "script" && name === "Enabled") {
    return; // runtime enable changes are not applied mid-play
  }
  if (inst.kind === "humanoid") {
    const num = typeof value === "number" && isFinite(value) ? value : null;
    if (num === null) return;
    if (name === "Health") H.setHumanoid?.({ health: Math.max(0, num) });
    else if (name === "MaxHealth") H.setHumanoid?.({ maxHealth: Math.max(1, num) });
    else if (name === "WalkSpeed") H.setHumanoid?.({ walkSpeed: Math.max(0, Math.min(500, num)) });
    else if (name === "JumpPower" || name === "JumpHeight") H.setHumanoid?.({ jumpPower: Math.max(0, Math.min(1000, num)) });
    return;
  }
}

/* ----------------------------- evaluating --------------------------- */

async function evalExpr(e: Expr, env: Env, rt: RT): Promise<BValue> {
  const [first] = await evalMulti(e, env, rt);
  return first ?? null;
}

async function evalMulti(e: Expr, env: Env, rt: RT): Promise<BValue[]> {
  rt.step(e.line);
  switch (e.t) {
    case "num": return [e.v];
    case "str": return [e.v];
    case "bool": return [e.v];
    case "nil": return [null];
    case "var": {
      const found = env.lookup(e.name);
      if (!found) {
        // implicit globals fall through to nil (Roblox errors, we're lenient for beginners)
        return [null];
      }
      return [found.env.vars.get(e.name) ?? null];
    }
    case "vararg": return env.varargs ?? [];
    case "bin": {
      if (e.op === "and") {
        const a = await evalExpr(e.a, env, rt);
        return truthy(a) ? evalMulti(e.b, env, rt) : [a];
      }
      if (e.op === "or") {
        const a = await evalExpr(e.a, env, rt);
        return truthy(a) ? [a] : evalMulti(e.b, env, rt);
      }
      const a = await evalExpr(e.a, env, rt);
      const b = await evalExpr(e.b, env, rt);
      return [binOp(rt, e.op, a, b, e.line)];
    }
    case "un": {
      const a = await evalExpr(e.a, env, rt);
      if (e.op === "not") return [!truthy(a)];
      if (e.op === "-") {
        if (typeof a !== "number") throw rt.err(`attempt to negate a ${typeName(a)} value`, e.line);
        return [-a];
      }
      if (e.op === "#") {
        if (typeof a === "string") return [a.length];
        if (a && typeof a === "object" && "__table" in a) return [a.arr.length];
        throw rt.err(`attempt to get length of a ${typeName(a)} value`, e.line);
      }
      throw rt.err(`bad unary op ${e.op}`, e.line);
    }
    case "index": {
      const obj = await evalExpr(e.obj, env, rt);
      const key = await evalExpr(e.key, env, rt);
      return [indexGet(rt, obj, key, e.line)];
    }
    case "dot": {
      const obj = await evalExpr(e.obj, env, rt);
      return [indexGet(rt, obj, e.name, e.line)];
    }
    case "call": {
      const mname = e.fn.t === "dot" ? e.fn.name : undefined;
      const fn = await evalExpr(e.fn, env, rt);
      if (e.self !== null) {
        // method call: evaluate self once
        const selfVal = await evalExpr(e.self, env, rt);
        const args = [selfVal];
        for (let i = 0; i < e.args.length; i++) {
          const isLast = i === e.args.length - 1;
          if (isLast) args.push(...(await evalMulti(e.args[i], env, rt)));
          else args.push(await evalExpr(e.args[i], env, rt));
        }
        return callValue(fn, args, rt, e.line, mname);
      }
      const args: BValue[] = [];
      for (let i = 0; i < e.args.length; i++) {
        const isLast = i === e.args.length - 1;
        if (isLast) args.push(...(await evalMulti(e.args[i], env, rt)));
        else args.push(await evalExpr(e.args[i], env, rt));
      }
      return callValue(fn, args, rt, e.line, mname);
    }
    case "func": {
      const f: BFunction = { __fn: true, name: e.func.name, params: e.func.params, vararg: e.func.vararg, body: e.func.body, closure: env };
      return [f];
    }
    case "table": {
      const t = newTable();
      for (const entry of e.entries) {
        rt.step(e.line);
        if (entry.name !== null) {
          t.hash.set(entry.name, await evalExpr(entry.value, env, rt));
        } else if (entry.key !== null) {
          const k = await evalExpr(entry.key, env, rt);
          tableSet(t, k, await evalExpr(entry.value, env, rt));
        } else {
          const v = await evalExpr(entry.value, env, rt);
          t.arr.push(v);
        }
      }
      return [t];
    }
  }
}

function methodNameOf(fn: Expr): string | undefined {
  if (fn.t === "dot") return fn.name;
  return undefined;
}

function indexGet(rt: RT, obj: BValue, key: BValue | string, line: number): BValue {
  if (obj === null) throw rt.err(`attempt to index nil with '${typeof key === "string" ? key : bToString(key)}' — check FindFirstChild or Parent`, line);
  if (typeof obj === "string") {
    // string library sugar: s:upper() etc.
    const name = typeof key === "string" ? key : bToString(key);
    return stringLibIndex(rt, name);
  }
  if (typeof obj === "object" && "__table" in obj) {
    return tableGet(obj, key as BValue);
  }
  if (typeof obj === "object" && "__inst" in obj) {
    return instGetIndex(rt, obj, typeof key === "string" ? key : bToString(key), line);
  }
  if (typeof obj === "object" && "__signal" in obj) {
    if (key === "Connect") {
      return { __native: true, name: "Connect", call: (args) => {
        // method call: args[0] is the signal (self), args[1] is the handler
        const conn = connectSignal(rt, obj, args.length > 1 ? args[args.length - 1] : args[0], line);
        return [conn];
      } };
    }
    return null;
  }
  if (typeof obj === "object" && "__conn" in obj) {
    if (key === "Disconnect") {
      return { __native: true, name: "Disconnect", call: () => { obj.disconnect(); return [null]; } };
    }
    return null;
  }
  if (typeof obj === "object" && "__vec3" in obj) {
    if (key === "X" || key === "Y" || key === "Z") return obj[key];
    if (key === "Magnitude") return Math.sqrt(obj.X ** 2 + obj.Y ** 2 + obj.Z ** 2);
    if (key === "Unit") {
      const m = Math.sqrt(obj.X ** 2 + obj.Y ** 2 + obj.Z ** 2) || 1;
      return v3(obj.X / m, obj.Y / m, obj.Z / m);
    }
    return null;
  }
  if (typeof obj === "object" && "__color3" in obj) {
    if (key === "R" || key === "G" || key === "B") return obj[key];
    return null;
  }
  return null;
}

async function assignIndex(rt: RT, obj: BValue, key: BValue | string, value: BValue, line: number) {
  if (obj === null) throw rt.err(`attempt to index nil with '${typeof key === "string" ? key : bToString(key)}' on assignment`, line);
  if (typeof obj === "object" && "__table" in obj) {
    tableSet(obj, key as BValue, value);
    return;
  }
  if (typeof obj === "object" && "__inst" in obj) {
    instSetIndex(rt, obj, typeof key === "string" ? key : bToString(key), value, line);
    return;
  }
  // silently ignore other assignments (properties on numbers etc.)
}

function binOp(rt: RT, op: string, a: BValue, b: BValue, line: number): BValue {
  switch (op) {
    case "==": return luaEq(a, b);
    case "~=": return !luaEq(a, b);
    case "..": {
      if (typeof a === "number" || typeof a === "string") {
        if (typeof b === "number" || typeof b === "string") return bToString(a) + bToString(b);
      }
      throw rt.err(`attempt to concatenate ${typeName(a)} and ${typeName(b)}`, line);
    }
    case "+": case "-": case "*": case "/": case "%": case "//": case "^": {
      if (a && typeof a === "object" && "__vec3" in a && b && typeof b === "object" && "__vec3" in b && (op === "+" || op === "-")) {
        return op === "+" ? v3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) : v3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
      }
      if (a && typeof a === "object" && "__vec3" in a && typeof b === "number" && op === "*") return v3(a.X * b, a.Y * b, a.Z * b);
      if (typeof a === "number" && b && typeof b === "object" && "__vec3" in b && op === "*") return v3(b.X * a, b.Y * a, b.Z * a);
      if (typeof a !== "number" || typeof b !== "number") {
        throw rt.err(`attempt to perform arithmetic (${op}) on ${typeName(a)} and ${typeName(b)}`, line);
      }
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return ((a % b) + b) % b;
        case "//": return Math.floor(a / b);
        case "^": return Math.pow(a, b);
      }
    }
  }
  if (typeof a === "number" && typeof b === "number") {
    switch (op) {
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
    }
  }
  if (typeof a === "string" && typeof b === "string") {
    switch (op) {
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
    }
  }
  throw rt.err(`attempt to compare ${typeName(a)} with ${typeName(b)}`, line);
}

function luaEq(a: BValue, b: BValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") return a === b;
  if (typeof a === "object" && typeof b === "object") {
    if ("__vec3" in a && "__vec3" in b) return a.X === b.X && a.Y === b.Y && a.Z === b.Z;
    if ("__color3" in a && "__color3" in b) return a.R === b.R && a.G === b.G && a.B === b.B;
    if ("__inst" in a && "__inst" in b) return a.kind === b.kind && a.ref === b.ref;
    return a === b;
  }
  return false;
}

export async function callValue(fn: BValue, args: BValue[], rt: RT, line: number, methodName?: string): Promise<BValue[]> {
  if (fn === null) {
    const label = methodName ? `method '${methodName}'` : "value";
    throw rt.err(`attempt to call a nil ${label} — check the object exists (FindFirstChild)`, line);
  }
  if (typeof fn === "object" && "__native" in fn) {
    return await fn.call(args, rt);
  }
  if (typeof fn === "object" && "__fn" in fn) {
    return callFunction(fn, args, rt);
  }
  throw rt.err(`attempt to call a ${typeName(fn)} value`, line);
}

async function callFunction(fn: BFunction, args: BValue[], rt: RT): Promise<BValue[]> {
  const env = new Env(fn.closure);
  for (let i = 0; i < fn.params.length; i++) env.declare(fn.params[i], args[i] ?? null);
  env.varargs = args.slice(fn.params.length);
  try {
    await execBlock(fn.body, env, rt);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.values;
    throw e;
  }
  return [];
}

async function execBlock(body: Stmt[], env: Env, rt: RT) {
  for (const st of body) {
    rt.step(st.line);
    await execStmt(st, env, rt);
  }
}

async function execStmt(st: Stmt, env: Env, rt: RT) {
  switch (st.t) {
    case "local": {
      const values: BValue[] = [];
      for (let i = 0; i < st.exprs.length; i++) {
        const isLast = i === st.exprs.length - 1;
        if (isLast) values.push(...(await evalMulti(st.exprs[i], env, rt)));
        else values.push(await evalExpr(st.exprs[i], env, rt));
      }
      for (let i = 0; i < st.names.length; i++) env.declare(st.names[i], values[i] ?? null);
      return;
    }
    case "assign": {
      // evaluate RHS values (multi-value expansion on the last expression)
      const values: BValue[] = [];
      for (let i = 0; i < st.exprs.length; i++) {
        const isLast = i === st.exprs.length - 1;
        if (isLast) values.push(...(await evalMulti(st.exprs[i], env, rt)));
        else values.push(await evalExpr(st.exprs[i], env, rt));
      }
      for (let i = 0; i < st.targets.length; i++) {
        const tg = st.targets[i];
        const v = values[i] ?? null;
        if (tg.k === "var") {
          if (!env.setExisting(tg.name, v)) rt.globals.declare(tg.name, v);
        } else if (tg.k === "dot") {
          const obj = await evalExpr(tg.obj, env, rt);
          await assignIndex(rt, obj, tg.name, v, st.line);
        } else {
          const obj = await evalExpr(tg.obj, env, rt);
          const key = await evalExpr(tg.key, env, rt);
          await assignIndex(rt, obj, key, v, st.line);
        }
      }
      return;
    }
    case "expr":
      await evalMulti(st.e, env, rt);
      return;
    case "if": {
      for (const cl of st.clauses) {
        rt.step(st.line);
        if (truthy(await evalExpr(cl.cond, env, rt))) {
          await execBlock(cl.body, new Env(env), rt);
          return;
        }
      }
      if (st.orelse) await execBlock(st.orelse, new Env(env), rt);
      return;
    }
    case "while": {
      for (;;) {
        rt.step(st.line);
        if (!truthy(await evalExpr(st.cond, env, rt))) break;
        try {
          await execBlock(st.body, new Env(env), rt);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          throw e;
        }
      }
      return;
    }
    case "repeat": {
      for (;;) {
        rt.step(st.line);
        try {
          await execBlock(st.body, new Env(env), rt);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          throw e;
        }
        if (truthy(await evalExpr(st.cond, env, rt))) break;
      }
      return;
    }
    case "fornum": {
      const from = await evalExpr(st.from, env, rt);
      const to = await evalExpr(st.to, env, rt);
      const step = st.step ? await evalExpr(st.step, env, rt) : 1;
      if (typeof from !== "number" || typeof to !== "number" || typeof step !== "number" || step === 0)
        throw rt.err("'for' requires numbers", st.line);
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
        rt.step(st.line);
        const loopEnv = new Env(env);
        loopEnv.declare(st.name, i);
        try {
          await execBlock(st.body, loopEnv, rt);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          throw e;
        }
      }
      return;
    }
    case "forin": {
      const iterables: BValue[] = [];
      for (let i = 0; i < st.exprs.length; i++) {
        const isLast = i === st.exprs.length - 1;
        if (isLast) iterables.push(...(await evalMulti(st.exprs[i], env, rt)));
        else iterables.push(await evalExpr(st.exprs[i], env, rt));
      }
      const [iter, state, control] = iterables;
      if (!iter) throw rt.err("attempt to iterate a nil value", st.line);
      let ctl = control ?? null;
      for (;;) {
        rt.step(st.line);
        const res = await callValue(iter, [state, ctl], rt, st.line);
        const k = res[0] ?? null;
        if (k === null) break;
        ctl = k;
        const loopEnv = new Env(env);
        for (let i = 0; i < st.names.length; i++) loopEnv.declare(st.names[i], res[i] ?? null);
        try {
          await execBlock(st.body, loopEnv, rt);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          throw e;
        }
      }
      return;
    }
    case "return":
      throw new ReturnSignal(await (async () => {
        const vals: BValue[] = [];
        for (let i = 0; i < st.exprs.length; i++) {
          const isLast = i === st.exprs.length - 1;
          if (isLast) vals.push(...(await evalMulti(st.exprs[i], env, rt)));
          else vals.push(await evalExpr(st.exprs[i], env, rt));
        }
        return vals;
      })());
    case "break":
      throw new BreakSignal();
    case "localfunc": {
      const f: BFunction = { __fn: true, name: st.name, params: st.func.params, vararg: st.func.vararg, body: st.func.body, closure: env };
      env.declare(st.name, f);
      return;
    }
  }
}

/* ---------------------------- stdlib ------------------------------- */

function native(name: string, fn: (args: BValue[], rt: RT) => Promise<BValue[]> | BValue[]): BNative {
  return { __native: true, name, call: fn };
}

function stringFormat(rt: RT, fmt: string, args: BValue[], line: number): string {
  let ai = 0;
  return fmt.replace(/%%|%(-?\d+)?(?:\.(\d+))?([dsfxq])/g, (_m, width, prec, spec) => {
    if (_m === "%%") return "%";
    const arg = args[ai++];
    let out: string;
    if (spec === "d") out = String(Math.floor(Number(arg)));
    else if (spec === "f") out = Number(arg).toFixed(prec ? Number(prec) : 6);
    else if (spec === "x") out = Math.floor(Number(arg)).toString(16);
    else if (spec === "q") out = JSON.stringify(bToString(arg));
    else out = bToString(arg);
    if (width) {
      const w = Number(width);
      out = w < 0 ? out.padEnd(-w) : out.padStart(w);
    }
    return out;
  });
}

function stringLibIndex(rt: RT, name: string): BValue {
  void rt;
  const table: Record<string, (args: BValue[]) => BValue[]> = {
    upper: (a) => [typeof a[0] === "string" ? a[0].toUpperCase() : null],
    lower: (a) => [typeof a[0] === "string" ? a[0].toLowerCase() : null],
    len: (a) => [typeof a[0] === "string" ? a[0].length : null],
    sub: (a) => {
      const s = String(a[0] ?? "");
      const len = s.length;
      let i = Math.trunc(Number(a[1] ?? 1)) || 1;
      let j = Math.trunc(Number(a[2] ?? len)) || len;
      if (i < 0) i = Math.max(len + i + 1, 1);
      else if (i === 0) i = 1;
      if (j < 0) j = len + j + 1;
      else if (j > len) j = len;
      return [i > j ? "" : s.slice(i - 1, j)];
    },
    rep: (a) => {
      const s = String(a[0] ?? "");
      const n = Math.min(10000, Math.max(0, Math.trunc(Number(a[1] ?? 0))));
      return [s.repeat(n)];
    },
    find: (a) => {
      const s = String(a[0] ?? "");
      const pat = String(a[1] ?? "");
      const idx = s.indexOf(pat);
      return idx < 0 ? [null] : [idx + 1, idx + pat.length];
    },
    split: (a) => {
      const s = String(a[0] ?? "");
      const sep = String(a[1] ?? ",");
      const t = newTable();
      for (const piece of s.split(sep)) t.arr.push(piece);
      return [t];
    },
  };
  const fn = table[name];
  if (!fn) return null;
  return native(`string.${name}`, (args) => fn(args));
}

function installGlobals(rt: RT) {
  const G = rt.globals;
  const H = rt.host;

  const declare = (name: string, v: BValue) => G.declare(name, v);

  /* --- basics --- */
  declare("print", native("print", async (args) => {
    rt.log("info", args.map(bToString).join("  "));
    return [];
  }));
  declare("warn", native("warn", async (args) => {
    rt.log("warn", args.map(bToString).join("  "));
    return [];
  }));
  declare("tostring", native("tostring", (args) => [bToString(args[0] ?? null)]));
  declare("tonumber", native("tonumber", (args) => {
    const v = args[0];
    if (typeof v === "number") return [v];
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return [Number(v)];
    return [null];
  }));
  declare("type", native("type", (args) => [typeNameRaw(args[0])]));
  declare("typeof", native("typeof", (args) => [typeName(args[0])]));
  declare("tick", native("tick", () => [Date.now() / 1000]));
  declare("wait", native("wait", async (args) => {
    const t = Math.min(30, Math.max(0, typeof args[0] === "number" ? args[0] : 0.03));
    await rt.sleep(t);
    return [t];
  }));

  /* --- task library --- */
  declare("task", (() => {
    const t = newTable();
    t.hash.set("wait", native("task.wait", async (args) => {
      const s = Math.min(30, Math.max(0, typeof args[0] === "number" ? args[0] : 0.03));
      await rt.sleep(s);
      return [s];
    }));
    t.hash.set("spawn", native("task.spawn", async (args) => {
      const fn = args[0];
      if (fn && typeof fn === "object" && ("__fn" in fn || "__native" in fn)) {
        callValue(fn, args.slice(1), rt, rt.currentLine).catch((e) => reportRuntimeError(rt, e));
      }
      return [];
    }));
    t.hash.set("delay", native("task.delay", async (args) => {
      const delay = Math.min(60, Math.max(0, typeof args[0] === "number" ? args[0] : 1));
      const fn = args[1];
      const run = async () => {
        await rt.sleep(delay);
        if (fn) callValue(fn, args.slice(2), rt, rt.currentLine).catch((e) => reportRuntimeError(rt, e));
      };
      run();
      return [];
    }));
    t.hash.set("defer", t.hash.get("spawn")!);
    return t;
  })());

  /* --- math --- */
  declare("math", (() => {
    const m = newTable();
    const wrap1 = (name: string, fn: (x: number) => number) => m.hash.set(name, native(`math.${name}`, (args) => [fn(Number(args[0] ?? 0))]));
    wrap1("floor", Math.floor);
    wrap1("ceil", Math.ceil);
    wrap1("abs", Math.abs);
    wrap1("sqrt", Math.sqrt);
    wrap1("sin", Math.sin);
    wrap1("cos", Math.cos);
    wrap1("tan", Math.tan);
    wrap1("asin", Math.asin);
    wrap1("acos", Math.acos);
    wrap1("exp", Math.exp);
    m.hash.set("pi", Math.PI);
    m.hash.set("huge", Infinity);
    m.hash.set("log", native("math.log", (args) => [Math.log(Number(args[0] ?? 1))]));
    m.hash.set("atan", native("math.atan", (args) => [Math.atan(Number(args[0] ?? 0))]));
    m.hash.set("atan2", native("math.atan2", (args) => [Math.atan2(Number(args[0] ?? 0), Number(args[1] ?? 0))]));
    m.hash.set("pow", native("math.pow", (args) => [Math.pow(Number(args[0] ?? 0), Number(args[1] ?? 0))]));
    m.hash.set("min", native("math.min", (args) => [Math.min(...args.map(Number))]));
    m.hash.set("max", native("math.max", (args) => [Math.max(...args.map(Number))]));
    m.hash.set("randomseed", native("math.randomseed", () => [null]));
    m.hash.set("random", native("math.random", (args) => {
      const a = args[0], b = args[1];
      if (a === undefined || a === null) return [Math.random()];
      if (b === undefined || b === null) return [1 + Math.floor(Math.random() * Math.floor(Number(a)))];
      const lo = Math.ceil(Number(a));
      const hi = Math.floor(Number(b));
      return [lo + Math.floor(Math.random() * (hi - lo + 1))];
    }));
    return m;
  })());

  /* --- string --- */
  declare("string", (() => {
    const s = newTable();
    s.hash.set("format", native("string.format", (args) => {
      const fmt = String(args[0] ?? "");
      return [stringFormat(rt, fmt, args.slice(1), rt.currentLine)];
    }));
    for (const [name, fn] of Object.entries({
      upper: (a: BValue[]) => (typeof a[0] === "string" ? a[0].toUpperCase() : null),
      lower: (a: BValue[]) => (typeof a[0] === "string" ? a[0].toLowerCase() : null),
      len: (a: BValue[]) => (typeof a[0] === "string" ? a[0].length : null),
      rep: (a: BValue[]) => String(a[0] ?? "").repeat(Math.min(10000, Math.max(0, Math.trunc(Number(a[1] ?? 0))))),
    })) {
      s.hash.set(name, native(`string.${name}`, (args) => [fn(args)]));
    }
    s.hash.set("sub", native("string.sub", (args) => {
      const str = String(args[0] ?? "");
      const len = str.length;
      let i = Math.trunc(Number(args[1] ?? 1)) || 1;
      let j = Math.trunc(Number(args[2] ?? len)) || len;
      if (i < 0) i = Math.max(len + i + 1, 1); else if (i === 0) i = 1;
      if (j < 0) j = len + j + 1; else if (j > len) j = len;
      return [i > j ? "" : str.slice(i - 1, j)];
    }));
    s.hash.set("find", native("string.find", (args) => {
      const str = String(args[0] ?? "");
      const pat = String(args[1] ?? "");
      const idx = str.indexOf(pat);
      if (idx < 0) return [null];
      return [idx + 1, idx + pat.length];
    }));
    s.hash.set("split", native("string.split", (args) => {
      const str = String(args[0] ?? "");
      const sep = String(args[1] ?? ",");
      const t = newTable();
      for (const piece of str.split(sep)) t.arr.push(piece);
      return [t];
    }));
    return s;
  })());

  /* --- table --- */
  declare("table", (() => {
    const t = newTable();
    t.hash.set("insert", native("table.insert", (args) => {
      const tab = args[0];
      if (!tab || typeof tab !== "object" || !("__table" in tab)) throw rt.err("table.insert expects a table", rt.currentLine);
      if (args.length >= 3) {
        const pos = Math.trunc(Number(args[1]));
        tab.arr.splice(pos - 1, 0, args[2]);
      } else {
        tab.arr.push(args[1] ?? null);
      }
      return [];
    }));
    t.hash.set("remove", native("table.remove", (args) => {
      const tab = args[0];
      if (!tab || typeof tab !== "object" || !("__table" in tab)) throw rt.err("table.remove expects a table", rt.currentLine);
      if (args.length >= 2) {
        const pos = Math.trunc(Number(args[1]));
        return [tab.arr.splice(pos - 1, 1)[0] ?? null];
      }
      return [tab.arr.pop() ?? null];
    }));
    t.hash.set("concat", native("table.concat", (args) => {
      const tab = args[0];
      if (!tab || typeof tab !== "object" || !("__table" in tab)) return [""];
      const sep = String(args[1] ?? "");
      return [tab.arr.map(bToString).join(sep)];
    }));
    t.hash.set("getn", native("table.getn", (args) => {
      const tab = args[0];
      if (!tab || typeof tab !== "object" || !("__table" in tab)) return [0];
      return [tab.arr.length];
    }));
    t.hash.set("create", native("table.create", () => [newTable()]));
    return t;
  })());

  /* --- os --- */
  declare("os", (() => {
    const o = newTable();
    o.hash.set("time", native("os.time", () => [Math.floor(Date.now() / 1000)]));
    o.hash.set("clock", native("os.clock", () => [performance.now() / 1000]));
    return o;
  })());

  /* --- iteration --- */
  declare("pairs", native("pairs", (args) => {
    const t = args[0];
    if (!t || typeof t !== "object" || !("__table" in t)) throw rt.err("pairs expects a table", rt.currentLine);
    const tbl = t;
    const keys = [...tbl.hash.keys()];
    return [
      native("next", async ([, k]) => {
        if (k === null || k === undefined) {
          if (tbl.arr.length) return [1, tbl.arr[0]];
          if (keys.length) { const key = keys[0]; return [key, tbl.hash.get(key) ?? null]; }
          return [null];
        }
        if (typeof k === "number" && k >= 1 && k < tbl.arr.length) return [k + 1, tbl.arr[k] ?? null];
        if (typeof k === "number" && k === tbl.arr.length) {
          if (keys.length) { const key = keys[0]; return [key, tbl.hash.get(key) ?? null]; }
          return [null];
        }
        const idx = keys.indexOf(typeof k === "string" ? k : bToString(k));
        if (idx < 0 || idx === keys.length - 1) return [null];
        const key = keys[idx + 1];
        return [key, tbl.hash.get(key) ?? null];
      }),
      null,
      null,
    ];
  }));
  declare("ipairs", native("ipairs", (args) => {
    const t = args[0];
    const arr = t && typeof t === "object" && "__table" in t ? t.arr : [];
    return [
      native("next", async ([, k]) => {
        const i = (typeof k === "number" ? k : 0) + 1;
        if (i <= arr.length) return [i, arr[i - 1] ?? null];
        return [null];
      }),
      null,
      null,
    ];
  }));
  declare("next", native("next", () => { throw rt.err("next() is not supported — use pairs()", rt.currentLine); }));
  declare("unpack", native("unpack", (args) => {
    const t = args[0];
    return t && typeof t === "object" && "__table" in t ? t.arr : [];
  }));

  /* --- Roblox types --- */
  declare("Vector3", (() => {
    const V = newTable();
    V.hash.set("new", native("Vector3.new", (args) => [v3(Number(args[0] ?? 0), Number(args[1] ?? 0), Number(args[2] ?? 0))]));
    V.hash.set("zero", v3(0, 0, 0));
    V.hash.set("one", v3(1, 1, 1));
    V.hash.set("xAxis", v3(1, 0, 0));
    V.hash.set("yAxis", v3(0, 1, 0));
    V.hash.set("zAxis", v3(0, 0, 1));
    return V;
  })());
  declare("Color3", (() => {
    const C = newTable();
    C.hash.set("new", native("Color3.new", (args) => [c3(Number(args[0] ?? 0), Number(args[1] ?? 0), Number(args[2] ?? 0))]));
    C.hash.set("fromRGB", native("Color3.fromRGB", (args) => [c3(Number(args[0] ?? 0) / 255, Number(args[1] ?? 0) / 255, Number(args[2] ?? 0) / 255)]));
    return C;
  })());
  declare("BrickColor", (() => {
    const B = newTable();
    B.hash.set("new", native("BrickColor.new", (args) => {
      const name = typeof args[0] === "string" ? args[0] : "Medium stone grey";
      const t = newTable();
      t.hash.set("Name", name);
      t.hash.set("Color", c3(0.64, 0.64, 0.65));
      return [t];
    }));
    for (const alias of ["White", "Gray", "Black", "Red", "Yellow", "Green", "Blue", "Brown"]) {
      const map: Record<string, string> = {
        White: "Institutional white", Gray: "Medium stone grey", Black: "Really black",
        Red: "Bright red", Yellow: "New Yeller", Green: "Bright green", Blue: "Bright blue", Brown: "Reddish brown",
      };
      const t = newTable();
      t.hash.set("Name", map[alias]);
      B.hash.set(alias, t);
    }
    return B;
  })());
  declare("CFrame", (() => {
    const C = newTable();
    C.hash.set("new", native("CFrame.new", (args) => {
      if (args[0] && typeof args[0] === "object" && "__vec3" in args[0]) return [args[0]];
      return [v3(Number(args[0] ?? 0), Number(args[1] ?? 0), Number(args[2] ?? 0))];
    }));
    return C;
  })());

  /* --- Enum (Enum.Material.Neon → "Neon") --- */
  declare("Enum", (() => {
    const proxy = newTable();
    const enumLibs = new Map<string, BTable>();
    proxy.hash.set("__meta", null);
    // We can't intercept unknown dot access with plain tables, so pre-fill common enums.
    const mats = ["Plastic", "SmoothPlastic", "Neon", "Wood", "WoodPlanks", "Marble", "Slate", "Concrete", "Granite", "Brick", "Pebble", "Cobblestone", "Rock", "Sandstone", "Limestone", "CorrodedMetal", "DiamondPlate", "Foil", "Metal", "Grass", "LeafyGrass", "Sand", "Fabric", "Snow", "Mud", "Ground", "Asphalt", "Salt", "Ice", "Glacier", "Glass", "ForceField", "Pavement", "CrackedLava", "Plaster", "Cardboard", "Carpet", "CeramicTiles", "ClayRoofTiles", "Leather", "Rubber"];
    const material = newTable();
    for (const m of mats) material.hash.set(m, m);
    enumLibs.set("Material", material);
    const priority = newTable();
    priority.hash.set("Low", "Low");
    priority.hash.set("Normal", "Normal");
    priority.hash.set("High", "High");
    enumLibs.set("Priority", priority);
    const animPriority = newTable();
    animPriority.hash.set("Core", 0);
    animPriority.hash.set("Idle", 1);
    animPriority.hash.set("Movement", 2);
    animPriority.hash.set("Action", 3);
    enumLibs.set("AnimationPriority", animPriority);
    for (const [k, v] of enumLibs) proxy.hash.set(k, v);
    return proxy;
  })());

  /* --- Instance --- */
  declare("Instance", (() => {
    const I = newTable();
    I.hash.set("new", native("Instance.new", (args) => {
      const className = String(args[0] ?? "");
      if (className === "Part" || className === "SpawnLocation" || className === "Wedge" || className === "Ball" || className === "Cylinder") {
        const id = H.createPart(className);
        if (!id) throw rt.err(`failed to create ${className}`, rt.currentLine);
        const inst = makeInst("part", id);
        const parent = args[1];
        if (parent && typeof parent === "object" && "__inst" in parent) {
          instSetIndex(rt, inst, "Parent", parent, rt.currentLine);
        }
        return [inst];
      }
      if (className === "Model" || className === "Folder") {
        const id = H.createModel(className === "Folder" ? "Folder" : "Model");
        const inst = makeInst("model", id);
        const parent = args[1];
        if (parent && typeof parent === "object" && "__inst" in parent) {
          if (parent.kind === "model" || parent.kind === "game" || (parent.kind === "service" && parent.ref === "Workspace")) {
            // models are flat under Workspace in this engine
          }
        }
        return [inst];
      }
      if (className === "Animation") {
        // a lightweight Animation: set .AnimationId to a name, then
        // animator:LoadAnimation(anim) returns an AnimationTrack
        return [makeInst("animation", "")];
      }
      if (className === "Tool") {
        // a scriptable Tool — set .Name/.ToolTip, connect events, and
        // it joins the StarterPack (players spawn with it every respawn)
        const id = H.createTool?.();
        if (!id) throw rt.err("failed to create Tool — only available while playing", rt.currentLine);
        return [makeInst("tool", id)];
      }
      throw rt.err(`Instance.new("${className}") is not supported — try "Part", "SpawnLocation", "Model", "Folder", "Animation" or "Tool"`, rt.currentLine);
    }));
    return I;
  })());

  /* --- require --- */
  declare("require", native("require", async (args) => {
    const inst = args[0];
    if (!inst || typeof inst !== "object" || !("__inst" in inst) || inst.kind !== "script") {
      throw rt.err("require expects a ModuleScript instance", rt.currentLine);
    }
    const script = H.getScript(inst.ref);
    if (!script || script.kind !== "ModuleScript") {
      throw rt.err("require expects a ModuleScript instance", rt.currentLine);
    }
    if (rt.moduleCache.has(script.id)) return [rt.moduleCache.get(script.id) ?? null];
    const mod = await runModule(rt, script);
    rt.moduleCache.set(script.id, mod);
    return [mod];
  }));

  /* --- game / workspace / script --- */
  declare("game", makeInst("game", "game"));
  declare("workspace", makeInst("service", "Workspace"));
  declare("Workspace", makeInst("service", "Workspace"));
  declare("shared", newTable());
}

function typeNameRaw(v: BValue): string {
  if (v === null) return "nil";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (typeof v === "object") {
    if ("__table" in v) return "table";
    if ("__fn" in v || "__native" in v) return "function";
    if ("__inst" in v) return "userdata";
    if ("__signal" in v) return "userdata";
  }
  return "userdata";
}

/* ------------------------- execution entry ------------------------- */

export interface BloxRuntime {
  rt: RT;
  script: ScriptData;
  finished: boolean;
  start(): Promise<void>;
  abort(): void;
  tick(): void;
  fireTouched(partId: string): void;
  fireHeartbeat(dt: number): void;
  fireDied(): void;
  /** Tool.Equipped / Unequipped / Activated / Deactivated events. */
  fireToolEvent(toolId: string, kind: "equipped" | "unequipped" | "activated" | "deactivated"): void;
  /** Backpack.ChildAdded — handlers receive the Tool instance. */
  fireBackpackChild(toolId: string): void;
  fireHealthChanged(health: number): void;
  /** AnimationTrack signals — Stopped and DidLoop. */
  fireTrackEvent(token: string, kind: "stopped" | "diloop"): void;
}

function reportRuntimeError(rt: RT, e: unknown) {
  if (e instanceof AbortSignal_) return;
  if (e instanceof BError) {
    rt.log("error", `${e.message} (line ${e.line})`);
  } else if (e instanceof Error) {
    rt.log("error", e.message);
  } else {
    rt.log("error", String(e));
  }
}

async function runModule(rt: RT, script: ScriptData): Promise<BValue> {
  const parser = new Parser(script.source);
  const body = parser.parseChunk();
  const env = new Env(rt.globals);
  env.declare("script", makeInst("script", script.id));
  try {
    await execBlock(body, env, rt);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.values[0] ?? null;
    throw e;
  }
  return null;
}

export function createRuntime(host: BloxHost, script: ScriptData): BloxRuntime {
  const rt = new RT(host, script.name);
  rt.scriptKind = script.kind;
  rt.deadline = Date.now() + 1500;

  const start = async () => {
    try {
      const parser = new Parser(script.source);
      const body = parser.parseChunk();
      const env = new Env(rt.globals);
      env.declare("script", makeInst("script", script.id));
      await execBlock(body, env, rt);
    } catch (e) {
      reportRuntimeError(rt, e);
    }
  };

  return {
    rt,
    script,
    finished: false,
    start,
    abort: () => rt.abort(),
    tick: () => rt.tick(Date.now()),
    fireTouched: (partId: string) => {
      const sig = rt.signals.get(`touched:${partId}`);
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      const hit = makeInst("part", "__player__");
      for (const h of handlers) {
        callFunction(h, [hit], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireHeartbeat: (dt: number) => {
      const sig = rt.signals.get("heartbeat:");
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300; // short budget per frame
      for (const h of handlers) {
        callFunction(h, [dt], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireDied: () => {
      const sig = rt.signals.get("died:");
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300;
      for (const h of handlers) {
        callFunction(h, [], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireHealthChanged: (health: number) => {
      const sig = rt.signals.get("healthchanged:");
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300;
      for (const h of handlers) {
        callFunction(h, [health], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireTrackEvent: (token: string, kind: "stopped" | "diloop") => {
      const sig = rt.signals.get(`${kind}:${token}`);
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300;
      for (const h of handlers) {
        callFunction(h, [], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireToolEvent: (toolId, kind) => {
      const sig = rt.signals.get(`${kind}:${toolId}`);
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300;
      for (const h of handlers) {
        callFunction(h, [], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
    fireBackpackChild: (toolId) => {
      const sig = rt.signals.get("childadded:");
      if (!sig) return;
      const handlers = getSignalHandlers(sig);
      if (!handlers.length) return;
      rt.deadline = Date.now() + 300;
      const child = makeInst("tool", toolId);
      for (const h of handlers) {
        callFunction(h, [child], rt).catch((e) => reportRuntimeError(rt, e));
      }
    },
  };
}

/** Quick syntax check used by the editor. Returns error message or null. */
export function checkSyntax(source: string): { ok: true } | { ok: false; error: string; line: number } {
  try {
    new Parser(source).parseChunk();
    return { ok: true };
  } catch (e) {
    if (e instanceof BError) return { ok: false, error: e.message, line: e.line };
    return { ok: false, error: e instanceof Error ? e.message : String(e), line: 0 };
  }
}
