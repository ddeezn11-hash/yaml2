import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Animation playback runtime — the play-mode half of the Animation    */
/* editor, mirroring the Roblox animation stack:                       */
/*                                                                    */
/*   local animator = humanoid.Animator                                */
/*   local track    = animator:LoadAnimation(anim)  -- AnimationTrack  */
/*   track:Play(fadeTime, weight, speed)                               */
/*   track:Stop(fadeTime)                                              */
/*   track:AdjustSpeed(n) · track:AdjustWeight(n)                      */
/*   track.Looped · track.Priority · track.Stopped · track.DidLoop     */
/*                                                                    */
/* Tracks target limbs BY NAME (the same regexes the preset library   */
/* uses), so built-in emote presets AND animations saved on any R6 /  */
/* R15 rig in the Animation editor can both play on the live player   */
/* character. Emotes run at Action priority, so they override the     */
/* procedural walk cycle only on the limbs they actually animate.     */
/* ------------------------------------------------------------------ */

/** The parts of an avatar the animator knows how to pose. */
export interface AnimatableRig {
  root: THREE.Group;
  torso?: THREE.Group;
  head?: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

/** One key of a track: offsets from the limb's base pose. */
export interface RelKey {
  t: number;
  /** Rotation offset in degrees. */
  rot?: [number, number, number];
  /** Position offset in studs. */
  pos?: [number, number, number];
}

/** A loadable animation (tracks keyed by rig part NAME, Roblox-style). */
export interface LoadableAnim {
  name: string;
  duration: number;
  loop: boolean;
  tracks: Record<string, RelKey[]>;
  /** Editor-saved animations store absolute poses — the first key is the base. */
  absolute?: boolean;
}

/** Roblox Enum.AnimationPriority ordering (Core < Idle < Movement < Action). */
export type AnimPriority = 0 | 1 | 2 | 3;

export interface AnimTrackHandle {
  token: string;
  name: string;
  length: number;
  looped: boolean;
}

export type TrackProp =
  | "IsPlaying" | "Length" | "Looped" | "Speed" | "Priority"
  | "TimePosition" | "WeightCurrent" | "Name";

const TRACK_PROPS = new Set<string>([
  "IsPlaying", "Length", "Looped", "Speed", "Priority", "TimePosition", "WeightCurrent", "Name",
]);

type LimbKey = "torso" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

const LIMB_MATCHERS: [LimbKey, RegExp][] = [
  ["leftArm", /left arm|left upperarm|left lowerarm|left hand/i],
  ["rightArm", /right arm|right upperarm|right lowerarm|right hand/i],
  ["leftLeg", /left leg|left upperleg|left lowerleg|left foot/i],
  ["rightLeg", /right leg|right upperleg|right lowerleg|right foot/i],
  ["head", /head/i],
  ["torso", /torso|humanoidroot/i],
];

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function limbOf(partName: string): LimbKey | null {
  for (const [limb, re] of LIMB_MATCHERS) if (re.test(partName)) return limb;
  return null;
}

interface Sampled { rot: [number, number, number]; pos: [number, number, number] }

function sampleKeys(keys: RelKey[], time: number): Sampled {
  const zero: Sampled = { rot: [0, 0, 0], pos: [0, 0, 0] };
  if (!keys.length) return zero;
  if (time <= keys[0].t) return { rot: keys[0].rot ?? [0, 0, 0], pos: keys[0].pos ?? [0, 0, 0] };
  const last = keys[keys.length - 1];
  if (time >= last.t) return { rot: last.rot ?? [0, 0, 0], pos: last.pos ?? [0, 0, 0] };
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = (time - a.t) / (b.t - a.t || 1e-6);
  return {
    rot: [lerp(a.rot?.[0] ?? 0, b.rot?.[0] ?? 0, k), lerp(a.rot?.[1] ?? 0, b.rot?.[1] ?? 0, k), lerp(a.rot?.[2] ?? 0, b.rot?.[2] ?? 0, k)],
    pos: [lerp(a.pos?.[0] ?? 0, b.pos?.[0] ?? 0, k), lerp(a.pos?.[1] ?? 0, b.pos?.[1] ?? 0, k), lerp(a.pos?.[2] ?? 0, b.pos?.[2] ?? 0, k)],
  };
}

class Track {
  token: string;
  name: string;
  length: number;
  looped: boolean;
  priority: AnimPriority = 3; // Action — emotes override the walk cycle
  speed = 1;
  time = 0;
  weight = 0;
  weightTarget = 0;
  fadeRate = 10;
  playing = false;
  /** natural (non-looping) end reached — remove once faded out */
  ending = false;
  /** monotonic load order — tie-breaker when two tracks share priority */
  seq: number;
  limbs = new Map<LimbKey, RelKey[]>();

