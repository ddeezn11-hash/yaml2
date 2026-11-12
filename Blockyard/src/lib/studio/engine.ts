import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  BASEPLATE_SIZE,
  RIG_LABELS,
  brickColorHex,
  makeRigParts,
  makeTemplatePlace,
  materialDef,
  normalizeToolData,
  uid,
} from "./data";
import { getMaterialTexture } from "./textures";
import type {
  AnimationData,
  CustomToolData,
  LightingData,
  LogLevel,
  PartData,
  PartShape,
  PlaceState,
  RigKind,
  ScriptData,
  ScriptKind,
  ToolId,
  UIElementClass,
  UIObjectData,
  Vec3,
} from "./types";
import { DEFAULT_SCRIPT_PARENT, DEFAULT_SCRIPT_SOURCE } from "./scriptdefaults";

export const SELECT_COLOR = 0x37a4ff;
export const HOVER_COLOR = 0xffffff;

interface PartNode {
  data: PartData;
  mesh: THREE.Mesh;
  selectBox: THREE.LineSegments;
  hoverBox: THREE.LineSegments;
}

export type SelectionRef =
  | { kind: "part"; id: string }
  | { kind: "model"; id: string }
  | { kind: "service"; id: string }
  | { kind: "script"; id: string };

export interface EngineCallbacks {
  onSceneChanged?: (state: PlaceState) => void;
  onSelectionChanged?: (selection: SelectionRef[]) => void;
  onLiveTransform?: () => void;
  onLog?: (level: LogLevel, text: string) => void;
  onStats?: (fps: number, camPos: Vec3) => void;
  onPlayChanged?: (playing: boolean) => void;
  onCameraMoved?: (camPos: Vec3) => void;
  /** fired when the user intentionally creates/opens a place (not template launch) */
  onFreshPlace?: () => void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const d2r = Math.PI / 180;

/* ---------------------------------------------------------------- */
/* Geometries (unit sized; the mesh scale carries part size).       */
/* ---------------------------------------------------------------- */
function wedgeGeometry(): THREE.BufferGeometry {
  // Roblox WedgePart: vertical face at -Z, slope from top-back to bottom-front.
  const g = new THREE.BufferGeometry();
  const v = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], // bottom 0-3
    [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], // top back edge 4-5
  ];
  const faces = [
    [0, 1, 2, 3], // bottom  (0,1,2) (0,2,3)
    [0, 4, 5, 1], // back
    [4, 0, 3, 5], // slope: t1,b1,b4? -> use (4,0,3,5)? verify below
    [1, 5, 4, 0], // dup guard
  ];
  void faces;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pushTri = (a: number, b: number, c: number, n: THREE.Vector3) => {
    for (const i of [a, b, c]) {
      positions.push(...v[i]);
      normals.push(n.x, n.y, n.z);
      uvs.push((v[i][0] + 0.5), (v[i][2] + 0.5));
    }
  };
  const up = new THREE.Vector3(0, -1, 0); // bottom faces down
  pushTri(0, 2, 1, up);
  pushTri(0, 3, 2, up);
  pushTri(0, 1, 5, new THREE.Vector3(0, 0, -1)); // back
  pushTri(0, 5, 4, new THREE.Vector3(0, 0, -1));
  const slopeN = new THREE.Vector3(0, 1, 1).normalize();
  pushTri(4, 5, 2, slopeN); // slope
  pushTri(4, 2, 3, slopeN);
  pushTri(0, 4, 3, new THREE.Vector3(-1, 0, 0)); // left side
  pushTri(1, 2, 5, new THREE.Vector3(1, 0, 0)); // right side
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

function cornerWedgeGeometry(): THREE.BufferGeometry {
  // Square base, apex above the (-x,-z) corner, ridge to the (+x,+z) corner.
  const g = new THREE.BufferGeometry();
  const v = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], // base 0-3
    [-0.5, 0.5, -0.5], // apex 4
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pushTri = (a: number, b: number, c: number, n: THREE.Vector3) => {
    for (const i of [a, b, c]) {
      positions.push(...v[i]);
      normals.push(n.x, n.y, n.z);
      uvs.push(v[i][0] + 0.5, v[i][2] + 0.5);
    }
  };
  pushTri(0, 2, 1, new THREE.Vector3(0, -1, 0)); // bottom
  pushTri(0, 3, 2, new THREE.Vector3(0, -1, 0));
  pushTri(0, 1, 4, new THREE.Vector3(0, 0, -1)); // back wall (-z)
  pushTri(0, 4, 3, new THREE.Vector3(-1, 0, 0)); // left wall (-x)
  const n1 = new THREE.Vector3(1, 1, 0).normalize(); // slope toward +x
  pushTri(4, 1, 2, n1);
  const n2 = new THREE.Vector3(0, 1, 1).normalize(); // slope toward +z
  pushTri(4, 2, 3, n2);
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

let GEO: Record<PartShape, THREE.BufferGeometry> | null = null;
function shapeGeometry(shape: PartShape): THREE.BufferGeometry {
  if (!GEO) {
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
    cyl.rotateZ(Math.PI / 2); // Roblox cylinders run along X
    GEO = {
      Block: new THREE.BoxGeometry(1, 1, 1),
      Sphere: new THREE.SphereGeometry(0.5, 28, 18),
      Wedge: wedgeGeometry(),
      Cylinder: cyl,
      CornerWedge: cornerWedgeGeometry(),
    };
  }
  return GEO[shape];
}

let BOX_EDGES: THREE.BufferGeometry | null = null;
function boxEdges(): THREE.BufferGeometry {
  if (!BOX_EDGES) BOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
  return BOX_EDGES;
}