  constructor(token: string, spec: LoadableAnim, seq: number) {
    this.token = token;
    this.name = spec.name;
    this.length = Math.max(0.05, spec.duration);
    this.looped = spec.loop;
    this.seq = seq;
    for (const [partName, rawKeys] of Object.entries(spec.tracks)) {
      const limb = limbOf(partName);
      if (!limb || !rawKeys?.length) continue;
      const keys = [...rawKeys].sort((a, b) => a.t - b.t);
      let out: RelKey[] = keys;
      if (spec.absolute) {
        // editor saves are absolute poses — subtract the base (first) key
        const first = keys[0];
        out = keys.map((k) => ({
          t: k.t,
          rot: [
            (k.rot?.[0] ?? 0) - (first.rot?.[0] ?? 0),
            (k.rot?.[1] ?? 0) - (first.rot?.[1] ?? 0),
            (k.rot?.[2] ?? 0) - (first.rot?.[2] ?? 0),
          ] as [number, number, number],
          pos: [
            (k.pos?.[0] ?? 0) - (first.pos?.[0] ?? 0),
            (k.pos?.[1] ?? 0) - (first.pos?.[1] ?? 0),
            (k.pos?.[2] ?? 0) - (first.pos?.[2] ?? 0),
          ] as [number, number, number],
        }));
      }
      this.limbs.set(limb, out);
    }
  }
}

/**
 * Plays AnimationTracks on ONE avatar. Step it AFTER the procedural walk
 * code has set the limb rotations — active tracks then blend on top.
 */
export class AvatarAnimator implements TrackPlayer {
  private rig: AnimatableRig;
  private base = new Map<LimbKey, THREE.Vector3>();
  private tracks: Track[] = [];
  private seq = 0;

  /** track.Stopped — fires once when a track stops (manual or natural end). */
  onStopped?: (token: string, name: string) => void;
  /** track.DidLoop — fires every time a looping track wraps around. */
  onLooped?: (token: string, name: string) => void;

  constructor(rig: AnimatableRig) {
    this.rig = rig;
    for (const [limb] of LIMB_MATCHERS) {
      const g = this.groupOf(limb);
      if (g) this.base.set(limb, g.position.clone());
    }
  }

  private groupOf(limb: LimbKey): THREE.Group | null {
    switch (limb) {
      case "torso": return this.rig.torso ?? null;
      case "head": return this.rig.head ?? null;
      default: return this.rig[limb] ?? null;
    }
  }

  private find(token: string): Track | null {
    return this.tracks.find((t) => t.token === token) ?? null;
  }

  /** Animator:LoadAnimation(anim) — create a (not yet playing) track. */
  load(spec: LoadableAnim): AnimTrackHandle {
    const track = new Track(`trk${++this.seq}`, spec, this.seq);
    this.tracks.push(track);
    return { token: track.token, name: track.name, length: track.length, looped: track.looped };
  }