/* ---------------------------------------------------------------- */
/* StudioEngine                                                     */
/* ---------------------------------------------------------------- */
export class StudioEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;

  private parts = new Map<string, PartNode>();
  private models = new Map<string, { id: string; name: string }>();
  private modelGroups = new Map<string, THREE.Group>();
  /* scripts, texture assets and animations */
  private scripts: ScriptData[] = [];
  private assets = new Map<string, string>();          // assetId → data URL
  private assetTexCache = new Map<string, THREE.Texture>();
  private baseplateTextureId: string | null = null;
  private baseplateTiles = 64;
  private baseplateTop: THREE.MeshStandardMaterial;
  private animations = new Map<string, AnimationData[]>(); // modelId → list
  /* custom game tools (StarterPack) */
  private tools: CustomToolData[] = [];
  private uiObjects: UIObjectData[] = [];
  private baseplateColor = "#a3a2a5";
  lighting: LightingData = { ambient: 0.5, brightness: 1, clockTime: 14, fogEnd: 900 };
  placeName = "Baseplate";

  selection: SelectionRef[] = [];
  private hoverId: string | null = null;
  tool: ToolId = "select";
  snapMove: number | null = 1;
  snapRotate: number | null = 90;
  snapScale: number | null = null;
  localSpace = false;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private baseplate: THREE.Mesh;
  private grid: THREE.GridHelper;
  private skyTexture: THREE.CanvasTexture;

  private transform: TransformControls;
  private transformHelper: THREE.Object3D;
  private gizmoDragging = false;
  private dragStart: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } | null = null;
  private followerStart: { node: PartNode; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  private lastLiveBroadcastAt = 0;

  // Studio fly camera state
  private camYaw = 0;
  private camPitch = 0;
  private camVelocity = new THREE.Vector3();
  private camTarget = new THREE.Vector3(0, 0, 0); // for pan / focus animations
  private camAnim: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private keys = new Set<string>();
  private rmb = false;
  private mmb = false;
  private lmbOrbit = false;
  private inputEnabled = true;
  private lastPointer = { x: 0, y: 0 };
  private pointerDownAt = { x: 0, y: 0, t: 0 };
  private raycaster = new THREE.Raycaster();

  // history
  private history: { label: string; before: PlaceState; after: PlaceState }[] = [];
  private historyIndex = -1;
  private clipboard: PartData[] = [];

  // play mode + multiplayer hook (set externally)
  playing = false;
  playController: { update: (dt: number) => void; stop: () => void } | null = null;
  netSend: ((packet: Record<string, unknown>) => void) | null = null;
  netApplyRemote = false;

  /** Team Create role gate for THIS client (null = solo owner, full access).
   *  Set by StudioApp when joining a shared room; mutation methods check it. */
  accessGate: { canEditParts: boolean; canEditScripts: boolean; canEditTools: boolean; canEditAnimations: boolean } | null = null;
  private gateWarnedAt = 0;

  /** Returns false (and warns once) when the current role blocks this action. */
  private allow(what: "parts" | "scripts" | "tools" | "animations"): boolean {
    const gate = this.accessGate;
    if (!gate) return true;
    const ok =
      what === "parts" ? gate.canEditParts : what === "scripts" ? gate.canEditScripts : what === "tools" ? gate.canEditTools : gate.canEditAnimations;
    if (ok) return true;
    const now = Date.now();
    if (now - this.gateWarnedAt > 4000) {
      this.gateWarnedAt = now;
      this.log("warn", `Your role in this shared project can't edit ${what} — ask the owner for access (Team Create → Permissions)`);
    }
    return false;
  }

  /** Replace the Team Create role gate (called by StudioApp / Team Create UI). */
  setAccessGate(gate: StudioEngine["accessGate"]): void {
    this.accessGate = gate;
    this.gateWarnedAt = 0;
  }

  private clock = new THREE.Clock();
  private raf = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private statTimer = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, private cb: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
    this.camera.position.set(46, 38, 46);
    this.camera.lookAt(0, 2, 0);
    // Seed the fly-camera angles from the initial look direction.
    const initialEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.camYaw = initialEuler.y;
    this.camPitch = initialEuler.x;
    this.updateCameraOrientation();

    // lighting
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x6b7f6b, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.far = 800;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // sky
    this.skyTexture = this.buildSkyTexture();
    this.scene.background = this.skyTexture;
    this.scene.fog = new THREE.Fog(0xbcd8ee, 300, 900);

    // The Baseplate is a real Workspace Part (not a background-only mesh).
    // It therefore participates in selection, transforms, properties, save/load and Team Create.
    const baseplateData: PartData = {
      id: "baseplate", name: "Baseplate", shape: "Block",
      position: [0, -8, 0], rotation: [0, 0, 0], size: [BASEPLATE_SIZE, 16, BASEPLATE_SIZE],
      color: "Medium stone grey", material: "Plastic", transparency: 0, reflectance: 0,
      anchored: true, canCollide: true, castShadow: false, parentId: null,
    };
    this.mountPart(baseplateData);
    this.baseplate = this.parts.get("baseplate")!.mesh;
    this.baseplateTop = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.baseplateColor), roughness: 0.85, map: getMaterialTexture("studs") });
    this.baseplateTop.map!.wrapS = THREE.RepeatWrapping;
    this.baseplateTop.map!.wrapT = THREE.RepeatWrapping;
    this.baseplateTop.map!.repeat.set(BASEPLATE_SIZE, BASEPLATE_SIZE);
    const baseplateNode = this.parts.get("baseplate")!;
    (baseplateNode.mesh.material as THREE.Material).dispose();
    baseplateNode.mesh.material = this.baseplateTop;
    baseplateNode.mesh.receiveShadow = true;
    this.scene.add(baseplateNode.mesh);

    this.grid = new THREE.GridHelper(BASEPLATE_SIZE, BASEPLATE_SIZE / 4, 0x7d7c80, 0x8b8a8e);
    this.grid.position.y = 0.02;
    this.updateBaseplateGrid();
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.4;
    this.scene.add(this.grid);

    // gizmo
    this.transform = new TransformControls(this.camera, canvas);
    this.transformHelper = this.transform.getHelper();
    this.scene.add(this.transformHelper);
    this.transform.addEventListener("dragging-changed", (e) => {
      this.gizmoDragging = (e as unknown as { value: boolean }).value;
      if (!this.gizmoDragging && this.dragStart) {
        this.commitTransform("Transform");
      }
    });
    this.transform.addEventListener("mouseDown", () => this.beginTransformDrag());
    this.transform.addEventListener("objectChange", () => this.liveTransform());
    this.transform.setSpace("world");

    this.bindCanvasEvents();
    this.applyLighting();
    this.animate();
  }

  /* ------------------------- scene / camera ------------------------- */

  private buildSkyTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#5d9fd6");
    grad.addColorStop(0.55, "#a7cdea");
    grad.addColorStop(1, "#dcebf5");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private updateBaseplateGrid() {
    const data = this.parts.get("baseplate")?.data;
    if (!data || !this.grid) return;
    this.grid.position.set(data.position[0], data.position[1] + data.size[1] / 2 + 0.02, data.position[2]);
    this.grid.rotation.set(data.rotation[0] * d2r, data.rotation[1] * d2r, data.rotation[2] * d2r);
  }

  private applyLighting() {
    const t = this.lighting.clockTime;
    const dayAngle = ((t - 6) / 12) * Math.PI; // 6h -> 0, 12h -> PI/2, 18h -> PI
    const elev = Math.sin(dayAngle);
    const dir = new THREE.Vector3(Math.cos(dayAngle) * 0.9, Math.max(elev, -0.35), 0.42).normalize();
    this.sun.position.copy(dir).multiplyScalar(260);
    this.sun.intensity = Math.max(elev, 0) * 2.6 * this.lighting.brightness + 0.06;
    this.hemi.intensity = (0.28 + Math.max(elev, 0) * 1.0) * this.lighting.ambient * 2;
    const dayFog = new THREE.Color(0xbcd8ee);
    const nightFog = new THREE.Color(0x0d1524);
    this.scene.fog!.color.copy(nightFog).lerp(dayFog, clamp(elev + 0.18, 0, 1));
    (this.scene.fog as THREE.Fog).far = this.lighting.fogEnd;
    (this.scene.fog as THREE.Fog).near = this.lighting.fogEnd * 0.32;
  }

  setLighting(patch: Partial<LightingData>, label = "Lighting") {
    Object.assign(this.lighting, patch);
    this.applyLighting();
    if (label !== "__silent__") this.pushHistory(label);
  }

  private updateCameraOrientation() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.camPitch, this.camYaw, 0, "YXZ"));
    this.camera.quaternion.copy(q);
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* --------------------------- event wiring -------------------------- */

  private isTyping(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
  }

  private bindCanvasEvents() {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", () => this.keys.clear());
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.playing || !this.inputEnabled) return;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (e.button === 2) this.rmb = true;
    if (e.button === 1) {
      this.mmb = true;
      e.preventDefault();
    }
    if (e.button === 0 && !this.transform.dragging && !this.transform.axis) {
      this.pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      // Left-dragging empty sky/background orbits the camera. Clicking a part
      // still selects it; dragging a TransformControls handle still transforms it.
      this.setRay(e.clientX, e.clientY);
      const hit = this.raycaster.intersectObjects(this.partMeshes(), false).length > 0;
      this.lmbOrbit = !hit;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.playing || !this.inputEnabled) return;
    if (e.button === 2) this.rmb = false;
    if (e.button === 1) this.mmb = false;
    if (e.button === 0) this.lmbOrbit = false;
    if (e.button === 0 && !this.playing) {
      const moved = Math.hypot(e.clientX - this.pointerDownAt.x, e.clientY - this.pointerDownAt.y);
      const dt = performance.now() - this.pointerDownAt.t;
      const onGizmo = this.transform.dragging || this.transform.axis !== null;
      if (moved < 5 && dt < 400 && !onGizmo && e.target === this.canvas) {
        this.pickAt(e.clientX, e.clientY, e.ctrlKey || e.metaKey, e.shiftKey);
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.playing || !this.inputEnabled) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if ((this.rmb || this.lmbOrbit) && !this.gizmoDragging && !this.transform.dragging) {
      this.camYaw -= dx * 0.0042;
      this.camPitch = clamp(this.camPitch - dy * 0.0042, -1.5, 1.5);
      this.updateCameraOrientation();
    } else if (this.mmb && !this.gizmoDragging) {
      this.panCamera(dx, dy);
    } else if (e.target === this.canvas && !this.gizmoDragging && !this.transform.dragging) {
      this.updateHover(e.clientX, e.clientY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.playing || !this.inputEnabled) return;
    e.preventDefault();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.camera.position.addScaledVector(forward, -e.deltaY * 0.055);
  };

  private panCamera(dx: number, dy: number) {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.position.addScaledVector(right, -dx * 0.035);
    this.camera.position.addScaledVector(up, dy * 0.035);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputEnabled || this.isTyping()) return;
    if (this.playing) return; // play mode has its own handlers
    const k = e.code;
    // Studio shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (k === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (k === "KeyY") { e.preventDefault(); this.redo(); return; }
      if (k === "KeyD") { e.preventDefault(); this.duplicateSelection(); return; }
      if (k === "KeyC") { e.preventDefault(); this.copySelection(); return; }
      if (k === "KeyV") { e.preventDefault(); this.pasteClipboard(); return; }
      if (k === "KeyX") { e.preventDefault(); this.copySelection(); this.deleteSelection(); return; }
      if (k === "KeyG") { e.preventDefault(); this.groupSelection(); return; }
      if (k === "KeyU") { e.preventDefault(); this.ungroupSelection(); return; }
      if (k === "KeyA") { e.preventDefault(); this.selectAll(); return; }
      if (k === "KeyL") { e.preventDefault(); this.setSpace(!this.localSpace); return; }
      if (k === "KeyR") { e.preventDefault(); this.rotateSelectionY(90); return; }
      if (k === "Digit1") { e.preventDefault(); this.setTool("select"); return; }
      if (k === "Digit2") { e.preventDefault(); this.setTool("move"); return; }
      if (k === "Digit3") { e.preventDefault(); this.setTool("scale"); return; }
      if (k === "Digit4") { e.preventDefault(); this.setTool("rotate"); return; }
      return;
    }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); this.deleteSelection(); return; }
    if (k === "KeyF") { this.focusSelection(); return; }
    if (k === "KeyA" || k === "KeyD" || k === "KeyW" || k === "KeyS" || k === "KeyQ" || k === "KeyE" ||
        k.startsWith("Arrow")) {
      if (k.startsWith("Arrow")) e.preventDefault();
      this.keys.add(k);
      return;
    }
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  /** Temporarily suspend editor keyboard input while a separate play window is focused. */
  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) this.keys.clear();
  }

  private flyCamera(dt: number) {
    if (this.gizmoDragging) return;
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 24 : 68;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) wish.add(dir);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) wish.sub(dir);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) wish.add(right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) wish.sub(right);
    if (this.keys.has("KeyE")) wish.y += 1;
    if (this.keys.has("KeyQ")) wish.y -= 1;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    this.camVelocity.lerp(wish, 1 - Math.exp(-12 * dt));
    if (this.camVelocity.lengthSq() > 1e-6) {
      this.camera.position.addScaledVector(this.camVelocity, dt);
      this.camAnim = null;
    }
    if (this.camAnim) {
      this.camAnim.t = Math.min(1, this.camAnim.t + dt * 2.4);
      const s = this.camAnim.t * this.camAnim.t * (3 - 2 * this.camAnim.t);
      this.camera.position.lerpVectors(this.camAnim.from, this.camAnim.to, s);
      if (this.camAnim.t >= 1) this.camAnim = null;
    }
  }

  /* ----------------------------- picking ----------------------------- */

  private partMeshes(): THREE.Mesh[] {
    const list: THREE.Mesh[] = [];
    for (const node of this.parts.values()) list.push(node.mesh);
    return list;
  }

  private setRay(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
  }

  private pickAt(x: number, y: number, additive: boolean, area: boolean) {
    this.setRay(x, y);
    const hits = this.raycaster.intersectObjects(this.partMeshes(), false);
    if (!hits.length) {
      if (!additive && !area) this.setSelection([]);
      return;
    }
    const mesh = hits[0].object;
    const id = (mesh.userData.partId as string) || null;
    if (!id) return;
    if (additive || area) {
      const exists = this.selection.some((s) => s.kind === "part" && s.id === id);
      this.setSelection(exists ? this.selection.filter((s) => !(s.kind === "part" && s.id === id)) : [...this.selection, { kind: "part", id }]);
    } else {
      this.setSelection([{ kind: "part", id }]);
    }
  }

  private updateHover(x: number, y: number) {
    this.setRay(x, y);
    const hits = this.raycaster.intersectObjects(this.partMeshes(), false);
    const id = hits.length ? ((hits[0].object.userData.partId as string) || null) : null;
    if (id === this.hoverId) return;
    if (this.hoverId) {
      const node = this.parts.get(this.hoverId);
      if (node) node.hoverBox.visible = false;
    }
    this.hoverId = id;
    if (id) {
      const node = this.parts.get(id);
      if (node && !this.isSelected("part", id)) node.hoverBox.visible = true;
    }
  }

  /* ---------------------------- selection ---------------------------- */

  isSelected(kind: "part" | "model" | "script", id: string): boolean {
    return this.selection.some((s) => s.kind === kind && s.id === id);
  }

  setSelection(refs: SelectionRef[], announce = true) {
    this.selection = refs;
    // refresh visuals
    for (const node of this.parts.values()) {
      const sel = this.isSelected("part", node.data.id);
      node.selectBox.visible = sel;
      node.hoverBox.visible = this.hoverId === node.data.id && !sel;
    }
    this.refreshGizmoAttachment();
    if (announce) this.cb.onSelectionChanged?.(refs);
  }

  selectAll() {
    this.setSelection(this.parts.size ? [...this.parts.keys()].map((id) => ({ kind: "part" as const, id })) : []);
  }

  private primarySelectionObject(): THREE.Object3D | null {
    const primary = this.selection[this.selection.length - 1];
    if (!primary) return null;
    if (primary.kind === "part") return this.parts.get(primary.id)?.mesh ?? null;
    const group = this.modelGroups.get(primary.id);
    if (group) {
      // model groups sit at the origin: attach a proxy pivot at the model's bounds center
      const box = new THREE.Box3();
      let has = false;
      for (const node of this.parts.values()) {
        if (node.data.parentId === primary.id) {
          box.expandByObject(node.mesh);
          has = true;
        }
      }
      if (!has) return null;
      const center = box.getCenter(new THREE.Vector3());
      const proxy = this.modelPivot(primary.id);
      proxy.position.copy(center);
      return proxy;
    }
    return null;
  }

  private pivots = new Map<string, THREE.Object3D>();
  private modelPivot(id: string): THREE.Object3D {
    let p = this.pivots.get(id);
    if (!p) {
      p = new THREE.Object3D();
      p.name = `pivot_${id}`;
      p.userData.isModelPivot = true;
      this.scene.add(p);
      this.pivots.set(id, p);
    }
    return p;
  }

  private refreshGizmoAttachment() {
    const obj = this.primarySelectionObject();
    if (obj && this.tool !== "select" && !this.playing) {
      this.transform.attach(obj);
      this.transformHelper.visible = true;
      this.transform.setMode(this.tool === "move" ? "translate" : this.tool);
      if (this.tool === "scale" && obj.userData.isModelPivot) this.transform.setMode("translate");
    } else {
      this.transform.detach();
      this.transformHelper.visible = false;
    }
    this.transform.setTranslationSnap(this.snapMove);
    this.transform.setRotationSnap(this.snapRotate !== null ? this.snapRotate * d2r : null);
    this.transform.setScaleSnap(this.snapScale);
    this.transform.setSpace(this.localSpace ? "local" : "world");
  }

  setTool(tool: ToolId) {
    this.tool = tool;
    this.canvas.style.cursor = tool === "select" ? "default" : "default";
    this.refreshGizmoAttachment();
  }

  setSpace(local: boolean) {
    this.localSpace = local;
    this.refreshGizmoAttachment();
    this.log("info", `${local ? "Local" : "World"} coordinate space`);
  }

  setSnap(move: number | null, rotate: number | null, scale: number | null) {
    this.snapMove = move;
    this.snapRotate = rotate;
    this.snapScale = scale;
    this.refreshGizmoAttachment();
  }

  /* ---------------------------- transform ---------------------------- */

  private beginTransformDrag() {
    const obj = this.transform.object;
    if (!obj) return;
    this.dragStart = {
      pos: obj.position.clone(),
      quat: obj.quaternion.clone(),
      scale: obj.scale.clone(),
    };
    this.followerStart = [];
    const primary = this.selection[this.selection.length - 1];
    if (!primary) return;
    const primaryId = primary.kind === "part" ? primary.id : null;
    for (const ref of this.selection) {
      if (ref.kind !== "part" || ref.id === primaryId) continue;
      const node = this.parts.get(ref.id);
      if (node) {
        this.followerStart.push({
          node,
          pos: node.mesh.position.clone(),
          quat: node.mesh.quaternion.clone(),
          scale: node.mesh.scale.clone(),
        });
      }
    }
    if (primary.kind === "model") {
      for (const node of this.parts.values()) {
        if (node.data.parentId === primary.id && !this.followerStart.some((f) => f.node === node)) {
          this.followerStart.push({
            node,
            pos: node.mesh.position.clone(),
            quat: node.mesh.quaternion.clone(),
            scale: node.mesh.scale.clone(),
          });
        }
      }
    }
  }

  private liveTransform() {
    const obj = this.transform.object;
    if (!obj || !this.dragStart) return;
    const dPos = obj.position.clone().sub(this.dragStart.pos);
    const dQuat = obj.quaternion.clone().multiply(this.dragStart.quat.clone().invert());
    const sRatio = new THREE.Vector3(
      this.dragStart.scale.x !== 0 ? obj.scale.x / this.dragStart.scale.x : 1,
      this.dragStart.scale.y !== 0 ? obj.scale.y / this.dragStart.scale.y : 1,
      this.dragStart.scale.z !== 0 ? obj.scale.z / this.dragStart.scale.z : 1,
    );
    for (const f of this.followerStart) {
      if (this.transform.mode === "translate") {
        f.node.mesh.position.copy(f.pos).add(dPos);
      } else if (this.transform.mode === "rotate") {
        const around = this.dragStart.pos;
        const offset = f.pos.clone().sub(around).applyQuaternion(dQuat);
        f.node.mesh.position.copy(around).add(offset);
        f.node.mesh.quaternion.copy(dQuat.clone().multiply(f.quat));
      } else {
        const around = this.dragStart.pos;
        const offset = f.pos.clone().sub(around);
        offset.set(offset.x * sRatio.x, offset.y * sRatio.y, offset.z * sRatio.z);
        f.node.mesh.position.copy(around).add(offset);
        f.node.mesh.scale.set(f.scale.x * sRatio.x, f.scale.y * sRatio.y, f.scale.z * sRatio.z);
        this.applyPartScaleToChildren(f.node);
      }
    }

    // Mirror transforms to other Team Create builders during the drag, rather
    // than waiting for mouse-up. The 50ms throttle keeps WebSocket traffic
    // bounded while making the separate test clients feel live.
    const changed = this.getTransformPartNodes();
    for (const node of changed) {
      this.syncPartDataFromMesh(node);
      if (node.data.id === "baseplate") this.updateBaseplateGrid();
    }
    const now = performance.now();
    if (now - this.lastLiveBroadcastAt >= 50) {
      this.lastLiveBroadcastAt = now;
      for (const node of changed) this.broadcastPart(node.data.id);
    }
    this.cb.onLiveTransform?.();
  }

  private getTransformPartNodes(): PartNode[] {
    const changed = new Map<string, PartNode>();
    for (const ref of this.selection) {
      if (ref.kind === "part") {
        const node = this.parts.get(ref.id);
        if (node) changed.set(ref.id, node);
      } else if (ref.kind === "model") {
        for (const node of this.parts.values()) {
          if (node.data.parentId === ref.id) changed.set(node.data.id, node);
        }
      }
    }
    for (const follower of this.followerStart) changed.set(follower.node.data.id, follower.node);
    return [...changed.values()];
  }

  private applyPartScaleToChildren(_node: PartNode) {
    // Part meshes carry their own scale; nothing extra needed (kept for clarity).
  }

  private commitTransform(label: string) {
    const obj = this.transform.object;
    if (!obj || !this.dragStart) return;
    const primary = this.selection[this.selection.length - 1];
    if (primary?.kind === "model") {
      // pivot moved/rotated: apply translate delta, then bake child transforms
      const pivot = obj;
      if (this.transform.mode === "translate") {
        const delta = pivot.position.clone().sub(this.dragStart.pos);
        for (const node of this.parts.values()) {
          if (node.data.parentId === primary.id) node.mesh.position.add(delta);
        }
      }
      for (const node of this.parts.values()) {
        if (node.data.parentId === primary.id) this.syncPartDataFromMesh(node);
      }
      pivot.position.set(0, 0, 0);
      pivot.quaternion.identity();
    } else {
      for (const ref of this.selection) {
        if (ref.kind !== "part") continue;
        const node = this.parts.get(ref.id);
        if (node) this.syncPartDataFromMesh(node);
      }
    }
    const changed = this.getTransformPartNodes();
    for (const node of changed) {
      this.syncPartDataFromMesh(node);
      if (node.data.id === "baseplate") this.updateBaseplateGrid();
      // Always send the final transform so a short drag that ends inside the
      // live-update throttle window still reaches every collaborator.
      this.broadcastPart(node.data.id);
    }
    this.dragStart = null;
    this.followerStart = [];
    this.pushHistory(label);
  }

  private syncPartDataFromMesh(node: PartNode) {
    const d = node.data;
    d.position = [round3(node.mesh.position.x), round3(node.mesh.position.y), round3(node.mesh.position.z)];
    const e = new THREE.Euler().setFromQuaternion(node.mesh.quaternion, "XYZ");
    d.rotation = [round3(e.x / d2r), round3(e.y / d2r), round3(e.z / d2r)];
    d.size = [round3(node.mesh.scale.x), round3(node.mesh.scale.y), round3(node.mesh.scale.z)];
    this.applyTextureRepeat(node);
    node.selectBox.visible = true;
  }

  rotateSelectionY(deg: number) {
    let changed = false;
    for (const ref of this.selection) {
      if (ref.kind === "part") {
        const node = this.parts.get(ref.id);
        if (node) {
          node.mesh.rotateY(deg * d2r);
          this.syncPartDataFromMesh(node);
          changed = true;
        }
      }
    }
    if (!changed) {
      this.log("warn", "Select a part first — then rotate it (R / Ctrl+R)");
      return;
    }
    this.pushHistory("Rotate");
  }

  /** Fly the camera to a specific object (Explorer "Zoom To"). */
  focusObject(kind: "part" | "model", id: string) {
    const prev = this.selection;
    this.setSelection([{ kind, id }]);
    this.focusSelection();
    this.setSelection(prev);
  }

  focusSelection() {
    const box = new THREE.Box3();
    let has = false;
    for (const ref of this.selection) {
      if (ref.kind === "part") {
        const node = this.parts.get(ref.id);
        if (node) {
          box.expandByObject(node.mesh);
          has = true;
        }
      } else {
        for (const node of this.parts.values()) {
          if (node.data.parentId === ref.id) {
            box.expandByObject(node.mesh);
            has = true;
          }
        }
      }
    }
    if (!has) box.set(new THREE.Vector3(-24, 0, -24), new THREE.Vector3(24, 8, 24));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 8;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const target = center.clone().addScaledVector(dir, -Math.max(size * 1.6, 12));
    this.camAnim = { from: this.camera.position.clone(), to: target, t: 0 };
  }

  /* ------------------------- parts management ------------------------ */

  private buildPartNode(data: PartData): PartNode {
    const mesh = new THREE.Mesh(shapeGeometry(data.shape), this.buildMaterial(data));
    mesh.castShadow = data.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.partId = data.id;
    mesh.position.set(...data.position);
    mesh.rotation.set(data.rotation[0] * d2r, data.rotation[1] * d2r, data.rotation[2] * d2r);
    mesh.scale.set(...data.size);

    const selMat = new THREE.LineBasicMaterial({ color: SELECT_COLOR, depthTest: true, transparent: true, opacity: 0.95 });
    const selectBox = new THREE.LineSegments(boxEdges(), selMat);
    selectBox.visible = false;
    selectBox.raycast = () => {};
    mesh.add(selectBox);

    const hovMat = new THREE.LineBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0.35 });
    const hoverBox = new THREE.LineSegments(boxEdges(), hovMat);
    hoverBox.visible = false;
    hoverBox.raycast = () => {};
    mesh.add(hoverBox);

    const node: PartNode = { data, mesh, selectBox, hoverBox };
    this.applyTextureRepeat(node);
    return node;
  }

  private buildMaterial(data: PartData): THREE.MeshStandardMaterial {
    const def = materialDef(data.material);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(brickColorHex(data.color)),
      roughness: def.roughness,
      metalness: def.metalness,
      transparent: data.transparency > 0 || (def.opacity ?? 1) < 1,
      opacity: (1 - data.transparency) * (def.opacity ?? 1),
    });
    if (data.texture && this.assets.has(data.texture)) {
      mat.map = this.assetTexture(data.texture) ?? null;
    } else if (def.texture) {
      mat.map = getMaterialTexture(def.texture);
    }
    if (def.emissive) {
      mat.emissive = new THREE.Color(brickColorHex(data.color));
      mat.emissiveIntensity = def.emissive;
      if (data.material === "Neon") mat.toneMapped = false;
    }
    return mat;
  }

  private repeatTexCache = new Map<string, THREE.Texture>();

  private applyTextureRepeat(node: PartNode) {
    if (node.data.texture) return; // custom image textures keep their own repeat
    const def = materialDef(node.data.material);
    const mat = node.mesh.material as THREE.MeshStandardMaterial;
    if (!mat.map || !def.texture) return;
    const s = def.texScale ?? 4;
    const rx = Math.max(Math.round((node.data.size[0] / s) * 4) / 4, 0.05);
    const ry = Math.max(Math.round((node.data.size[2] / s) * 4) / 4, 0.05);
    const key = `${def.texture}:${rx}:${ry}`;
    let tex = this.repeatTexCache.get(key);
    if (!tex) {
      tex = getMaterialTexture(def.texture).clone();
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
      tex.needsUpdate = true;
      this.repeatTexCache.set(key, tex);
    }
    mat.map = tex;
  }

  /** Low-level: put a part into the scene (no history, no broadcast). */
  private mountPart(data: PartData) {
    if (this.parts.has(data.id)) return;
    const node = this.buildPartNode(data);
    this.parts.set(data.id, node);
    if (data.parentId && this.modelGroups.has(data.parentId)) {
      this.modelGroups.get(data.parentId)!.add(node.mesh);
    } else {
      data.parentId = null;
      this.scene.add(node.mesh);
    }
  }

  addPart(shape: PartShape, at?: Vec3, extra?: Partial<PartData>): PartData {
    if (!this.allow("parts")) throw new Error("READ_ONLY_PLACE");
    const spawnAt: Vec3 = at ?? this.groundPointFromCamera() ?? [0, 2, 0];
    const data: PartData = {
      id: uid("part"),
      name: shape === "Block" ? "Part" : `${shape}Part`,
      shape,
      position: [round3(spawnAt[0]), round3(spawnAt[1]), round3(spawnAt[2])],
      rotation: [0, 0, 0],
      size: [4, 4, 4],
      color: "Medium stone grey",
      material: "Plastic",
      transparency: 0,
      reflectance: 0,
      anchored: true,
      canCollide: true,
      castShadow: true,
      parentId: null,
      ...extra,
    };
    this.mountPart(data);
    this.setSelection([{ kind: "part", id: data.id }]);
    this.pushHistory(`Insert ${shape}`);
    this.log("success", `Inserted ${data.name} (${shape})`);
    this.broadcastPart(data.id);
    return data;
  }

  addParts(parts: PartData[], label: string) {
    if (!this.allow("parts")) return;
    for (const p of parts) this.mountPart({ ...p });
    this.setSelection(parts.map((p) => ({ kind: "part" as const, id: p.id })));
    this.pushHistory(label);
    for (const p of parts) this.broadcastPart(p.id);
  }

  /** Insert an empty Model (folder-like container) under Workspace. */
  addModel(name = "Model", parentId: string | null = null) {
    void parentId; // models are flat under Workspace for now
    const model = { id: uid("model"), name };
    this.models.set(model.id, model);
    const group = new THREE.Group();
    this.modelGroups.set(model.id, group);
    this.scene.add(group);
    this.setSelection([{ kind: "model", id: model.id }]);
    this.pushHistory(`Insert ${name}`);
    this.log("success", `Inserted ${name} in Workspace`);
    return model;
  }

  /** Insert a dummy avatar rig (grouped Model) at the camera focus point. */
  addRig(kind: RigKind) {
    const ground = this.getCameraGroundPoint();
    const origin: Vec3 = [ground[0], 0, ground[2]];
    const model = { id: uid("model"), name: kind === "R6" ? "Dummy" : "BlockRig" };
    this.models.set(model.id, model);
    const group = new THREE.Group();
    this.modelGroups.set(model.id, group);
    this.scene.add(group);
    const rigParts = makeRigParts(kind, origin);
    for (const p of rigParts) {
      this.mountPart({ ...p, parentId: model.id });
    }
    this.setSelection([{ kind: "model", id: model.id }]);
    this.pushHistory(`Insert ${RIG_LABELS[kind]}`);
    for (const p of rigParts) this.broadcastPart(p.id);
    this.log("success", `Spawned ${RIG_LABELS[kind]} (${rigParts.length} anchored parts) — drag it with the Move tool`);
    return model;
  }

  /** Insert a SpawnLocation pad at the camera focus point. */
  addSpawnLocation() {
    const ground = this.getCameraGroundPoint();
    return this.addPart("Block", [ground[0], 0.5, ground[2]], {
      name: "SpawnLocation",
      size: [12, 1, 12],
      isSpawn: true,
    });
  }

  private groundPointFromCamera(): Vec3 | null {
    const p = this.getCameraGroundPoint();
    return [p[0], 2, p[2]];
  }

  /** World point on the baseplate under the camera's look direction. */
  getCameraGroundPoint(): Vec3 {
    this.camera.updateMatrixWorld();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const raycaster = new THREE.Raycaster(this.camera.position.clone(), dir.normalize());
    const hit = raycaster.intersectObject(this.baseplate, false)[0];
    if (hit) return [round3(hit.point.x), round3(hit.point.y), round3(hit.point.z)];
    // Fallback lets the creator place parts while looking above the plate.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    const ray = new THREE.Ray(this.camera.position.clone(), dir);
    if (!ray.intersectPlane(plane, point)) point.set(0, 0, 0);
    const half = BASEPLATE_SIZE / 2 - 6;
    point.x = clamp(point.x, -half, half);
    point.z = clamp(point.z, -half, half);
    return [round3(point.x), round3(point.y), round3(point.z)];
  }

  setGridVisible(visible: boolean) {
    this.grid.visible = visible && !this.playing;
  }

  /** Rename the place (top bar input). */
  renamePlace(name: string) {
    this.placeName = name.slice(0, 60) || "Untitled";
    this.saveLocal();
  }

  deleteSelection() {
    if (!this.allow("parts")) return;
    const toDelete: string[] = [];
    const modelsToDelete: string[] = [];
    for (const ref of this.selection) {
      if (ref.kind === "part") toDelete.push(ref.id);
      else if (ref.kind === "model") {
        modelsToDelete.push(ref.id);
        for (const node of this.parts.values()) if (node.data.parentId === ref.id) toDelete.push(node.data.id);
      }
    }
    if (!toDelete.length && !modelsToDelete.length) {
      this.log("warn", "Nothing selected — click a part in the viewport or Explorer first");
      return;
    }
    for (const id of toDelete) {
      const node = this.parts.get(id);
      if (!node) continue;
      this.scene.remove(node.mesh);
      (node.mesh.material as THREE.Material).dispose();
      this.parts.delete(id);
      this.netSend?.({ type: "part:delete", id });
    }
    // selected models are removed together with their children
    for (const mid of modelsToDelete) {
      this.scene.remove(this.modelGroups.get(mid)!);
      this.modelGroups.delete(mid);
      this.models.delete(mid);
      this.pivots.get(mid)?.removeFromParent();
      this.pivots.delete(mid);
      this.animations.delete(mid);
      this.scripts = this.scripts.filter((s) => s.parentId !== mid);
    }
    this.setSelection([]);
    this.pushHistory("Delete");
    this.log("info", `Deleted ${toDelete.length} part(s)${modelsToDelete.length ? ` and ${modelsToDelete.length} model(s)` : ""}`);
  }

  copySelection() {
    const datas: PartData[] = [];
    for (const ref of this.selection) {
      if (ref.kind === "part") {
        const node = this.parts.get(ref.id);
        if (node) datas.push({ ...node.data });
      } else {
        for (const node of this.parts.values()) if (node.data.parentId === ref.id) datas.push({ ...node.data });
      }
    }
    if (!datas.length) {
      this.log("warn", "Nothing to copy — select a part first");
      return;
    }
    this.clipboard = datas;
    this.log("info", `Copied ${datas.length} object(s)`);
  }

  duplicateSelection() {
    const originals: PartData[] = [];
    for (const ref of this.selection) {
      if (ref.kind === "part") {
        const node = this.parts.get(ref.id);
        if (node) originals.push(node.data);
      } else {
        for (const node of this.parts.values()) if (node.data.parentId === ref.id) originals.push(node.data);
      }
    }
    if (!originals.length) {
      this.log("warn", "Nothing to duplicate — select a part first");
      return;
    }
    const copies = originals.map((o) => ({
      ...o,
      id: uid("part"),
      position: [o.position[0] + 4, o.position[1], o.position[2] + 4] as Vec3,
    }));
    for (const c of copies) this.mountPart(c);
    this.setSelection(copies.map((c) => ({ kind: "part" as const, id: c.id })));
    this.pushHistory("Duplicate");
    for (const c of copies) this.broadcastPart(c.id);
    this.log("success", `Duplicated ${copies.length} object(s)`);
  }

  pasteClipboard() {
    if (!this.clipboard.length) {
      this.log("warn", "Clipboard is empty — copy or cut a part first (Ctrl+C / Ctrl+X)");
      return;
    }
    const copies = this.clipboard.map((o) => ({
      ...o,
      id: uid("part"),
      position: [o.position[0] + 4, o.position[1], o.position[2] + 4] as Vec3,
    }));
    for (const c of copies) this.mountPart(c);
    this.setSelection(copies.map((c) => ({ kind: "part" as const, id: c.id })));
    this.pushHistory("Paste");
    for (const c of copies) this.broadcastPart(c.id);
  }

  groupSelection() {
    const partIds = this.selection.filter((r) => r.kind === "part").map((r) => (r as { kind: "part"; id: string }).id);
    if (partIds.length < 2) {
      this.log("warn", "Select at least two parts to group");
      return;
    }
    const model = { id: uid("model"), name: "Model" };
    this.models.set(model.id, model);
    const group = new THREE.Group();
    this.modelGroups.set(model.id, group);
    this.scene.add(group);
    for (const id of partIds) {
      const node = this.parts.get(id);
      if (!node) continue;
      const worldPos = node.mesh.position.clone();
      node.data.parentId = model.id;
      group.add(node.mesh);
      node.mesh.position.copy(worldPos);
    }
    this.setSelection([{ kind: "model", id: model.id }]);
    this.pushHistory("Group");
    this.log("success", `Grouped ${partIds.length} parts into Model`);
  }

  ungroupSelection() {
    const modelIds = this.selection.filter((r) => r.kind === "model").map((r) => (r as { kind: "model"; id: string }).id);
    if (!modelIds.length) {
      this.log("warn", "Select a Model in the Explorer to ungroup");
      return;
    }
    const freed: { kind: "part"; id: string }[] = [];
    for (const mid of modelIds) {
      for (const node of this.parts.values()) {
        if (node.data.parentId === mid) {
          const worldPos = node.mesh.position.clone();
          node.data.parentId = null;
          this.scene.add(node.mesh);
          node.mesh.position.copy(worldPos);
          freed.push({ kind: "part", id: node.data.id });
        }
      }
      this.scene.remove(this.modelGroups.get(mid)!);
      this.modelGroups.delete(mid);
      this.models.delete(mid);
    }
    this.setSelection(freed);
    this.pushHistory("Ungroup");
  }

  renamePart(id: string, name: string) {
    const node = this.parts.get(id);
    if (!node) return;
    node.data.name = name.slice(0, 50) || "Part";
    this.pushHistory("Rename");
    this.broadcastPart(id);
  }

  renameModel(id: string, name: string) {
    const m = this.models.get(id);
    if (!m) return;
    m.name = name.slice(0, 50) || "Model";
    this.pushHistory("Rename");
  }

  /** Update a part from the Properties panel (or remote). */
  updatePart(id: string, patch: Partial<PartData>, label = "Property change") {
    const node = this.parts.get(id);
    if (!node) return;
    if (label !== "__silent__" && !this.allow("parts")) return;
    const rebuildShape = patch.shape !== undefined && patch.shape !== node.data.shape;
    const oldParentId = node.data.parentId;
    Object.assign(node.data, patch);
    const d = node.data;
    if (patch.parentId !== undefined && patch.parentId !== oldParentId) {
      const group = patch.parentId ? this.modelGroups.get(patch.parentId) : null;
      const worldPos = node.mesh.position.clone();
      if (group) group.add(node.mesh);
      else {
        d.parentId = null;
        this.scene.add(node.mesh);
      }
      node.mesh.position.copy(worldPos);
    }
    if (patch.position) node.mesh.position.set(...d.position);
    if (patch.rotation) node.mesh.rotation.set(d.rotation[0] * d2r, d.rotation[1] * d2r, d.rotation[2] * d2r);
    if (patch.size) node.mesh.scale.set(...d.size);
    if (patch.shape) {
      if (rebuildShape) node.mesh.geometry = shapeGeometry(d.shape);
    }
    if (
      patch.color !== undefined || patch.material !== undefined || patch.transparency !== undefined ||
      patch.reflectance !== undefined || patch.texture !== undefined || patch.textureTiles !== undefined
    ) {
      const old = node.mesh.material as THREE.MeshStandardMaterial;
      if (id === "baseplate") {
        this.baseplateColor = brickColorHex(d.color);
        this.baseplateTop.color.set(this.baseplateColor);
        this.applyBaseplateTextureVisual();
      } else {
        old.dispose();
        node.mesh.material = this.buildMaterial(d);
      }
      if (patch.reflectance !== undefined) {
        (node.mesh.material as THREE.MeshStandardMaterial).metalness = clamp(d.reflectance * 0.95 + 0.05 * (1 - d.reflectance), 0, 1);
        (node.mesh.material as THREE.MeshStandardMaterial).roughness = clamp(1 - d.reflectance * 0.9, 0.05, 1);
      }
    }
    if (patch.castShadow !== undefined) node.mesh.castShadow = d.castShadow;
    if (id === "baseplate" && this.grid) this.updateBaseplateGrid();
    this.applyTextureRepeat(node);
    if (label !== "__silent__") {
      this.pushHistory(label);
      this.broadcastPart(id);
    }
  }

  /* -------------------------- UI objects ----------------------------- */

  getUiObjects(): UIObjectData[] {
    return this.uiObjects.map((item) => ({ ...item }));
  }

  addUiObject(className: UIElementClass): UIObjectData {
    if (!this.allow("parts")) throw new Error("READ_ONLY_UI");
    const count = this.uiObjects.filter((x) => x.className === className).length + 1;
    const object: UIObjectData = {
      id: uid("ui"),
      name: className === "Frame" ? "Frame" : `${className}_${count}`,
      className,
      x: className === "Frame" ? 8 : 14 + (count % 4) * 4,
      y: className === "Frame" ? 12 : 18 + (count % 5) * 5,
      width: className === "Frame" ? 42 : className === "TextBox" ? 30 : 24,
      height: className === "Frame" ? 36 : className === "TextLabel" ? 10 : 12,
      text: className === "TextButton" ? "Button" : className === "TextBox" ? "Type here..." : className === "TextLabel" ? "Label" : "",
      backgroundColor: className === "Frame" ? "#202b3b" : className === "TextButton" ? "#2877d4" : "#3b4658",
      textColor: "#ffffff",
      fontSize: 16,
      visible: true,
      zIndex: count,
    };
    this.uiObjects.push(object);
    this.pushHistory(`Insert ${className}`);
    this.netSend?.({ type: "ui:set", object });
    return { ...object };
  }

  updateUiObject(id: string, patch: Partial<UIObjectData>, label = "Edit UI") {
    if (!this.allow("parts")) return;
    const item = this.uiObjects.find((x) => x.id === id);
    if (!item) return;
    Object.assign(item, patch);
    item.x = clamp(Number(item.x) || 0, 0, 100);
    item.y = clamp(Number(item.y) || 0, 0, 100);
    item.width = clamp(Number(item.width) || 1, 1, 100);
    item.height = clamp(Number(item.height) || 1, 1, 100);
    item.fontSize = clamp(Number(item.fontSize) || 16, 8, 72);
    item.zIndex = clamp(Math.round(Number(item.zIndex) || 1), 1, 100);
    if (label === "__live__") {
      // Live UI drag preview: broadcast without adding dozens of undo entries.
      this.cb.onSceneChanged?.(this.serialize());
      this.netSend?.({ type: "ui:set", object: item });
      return;
    }
    this.pushHistory(label);
    this.netSend?.({ type: "ui:set", object: item });
  }

  deleteUiObject(id: string) {
    if (!this.allow("parts")) return;
    const before = this.uiObjects.length;
    this.uiObjects = this.uiObjects.filter((x) => x.id !== id);
    if (this.uiObjects.length !== before) {
      this.pushHistory("Delete UI object");
      this.netSend?.({ type: "ui:delete", id });
    }
  }

  applyRemoteUiObject(object: UIObjectData) {
    const idx = this.uiObjects.findIndex((x) => x.id === object.id);
    if (idx >= 0) this.uiObjects[idx] = { ...object };
    else this.uiObjects.push({ ...object });
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteUiDelete(id: string) {
    this.uiObjects = this.uiObjects.filter((x) => x.id !== id);
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteUiSync(objects: UIObjectData[]) {
    this.uiObjects = (objects ?? []).map((x) => ({ ...x }));
    this.cb.onSceneChanged?.(this.serialize());
  }

  /* ------------------------ scripts & assets ------------------------- */

  addScript(kind: ScriptKind, parentId?: string, name?: string): ScriptData {
    if (!this.allow("scripts")) throw new Error("READ_ONLY_SCRIPTS");
    const parent = parentId || DEFAULT_SCRIPT_PARENT[kind];
    const data: ScriptData = {
      id: uid("script"),
      name: name ?? kind,
      kind,
      parentId: parent,
      source: DEFAULT_SCRIPT_SOURCE[kind],
      enabled: true,
    };
    this.scripts.push(data);
    this.pushHistory(`Insert ${kind}`);
    this.netSend?.({ type: "script:set", script: data });
    this.log("success", `Created ${kind} "${data.name}" in ${parent}`);
    return data;
  }

  getScripts(): ScriptData[] {
    return this.scripts.map((s) => ({ ...s }));
  }

  /** Custom tools in the place's StarterPack (normalized: ToolToolTip etc. filled in). */
  getTools(): CustomToolData[] {
    return this.tools.map((t) => normalizeToolData(t));
  }

  /** Insert a custom tool into StarterPack (Tool Creator → place). */
  addTool(data: Omit<CustomToolData, "id">): CustomToolData {
    if (!this.allow("tools")) throw new Error("READ_ONLY_TOOLS");
    const tool: CustomToolData = { id: uid("tool"), ...data };
    this.tools.push(tool);
    this.pushHistory(`Insert Tool ${tool.name}`);
    this.log("success", `Added tool "${tool.name}" (${tool.behavior}) to StarterPack — it equips with a number key in Play mode`);
    return tool;
  }

  deleteTool(id: string) {
    if (!this.allow("tools")) return;
    const before = this.tools.length;
    this.tools = this.tools.filter((t) => t.id !== id);
    if (this.tools.length !== before) {
      this.pushHistory(`Delete Tool`);
      this.log("info", "Removed tool from StarterPack");
    }
  }

  getScript(id: string): ScriptData | null {
    const s = this.scripts.find((x) => x.id === id);
    return s ? { ...s } : null;
  }

  renameScript(id: string, name: string) {
    if (!this.allow("scripts")) return;
    const s = this.scripts.find((x) => x.id === id);
    if (!s) return;
    s.name = name.slice(0, 50) || s.kind;
    this.pushHistory("Rename script");
    this.netSend?.({ type: "script:set", script: s });
  }

  setScriptEnabled(id: string, enabled: boolean) {
    if (!this.allow("scripts")) return;
    const s = this.scripts.find((x) => x.id === id);
    if (!s) return;
    s.enabled = enabled;
    this.pushHistory(enabled ? "Enable script" : "Disable script");
    this.netSend?.({ type: "script:set", script: s });
  }

  setScriptSource(id: string, source: string) {
    if (!this.allow("scripts")) return false;
    const s = this.scripts.find((x) => x.id === id);
    if (!s) return false;
    s.source = source;
    this.pushHistory("Edit script");
    this.netSend?.({ type: "script:set", script: s });
    this.saveLocal();
    return true;
  }

  deleteScript(id: string) {
    if (!this.allow("scripts")) return;
    const idx = this.scripts.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = this.scripts.splice(idx, 1);
    if (this.selection.some((r) => r.kind === "script" && r.id === id)) {
      this.setSelection(this.selection.filter((r) => !(r.kind === "script" && r.id === id)));
    }
    this.pushHistory("Delete script");
    this.netSend?.({ type: "script:delete", id });
    this.log("info", `Deleted ${removed.kind} "${removed.name}"`);
  }

  /** Register an image data URL as a reusable texture asset; returns its id. */
  registerAsset(dataUrl: string): string {
    const id = uid("asset");
    this.assets.set(id, dataUrl);
    return id;
  }

  getAssets(): Record<string, string> {
    return Object.fromEntries(this.assets);
  }

  private assetTexture(assetId: string): THREE.Texture | null {
    const dataUrl = this.assets.get(assetId);
    if (!dataUrl) return null;
    let tex = this.assetTexCache.get(assetId);
    if (!tex) {
      tex = new THREE.TextureLoader().load(dataUrl);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.assetTexCache.set(assetId, tex);
    }
    return tex;
  }

  /** Apply (or clear) a custom image texture on the baseplate. */
  setBaseplateTexture(assetId: string | null, tiles = 64) {
    this.baseplateTextureId = assetId;
    this.baseplateTiles = clamp(Math.round(tiles), 1, 512);
    if (assetId && this.assets.has(assetId)) this.baseplateTextureId = assetId;
    else this.baseplateTextureId = null;
    this.applyBaseplateTextureVisual();
    this.pushHistory("Baseplate texture");
    this.log("success", assetId ? "Applied image to the baseplate" : "Baseplate texture reset to studs");
  }

  getBaseplateTexture(): { id: string | null; tiles: number } {
    return { id: this.baseplateTextureId, tiles: this.baseplateTiles };
  }

  /** Recolor the baseplate (used by scripts: workspace.Baseplate.Color = ...). */
  setBaseplateColor(hex: string) {
    this.baseplateColor = hex;
    this.baseplateTop.color = new THREE.Color(hex);
    this.baseplateTop.needsUpdate = true;
    this.pushHistory("Baseplate color");
  }

  private applyBaseplateTextureVisual() {
    if (!this.baseplateTop) return;
    if (this.baseplateTextureId && this.assets.has(this.baseplateTextureId)) {
      const tex = this.assetTexture(this.baseplateTextureId)!.clone();
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(this.baseplateTiles, this.baseplateTiles);
      this.baseplateTop.map = tex;
    } else {
      this.baseplateTextureId = null;
      const studs = getMaterialTexture("studs").clone();
      studs.wrapS = THREE.RepeatWrapping;
      studs.wrapT = THREE.RepeatWrapping;
      studs.repeat.set(BASEPLATE_SIZE, BASEPLATE_SIZE);
      this.baseplateTop.map = studs;
    }
    this.baseplateTop.needsUpdate = true;
  }

  /** Apply (or clear) a custom image texture on a part. */
  setPartTexture(id: string, assetId: string | null, tiles = 1) {
    const patch: Partial<PartData> = { texture: assetId, textureTiles: clamp(Math.round(tiles), 1, 64) };
    this.updatePart(id, patch, "Apply texture");
    this.log("success", assetId ? "Applied image texture to part" : "Part texture cleared");
  }

  /* --------------------------- animations ---------------------------- */

  /** Create a part at runtime from a script (Instance.new) — no history noise. */
  spawnScriptPart(className: string): string | null {
    const shape: PartShape =
      className === "Ball" ? "Sphere" : className === "Wedge" ? "Wedge" : className === "Cylinder" ? "Cylinder" : "Block";
    const isSpawn = className === "SpawnLocation";
    const data: PartData = {
      id: uid("part"),
      name: isSpawn ? "SpawnLocation" : "Part",
      shape,
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      size: [4, 4, 4],
      color: "Medium stone grey",
      material: "Plastic",
      transparency: 0,
      reflectance: 0,
      anchored: true,
      canCollide: true,
      castShadow: true,
      parentId: null,
      isSpawn,
    };
    this.mountPart(data);
    return data.id;
  }

  /** Create a model at runtime from a script. */
  spawnScriptModel(name: string): string {
    const model = { id: uid("model"), name };
    this.models.set(model.id, model);
    const group = new THREE.Group();
    this.modelGroups.set(model.id, group);
    this.scene.add(group);
    return model.id;
  }

  /** Delete a part at runtime from a script — no history noise. */
  deleteScriptPart(id: string) {
    const node = this.parts.get(id);
    if (!node) return;
    this.scene.remove(node.mesh);
    (node.mesh.material as THREE.Material).dispose();
    this.parts.delete(id);
  }

  getModelsList(): { id: string; name: string }[] {
    return [...this.models.values()].map((m) => ({ ...m }));
  }

  getModelParts(modelId: string): PartData[] {
    return [...this.parts.values()].filter((n) => n.data.parentId === modelId).map((n) => ({ ...n.data }));
  }

  setModelAnimations(modelId: string, anims: AnimationData[]) {
    if (!this.allow("animations")) return false;
    this.animations.set(modelId, anims.map((a) => ({ ...a })));
    this.pushHistory("Save animation");
    return true;
  }

  getModelAnimations(modelId: string): AnimationData[] {
    return (this.animations.get(modelId) ?? []).map((a) => ({ ...a, tracks: { ...a.tracks } }));
  }

  /** Directly pose a part mesh (no history) — used by the animation editor. */
  setPartPose(id: string, pos: Vec3, rot: Vec3) {
    const node = this.parts.get(id);
    if (!node) return;
    node.mesh.position.set(...pos);
    node.mesh.rotation.set(rot[0] * d2r, rot[1] * d2r, rot[2] * d2r);
  }

  /* ------------------------ state serialization ----------------------- */

  serialize(): PlaceState {
    return {
      version: 1,
      name: this.placeName,
      parts: [...this.parts.values()].map((n) => ({ ...n.data })),
      models: [...this.models.values()].map((m) => ({ ...m })),
      lighting: { ...this.lighting },
      scripts: this.scripts.map((s) => ({ ...s })),
      assets: this.assets.size ? Object.fromEntries(this.assets) : undefined,
      baseplateTexture: this.baseplateTextureId,
      baseplateTiles: this.baseplateTiles,
      animations: this.animations.size ? Object.fromEntries(this.animations) : undefined,
      tools: this.tools.length ? this.tools.map((t) => ({ ...t })) : undefined,
      uiObjects: this.uiObjects.length ? this.uiObjects.map((x) => ({ ...x })) : undefined,
      baseplateColor: this.baseplateColor,
    };
  }

  loadState(state: PlaceState, announce = true) {
    for (const node of this.parts.values()) {
      this.scene.remove(node.mesh);
      (node.mesh.material as THREE.Material).dispose();
    }
    this.parts.clear();
    for (const [mid, group] of this.modelGroups) this.scene.remove(group);
    this.modelGroups.clear();
    this.models.clear();
    for (const p of this.pivots.values()) this.scene.remove(p);
    this.pivots.clear();
    this.selection = [];
    this.transform.detach();
    this.placeName = state.name || "Untitled";
    this.lighting = { ...state.lighting };
    this.applyLighting();
    // scripts / assets / animations / baseplate texture
    this.scripts = (state.scripts ?? []).map((s) => ({ ...s }));
    this.assets.clear();
    for (const [k, v] of Object.entries(state.assets ?? {})) this.assets.set(k, v);
    this.animations.clear();
    for (const [k, v] of Object.entries(state.animations ?? {})) this.animations.set(k, v);
    this.uiObjects = (state.uiObjects ?? []).map((item) => ({ ...item }));
    this.baseplateColor = state.baseplateColor ?? "#a3a2a5";
    this.tools = (state.tools ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      behavior: t.behavior,
      damage: Number(t.damage) || 0,
      reach: Number(t.reach) || 5,
      speedMult: Number(t.speedMult) || 1,
      jumpMult: Number(t.jumpMult) || 1,
      healAmount: Number(t.healAmount) || 0,
      handleShape: t.handleShape,
      handleColor: t.handleColor,
      desc: t.desc,
    }));
    this.baseplateTextureId = state.baseplateTexture ?? null;
    this.baseplateTiles = state.baseplateTiles ?? 64;
    if (!this.baseplateTextureId || !this.assets.has(this.baseplateTextureId)) this.baseplateTextureId = null;
    for (const m of state.models ?? []) {
      this.models.set(m.id, { id: m.id, name: m.name });
      const group = new THREE.Group();
      this.modelGroups.set(m.id, group);
      this.scene.add(group);
    }
    for (const p of state.parts ?? []) this.mountPart({ ...p });
    if (!this.parts.has("baseplate")) {
      this.mountPart({
        id: "baseplate", name: "Baseplate", shape: "Block", position: [0, -8, 0], rotation: [0, 0, 0],
        size: [BASEPLATE_SIZE, 16, BASEPLATE_SIZE], color: "Medium stone grey", material: "Plastic",
        transparency: 0, reflectance: 0, anchored: true, canCollide: true, castShadow: false, parentId: null,
      });
    }
    const bpNode = this.parts.get("baseplate")!;
    const previousMaterial = bpNode.mesh.material as THREE.Material;
    if (previousMaterial !== this.baseplateTop) previousMaterial.dispose();
    this.baseplateTop = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.baseplateColor), roughness: 0.85, map: getMaterialTexture("studs").clone() });
    this.baseplateTop.map!.wrapS = THREE.RepeatWrapping;
    this.baseplateTop.map!.wrapT = THREE.RepeatWrapping;
    this.baseplateTop.map!.repeat.set(BASEPLATE_SIZE, BASEPLATE_SIZE);
    this.baseplate = bpNode.mesh;
    this.baseplate.material = this.baseplateTop;
    this.baseplate.receiveShadow = true;
    this.updateBaseplateGrid();
    this.applyBaseplateTextureVisual();
    if (announce) this.cb.onSceneChanged?.(this.serialize());
    this.cb.onSelectionChanged?.([]);
  }

  newPlace(templateId = "baseplate") {
    const t = makeTemplatePlace(templateId);
    this.loadState({
      version: 1,
      name: t.name,
      parts: t.parts,
      models: t.models,
      lighting: t.lighting,
      scripts: t.scripts,
    });
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory("New place", true);
    this.saveLocal();
    this.cb.onFreshPlace?.();
    this.log("success", `Created new place from the "${t.name}" template`);
  }

  /** Load a template without touching the autosave (used by Play from the website). */
  loadTemplateOnly(templateId = "baseplate", name?: string) {
    const t = makeTemplatePlace(templateId);
    this.loadState({
      version: 1,
      name: name ?? t.name,
      parts: t.parts,
      models: t.models,
      lighting: t.lighting,
      scripts: t.scripts,
    });
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory("Open experience", true);
    this.log("info", `Loaded "${this.placeName}" for play testing`);
  }

  /* ------------------------------ history ---------------------------- */

  pushHistory(label: string, silent = false) {
    const after = this.serialize();
    if (this.historyIndex >= 0) {
      const current = this.history[this.historyIndex];
      if (JSON.stringify(current.after) === JSON.stringify(after)) return;
    }
    this.history = this.history.slice(0, this.historyIndex + 1);
    const before = this.historyIndex >= 0 ? this.history[this.historyIndex].after : after;
    this.history.push({ label, before, after });
    if (this.history.length > 120) this.history.shift();
    this.historyIndex = this.history.length - 1;
    if (!silent) {
      this.cb.onSceneChanged?.(after);
      this.saveLocal();
    }
  }

  undo() {
    if (this.historyIndex < 0) return;
    const entry = this.history[this.historyIndex];
    this.historyIndex -= 1;
    this.loadState(entry.before, false);
    this.cb.onSceneChanged?.(entry.before);
    this.saveLocal();
    this.log("info", `Undo ${entry.label}`);
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    const entry = this.history[this.historyIndex];
    this.loadState(entry.after, false);
    this.cb.onSceneChanged?.(entry.after);
    this.saveLocal();
    this.log("info", `Redo ${entry.label}`);
  }

  canUndo() {
    return this.historyIndex >= 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  /* --------------------------- persistence --------------------------- */

  static STORAGE_KEY = "blockyard-studio-place-v1";

  /** Peek at the autosaved place without loading it (for the start page). */
  static peekLocal(): { name: string; parts: number; state: PlaceState } | null {
    try {
      const raw = localStorage.getItem(StudioEngine.STORAGE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as PlaceState;
      if (!state || !Array.isArray(state.parts) || !state.parts.length) return null;
      return { name: state.name || "Untitled", parts: state.parts.length, state };
    } catch {
      return null;
    }
  }

  saveLocal() {
    // play-mode part patches (animations, script edits) are transient —
    // never persist them. The pre-play snapshot is saved by startPlay, and
    // stopPlay re-saves once the place is restored.
    if (this.playing) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    // capture the state NOW: the write is debounced, and a play test that
    // starts in between must not leak mid-animation poses into the autosave
    const data = JSON.stringify(this.serialize());
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(StudioEngine.STORAGE_KEY, data);
      } catch {
        /* quota */
      }
    }, 600);
  }

  tryLoadLocal(): boolean {
    const peek = StudioEngine.peekLocal();
    if (!peek) return false;
    this.loadState(peek.state, false);
    this.pushHistory("Open", true);
    this.log("info", `Restored autosaved place "${peek.name}" (${peek.parts} parts)`);
    return true;
  }

  loadLocalState(state: PlaceState) {
    this.loadState(state);
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory("Open", true);
    this.saveLocal();
    this.cb.onFreshPlace?.();
    this.log("info", `Opened "${state.name}" (${state.parts.length} parts)`);
  }

  exportToFile() {
    const blob = new Blob([JSON.stringify(this.serialize(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.placeName.replace(/\s+/g, "_") || "place"}.rbxly.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.log("success", "Place saved to file");
  }

  openFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const state = JSON.parse(String(reader.result)) as PlaceState;
        if (!Array.isArray(state.parts)) throw new Error("bad file");
        this.loadState(state);
        this.history = [];
        this.historyIndex = -1;
        this.pushHistory("Open file", true);
        this.saveLocal();
        this.log("success", `Opened ${file.name}`);
      } catch {
        this.log("error", `Could not open ${file.name}: not a valid place file`);
      }
    };
    reader.readAsText(file);
  }

  /* -------------------------- multiplayer glue ------------------------ */

  broadcastPart(id: string) {
    if (!this.netSend) return;
    const node = this.parts.get(id);
    if (node) this.netSend({ type: "part:set", part: node.data });
  }

  broadcastFull() {
    if (!this.netSend) return;
    this.netSend({ type: "parts:sync", parts: [...this.parts.values()].map((n) => n.data) });
    this.netSend({ type: "scripts:sync", scripts: this.scripts });
    this.netSend({ type: "ui:sync", objects: this.uiObjects });
  }

  applyRemotePart(data: PartData) {
    if (this.playing) return;
    const existing = this.parts.get(data.id);
    if (existing) this.updatePart(data.id, { ...data }, "__silent__");
    else this.mountPart({ ...data });
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteDelete(id: string) {
    const node = this.parts.get(id);
    if (!node) return;
    this.scene.remove(node.mesh);
    (node.mesh.material as THREE.Material).dispose();
    this.parts.delete(id);
    this.setSelection(this.selection.filter((s) => !(s.kind === "part" && s.id === id)));
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteSync(parts: PartData[]) {
    if (this.playing) return;
    this.loadState({ version: 1, name: this.placeName, parts, models: [], lighting: this.lighting }, false);
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteScript(script: ScriptData) {
    const idx = this.scripts.findIndex((x) => x.id === script.id);
    if (idx >= 0) this.scripts[idx] = { ...script };
    else this.scripts.push({ ...script });
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteScriptDelete(id: string) {
    this.scripts = this.scripts.filter((x) => x.id !== id);
    this.cb.onSceneChanged?.(this.serialize());
  }

  applyRemoteScriptSync(scripts: ScriptData[]) {
    this.scripts = (scripts ?? []).map((x) => ({ ...x }));
    this.cb.onSceneChanged?.(this.serialize());
  }

  /** Update a separate Play window from the live editor without resetting its player/avatar. */
  syncFromState(state: PlaceState) {
    const incoming = new Map((state.parts ?? []).map((p) => [p.id, p]));
    for (const [id, node] of [...this.parts.entries()]) {
      if (!incoming.has(id)) {
        this.scene.remove(node.mesh);
        const material = node.mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material.dispose();
        this.parts.delete(id);
      }
    }
    for (const p of incoming.values()) {
      if (this.parts.has(p.id)) this.updatePart(p.id, { ...p }, "__silent__");
      else this.mountPart({ ...p });
    }
    this.scripts = (state.scripts ?? []).map((x) => ({ ...x }));
    this.uiObjects = (state.uiObjects ?? []).map((x) => ({ ...x }));
    this.assets.clear();
    for (const [key, value] of Object.entries(state.assets ?? {})) this.assets.set(key, value);
    this.tools = (state.tools ?? []).map((tool) => ({ ...tool }));
    this.animations.clear();
    for (const [key, value] of Object.entries(state.animations ?? {})) this.animations.set(key, value);
    this.lighting = { ...state.lighting };
    this.applyLighting();
    this.baseplateTextureId = state.baseplateTexture ?? null;
    this.baseplateTiles = state.baseplateTiles ?? 64;
    this.baseplateColor = state.baseplateColor ?? "#a3a2a5";
    const bp = this.parts.get("baseplate");
    if (bp) this.baseplate = bp.mesh;
    this.updateBaseplateGrid();
    this.baseplateTop.color.set(this.baseplateColor);
    this.applyBaseplateTextureVisual();
  }

  /* ------------------------------ play mode --------------------------- */

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.transform.detach();
    this.transformHelper.visible = false;
    this.grid.visible = !playing;
    this.cb.onPlayChanged?.(playing);
    if (playing) {
      this.setSelection([], false);
      this.camVelocity.set(0, 0, 0);
      this.keys.clear();
    }
  }

  /* ------------------------------- misc ------------------------------- */

  log(level: LogLevel, text: string) {
    this.cb.onLog?.(level, text);
  }

  getPartData(id: string): PartData | null {
    return this.parts.get(id)?.data ?? null;
  }

  getModel(id: string): { id: string; name: string } | null {
    return this.models.get(id) ?? null;
  }

  /** Parts list ordered for the Explorer (Workspace children first). */
  explorerData(): { models: { id: string; name: string }[]; parts: PartData[] } {
    return {
      models: [...this.models.values()],
      parts: [...this.parts.values()].filter((n) => !n.data.parentId).map((n) => n.data),
    };
  }

  /** All part data (for explorer children, netcode, etc.). */
  getAllParts(): PartData[] {
    return [...this.parts.values()].map((n) => ({ ...n.data }));
  }

  spawnPoint(): Vec3 {
    for (const node of this.parts.values()) {
      if (node.data.isSpawn) {
        return [node.data.position[0], node.data.position[1] + node.data.size[1] / 2, node.data.position[2]];
      }
    }
    return [0, 1, 0];
  }

  /** Collision helpers shared with the play controller. */
  *collisionParts(): Generator<{ data: PartData; mesh: THREE.Mesh }> {
    for (const node of this.parts.values()) {
      if (node.data.canCollide) yield { data: node.data, mesh: node.mesh };
    }
  }

  getPartCount(): number {
    return this.parts.size;
  }

  /* ------------------------------ render ------------------------------ */

  private animate = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.playing) this.flyCamera(dt);
    else this.playController?.update(dt);
    this.renderer.render(this.scene, this.camera);

    this.fpsAcc += dt;
    this.fpsFrames += 1;
    this.statTimer += dt;
    if (this.statTimer > 0.5) {
      const fps = this.fpsFrames / Math.max(this.fpsAcc, 1e-6);
      this.statTimer = 0;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      const p = this.camera.position;
      this.cb.onStats?.(Math.round(fps), [round3(p.x), round3(p.y), round3(p.z)]);
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.transform.dispose();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
  }
}