  /** AnimationTrack:Play(fadeTime = 0.1, weight = 1, speed = 1) */
  play(token: string, fade = 0.1, weight = 1, speed = 1) {
    const t = this.find(token);
    if (!t) return;
    // restart from the beginning when the track isn't already playing —
    // like Roblox, a stopped/finished track can simply be Played again
    if (!t.playing) t.time = 0;
    t.playing = true;
    t.ending = false;
    t.speed = speed;
    t.weightTarget = Math.max(0, weight);
    t.fadeRate = 1 / Math.max(0.01, fade);
  }

  /** AnimationTrack:Stop(fadeTime = 0.1) */
  stop(token: string, fade = 0.1) {
    const t = this.find(token);
    if (!t) return;
    if (t.playing) this.onStopped?.(t.token, t.name);
    t.playing = false;
    t.ending = true;
    t.weightTarget = 0;
    t.fadeRate = 1 / Math.max(0.01, fade);
  }

  /** AnimationTrack:AdjustSpeed / AdjustWeight */
  adjust(token: string, patch: { speed?: number; weight?: number }) {
    const t = this.find(token);
    if (!t) return;
    if (patch.speed !== undefined && isFinite(patch.speed)) t.speed = patch.speed;
    if (patch.weight !== undefined && isFinite(patch.weight)) t.weightTarget = Math.max(0, patch.weight);
  }

  stopAll(fade = 0.15) {
    for (const t of [...this.tracks]) this.stop(t.token, fade);
  }

  getProp(token: string, prop: string): number | boolean | string | null {
    const t = this.find(token);
    if (!t || !TRACK_PROPS.has(prop)) return null;
    switch (prop as TrackProp) {
      case "IsPlaying": return t.playing;
      case "Length": return t.length;
      case "Looped": return t.looped;
      case "Speed": return t.speed;
      case "Priority": return t.priority;
      case "TimePosition": return t.time;
      case "WeightCurrent": return t.weight;
      case "Name": return t.name;
    }
  }

  setProp(token: string, prop: string, value: number | boolean | string) {
    const t = this.find(token);
    if (!t) return;
    switch (prop as TrackProp) {
      case "Looped": if (typeof value === "boolean") t.looped = value; break;
      case "Speed": if (isFinite(Number(value))) t.speed = Number(value); break;
      case "TimePosition": if (isFinite(Number(value))) t.time = Math.max(0, Math.min(t.length, Number(value))); break;
      case "Priority": {
        const n = Number(value);
        if (isFinite(n)) t.priority = Math.max(0, Math.min(3, Math.round(n))) as AnimPriority;
        break;
      }
      case "WeightCurrent": if (isFinite(Number(value))) t.weightTarget = Math.max(0, Number(value)); break;
    }
  }

  /** Name of the newest playing Action-priority track (for the HUD). */
  activeEmote(): string | null {
    let best: Track | null = null;
    for (const t of this.tracks) {
      if (!t.playing || t.weight <= 0.05) continue;
      if (t.priority >= 2 && (!best || t.seq >= best.seq)) best = t;
    }
    return best?.name ?? null;
  }

  /** Advance every track and blend the winners onto the rig limbs. */
  update(dt: number) {
    // --- advance time / weight / loop / end ---
    for (const tr of [...this.tracks]) {
      if (tr.playing) {
        tr.time += dt * tr.speed;
        if (tr.time >= tr.length) {
          if (tr.looped) {
            tr.time %= tr.length;
            this.onLooped?.(tr.token, tr.name);
          } else {
            // natural end: stop + fade out
            tr.playing = false;
            tr.ending = true;
            tr.weightTarget = 0;
            this.onStopped?.(tr.token, tr.name);
          }
        }
      }
      // ease the blend weight toward its target
      const dir = Math.sign(tr.weightTarget - tr.weight);
      if (dir !== 0) {
        tr.weight += dir * tr.fadeRate * dt;
        if ((dir > 0 && tr.weight >= tr.weightTarget) || (dir < 0 && tr.weight <= tr.weightTarget)) {
          tr.weight = tr.weightTarget;
        }
      }
      // finished fading out: KEEP the track — like a Roblox AnimationTrack,
      // it stays loaded on the Animator so Play() can restart it later
      if (tr.ending && tr.weight <= 0) {
        tr.ending = false;
        tr.playing = false;
      }
    }
    if (!this.tracks.length) return;

    // --- pick + apply the winning track per limb ---
    for (const [limb] of LIMB_MATCHERS) {
      const group = this.groupOf(limb);
      if (!group) continue;
      let best: Track | null = null;
      for (const tr of this.tracks) {
        if (!tr.limbs.has(limb) || tr.weight <= 0.001) continue;
        if (!best || tr.priority > best.priority || (tr.priority === best.priority && tr.seq > best.seq)) best = tr;
      }
      if (!best) continue;
      const keys = best.limbs.get(limb)!;
      const s = sampleKeys(keys, best.time);
      const w = Math.min(1, best.weight);

      // rotation: blend over whatever the walk cycle set this frame
      group.rotation.set(
        lerp(group.rotation.x, s.rot[0] * D2R, w),
        lerp(group.rotation.y, s.rot[1] * D2R, w),
        lerp(group.rotation.z, s.rot[2] * D2R, w),
      );

      // position: offset from the captured base pose
      // (torso Y clamped so "sit"-style presets can't bury the character)
      const base = this.base.get(limb) ?? group.position;
      let py = s.pos[1];
      if (limb === "torso") py = Math.max(-0.5, Math.min(1.0, py));
      group.position.set(
        lerp(base.x, base.x + s.pos[0], w),
        lerp(base.y, base.y + py, w),
        lerp(base.z, base.z + s.pos[2], w),
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* PartRigAnimator — plays tracks on a MODEL made of individual parts  */
/* (an R6/R15 dummy spawned from the Avatar tab, or any model whose    */
/* parts carry limb names). Same Animator/AnimationTrack semantics as  */
/* AvatarAnimator, but it writes part Position + Rotation patches      */
/* through a callback instead of posing THREE groups — so NPC dummies  */
/* in the Workspace can be animated by scripts:                        */
/*                                                                     */
/*   local animator = workspace.Dummy:FindFirstChild("Animator")        */
/*   local wave = animator:LoadAnimation("Wave")                       */
/*   wave:Play()                                                       */
/* ------------------------------------------------------------------ */

/** The part facts the animator needs (a subset of PartData). */
export interface RigPartInfo {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
}

/** Sink for computed limb transforms (e.g. engine.updatePart). */
export type ApplyRigTransform = (
  partId: string,
  position: [number, number, number],
  rotation: [number, number, number],
) => void;

/** Common track surface shared by the player animator and rig animators. */
export interface TrackPlayer {
  load(spec: LoadableAnim): AnimTrackHandle;
  play(token: string, fade?: number, weight?: number, speed?: number): void;
  stop(token: string, fade?: number): void;
  adjust(token: string, patch: { speed?: number; weight?: number }): void;
  stopAll(fade?: number): void;
  getProp(token: string, prop: string): number | boolean | string | null;
  setProp(token: string, prop: string, value: number | boolean | string): void;
}

interface RigLimb {
  partId: string;
  limb: LimbKey;
  basePos: THREE.Vector3;
  baseRot: [number, number, number];
  pivot: THREE.Vector3;
}

/** The joint a part swings around: shoulder/hip at its top, neck under the head. */
function pivotOf(
  limb: LimbKey,
  pos: [number, number, number],
  size: [number, number, number],
): [number, number, number] {
  if (limb === "head") return [pos[0], pos[1] - size[1] / 2, pos[2]]; // neck joint
  if (limb === "torso") return pos; // root joint at the torso center
  return [pos[0], pos[1] + size[1] / 2, pos[2]]; // shoulder / hip joint
}

export class PartRigAnimator implements TrackPlayer {
  /** How many limb parts this model has (>= 2 → worth animating). */
  readonly limbCount: number;
  private limbs: RigLimb[] = [];
  private tracks: Track[] = [];
  private seq = 0;
  private apply: ApplyRigTransform;

  /** track.Stopped — fires once when a track stops (manual or natural end). */
  onStopped?: (token: string, name: string) => void;
  /** track.DidLoop — fires every time a looping track wraps around. */
  onLooped?: (token: string, name: string) => void;

  constructor(parts: RigPartInfo[], apply: ApplyRigTransform) {
    this.apply = apply;
    for (const p of parts) {
      const limb = limbOf(p.name);
      if (!limb) continue;
      this.limbs.push({
        partId: p.id,
        limb,
        basePos: new THREE.Vector3(...p.position),
        baseRot: [...p.rotation],
        pivot: new THREE.Vector3(...pivotOf(limb, p.position, p.size)),
      });
    }
    this.limbCount = this.limbs.length;
  }

  private find(token: string): Track | null {
    return this.tracks.find((t) => t.token === token) ?? null;
  }

  /** Animator:LoadAnimation(anim) — create a (not yet playing) track. */
  load(spec: LoadableAnim): AnimTrackHandle {
    const track = new Track(`rig${++this.seq}`, spec, this.seq);
    this.tracks.push(track);
    return { token: track.token, name: track.name, length: track.length, looped: track.looped };
  }

  /** AnimationTrack:Play(fadeTime = 0.1, weight = 1, speed = 1) */
  play(token: string, fade = 0.1, weight = 1, speed = 1) {
    const t = this.find(token);
    if (!t) return;
    // restart from the beginning when the track isn't already playing —
    // like Roblox, a stopped/finished track can simply be Played again
    if (!t.playing) t.time = 0;
    t.playing = true;
    t.ending = false;
    t.speed = speed;
    t.weightTarget = Math.max(0, weight);
    t.fadeRate = 1 / Math.max(0.01, fade);
  }

  /** AnimationTrack:Stop(fadeTime = 0.1) */
  stop(token: string, fade = 0.1) {
    const t = this.find(token);
    if (!t) return;
    if (t.playing) this.onStopped?.(t.token, t.name);
    t.playing = false;
    t.ending = true;
    t.weightTarget = 0;
    t.fadeRate = 1 / Math.max(0.01, fade);
  }

  /** AnimationTrack:AdjustSpeed / AdjustWeight */
  adjust(token: string, patch: { speed?: number; weight?: number }) {
    const t = this.find(token);
    if (!t) return;
    if (patch.speed !== undefined && isFinite(patch.speed)) t.speed = patch.speed;
    if (patch.weight !== undefined && isFinite(patch.weight)) t.weightTarget = Math.max(0, patch.weight);
  }

  stopAll(fade = 0.15) {
    for (const t of [...this.tracks]) this.stop(t.token, fade);
  }

  getProp(token: string, prop: string): number | boolean | string | null {
    const t = this.find(token);
    if (!t || !TRACK_PROPS.has(prop)) return null;
    switch (prop as TrackProp) {
      case "IsPlaying": return t.playing;
      case "Length": return t.length;
      case "Looped": return t.looped;
      case "Speed": return t.speed;
      case "Priority": return t.priority;
      case "TimePosition": return t.time;
      case "WeightCurrent": return t.weight;
      case "Name": return t.name;
    }
  }

  setProp(token: string, prop: string, value: number | boolean | string) {
    const t = this.find(token);
    if (!t) return;
    switch (prop as TrackProp) {
      case "Looped": if (typeof value === "boolean") t.looped = value; break;
      case "Speed": if (isFinite(Number(value))) t.speed = Number(value); break;
      case "TimePosition": if (isFinite(Number(value))) t.time = Math.max(0, Math.min(t.length, Number(value))); break;
      case "Priority": {
        const n = Number(value);
        if (isFinite(n)) t.priority = Math.max(0, Math.min(3, Math.round(n))) as AnimPriority;
        break;
      }
      case "WeightCurrent": if (isFinite(Number(value))) t.weightTarget = Math.max(0, Number(value)); break;
    }
  }

  /** Advance every track and swing the winning limb parts around their joints. */
  update(dt: number) {
    // limb keys whose last track fully faded out this step — they must be
    // re-posed back to the rig's base pose so nothing stays half-waved
    const endedLimbs = new Set<string>();

    // --- advance time / weight / loop / end (same lifecycle as the avatar) ---
    for (const tr of [...this.tracks]) {
      if (tr.playing) {
        tr.time += dt * tr.speed;
        if (tr.time >= tr.length) {
          if (tr.looped) {
            tr.time %= tr.length;
            this.onLooped?.(tr.token, tr.name);
          } else {
            tr.playing = false;
            tr.ending = true;
            tr.weightTarget = 0;
            this.onStopped?.(tr.token, tr.name);
          }
        }
      }
      const dir = Math.sign(tr.weightTarget - tr.weight);
      if (dir !== 0) {
        tr.weight += dir * tr.fadeRate * dt;
        if ((dir > 0 && tr.weight >= tr.weightTarget) || (dir < 0 && tr.weight <= tr.weightTarget)) {
          tr.weight = tr.weightTarget;
        }
      }
      // fully faded out: restore the rig's base pose next, but KEEP the
      // track itself — Roblox AnimationTracks stay loaded on the Animator,
      // so track:Play() can restart them at any time
      if (tr.ending && tr.weight <= 0) {
        for (const limb of tr.limbs.keys()) endedLimbs.add(limb);
        tr.ending = false;
        tr.playing = false;
      }
    }
    if (!this.limbs.length) return;

    // --- pick + apply the winning track per limb part ---
    if (this.tracks.length) {
      for (const limb of this.limbs) {
        let best: Track | null = null;
        for (const tr of this.tracks) {
          if (!tr.limbs.has(limb.limb) || tr.weight <= 0.001) continue;
          if (!best || tr.priority > best.priority || (tr.priority === best.priority && tr.seq > best.seq)) best = tr;
        }
        if (!best) continue;
        const s = sampleKeys(best.limbs.get(limb.limb)!, best.time);
        const w = Math.min(1, best.weight);

        // rotate the part around its joint (shoulder / hip / neck):
        //   rotation = base pose + track offset, blended by weight
        const rot: [number, number, number] = [
          lerp(limb.baseRot[0], limb.baseRot[0] + s.rot[0], w),
          lerp(limb.baseRot[1], limb.baseRot[1] + s.rot[1], w),
          lerp(limb.baseRot[2], limb.baseRot[2] + s.rot[2], w),
        ];

        //   position = joint + (base center rotated around the joint) + track offset
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(s.rot[0] * D2R * w, s.rot[1] * D2R * w, s.rot[2] * D2R * w, "XYZ"),
        );
        const center = limb.basePos.clone().sub(limb.pivot).applyQuaternion(q).add(limb.pivot);
        center.x += s.pos[0] * w;
        center.y += s.pos[1] * w;
        center.z += s.pos[2] * w;
        const pos: [number, number, number] = [center.x, center.y, center.z];

        this.apply(limb.partId, pos, rot);
      }
    }

    // --- limbs whose tracks just faded out: snap back to the base pose ---
    if (endedLimbs.size) {
      for (const limb of this.limbs) {
        if (!endedLimbs.has(limb.limb)) continue;
        // another track took over this limb this frame? then leave it alone
        if (this.tracks.some((tr) => tr.weight > 0.001 && tr.limbs.has(limb.limb))) continue;
        this.apply(limb.partId, [limb.basePos.x, limb.basePos.y, limb.basePos.z], [...limb.baseRot]);
      }
    }
  }
}
