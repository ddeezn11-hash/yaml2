import type { AnimKeyframe, AnimationData, PartData, Vec3 } from "./types";
import { uid } from "./data";

/* ------------------------------------------------------------------ */
/* Animation preset library — ready-made keyframe clips you can      */
/* drop onto any rig (R6 or R15) and then tweak in the editor.        */
/* Tracks target parts BY NAME so presets work on any rig.           */
/* ------------------------------------------------------------------ */

export interface PresetKey { t: number; rot?: Vec3; pos?: Vec3 }
export interface PresetTrack { match: RegExp; keys: PresetKey[] }
export interface AnimPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  duration: number;
  loop: boolean;
  tracks: PresetTrack[];
}

export const ANIM_PRESETS: AnimPreset[] = [
  {
    id: "wave",
    name: "Wave",
    icon: "👋",
    desc: "Right arm up, friendly wave",
    duration: 1.6,
    loop: true,
    tracks: [
      {
        match: /right arm|right upperarm/i,
        keys: [
          { t: 0, rot: [0, 0, -150] },
          { t: 0.4, rot: [0, 20, -170] },
          { t: 0.8, rot: [0, -20, -175] },
          { t: 1.2, rot: [0, 20, -170] },
          { t: 1.6, rot: [0, 0, -150] },
        ],
      },
    ],
  },
  {
    id: "dance",
    name: "Dance",
    icon: "🕺",
    desc: "Arms and legs swinging",
    duration: 1.2,
    loop: true,
    tracks: [
      {
        match: /left arm|left upperarm/i,
        keys: [
          { t: 0, rot: [40, 0, 20] },
          { t: 0.6, rot: [-40, 0, -20] },
          { t: 1.2, rot: [40, 0, 20] },
        ],
      },
      {
        match: /right arm|right upperarm/i,
        keys: [
          { t: 0, rot: [-40, 0, -20] },
          { t: 0.6, rot: [40, 0, 20] },
          { t: 1.2, rot: [-40, 0, -20] },
        ],
      },
      {
        match: /left leg|left upperleg/i,
        keys: [
          { t: 0, rot: [-15, 0, 0] },
          { t: 0.6, rot: [15, 0, 0] },
          { t: 1.2, rot: [-15, 0, 0] },
        ],
      },
      {
        match: /right leg|right upperleg/i,
        keys: [
          { t: 0, rot: [15, 0, 0] },
          { t: 0.6, rot: [-15, 0, 0] },
          { t: 1.2, rot: [15, 0, 0] },
        ],
      },
    ],
  },
  {
    id: "cheer",
    name: "Cheer",
    icon: "🙌",
    desc: "Both arms up with a little hop",
    duration: 1.0,
    loop: true,
    tracks: [
      {
        match: /left arm|left upperarm/i,
        keys: [
          { t: 0, rot: [0, 0, 160] },
          { t: 0.5, rot: [0, 0, 175] },
          { t: 1.0, rot: [0, 0, 160] },
        ],
      },
      {
        match: /right arm|right upperarm/i,
        keys: [
          { t: 0, rot: [0, 0, -160] },
          { t: 0.5, rot: [0, 0, -175] },
          { t: 1.0, rot: [0, 0, -160] },
        ],
      },
      {
        match: /torso/i,
        keys: [
          { t: 0, pos: [0, 0, 0] },
          { t: 0.5, pos: [0, 0.6, 0] },
          { t: 1.0, pos: [0, 0, 0] },
        ],
      },
    ],
  },
  {
    id: "sit",
    name: "Sit",
    icon: "🪑",
    desc: "Legs forward, rest pose",
    duration: 0.6,
    loop: false,
    tracks: [
      { match: /left leg|left upperleg/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 0.6, rot: [80, 0, 10] }] },
      { match: /right leg|right upperleg/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 0.6, rot: [80, 0, -10] }] },
      { match: /torso/i, keys: [{ t: 0, pos: [0, 0, 0] }, { t: 0.6, pos: [0, -1.4, 0] }] },
    ],
  },
  {
    id: "point",
    name: "Point",
    icon: "👉",
    desc: "Right arm straight forward",
    duration: 0.8,
    loop: false,
    tracks: [
      { match: /right arm|right upperarm/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 0.4, rot: [-90, 0, 0] }, { t: 0.8, rot: [-90, 0, 0] }] },
    ],
  },
  {
    id: "robot",
    name: "Robot",
    icon: "🤖",
    desc: "Stiff alternating arm bends",
    duration: 1.6,
    loop: true,
    tracks: [
      {
        match: /left arm|left upperarm/i,
        keys: [
          { t: 0, rot: [-90, 0, 90] },
          { t: 0.8, rot: [-90, 0, 0] },
          { t: 1.6, rot: [-90, 0, 90] },
        ],
      },
      {
        match: /right arm|right upperarm/i,
        keys: [
          { t: 0, rot: [-90, 0, 0] },
          { t: 0.8, rot: [-90, 0, -90] },
          { t: 1.6, rot: [-90, 0, 0] },
        ],
      },
      { match: /head/i, keys: [{ t: 0, rot: [0, 20, 0] }, { t: 0.8, rot: [0, -20, 0] }, { t: 1.6, rot: [0, 20, 0] }] },
    ],
  },
  {
    id: "spin",
    name: "Spin",
    icon: "🌀",
    desc: "Torso spins a full 360",
    duration: 1.2,
    loop: true,
    tracks: [
      { match: /torso/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 1.2, rot: [0, 360, 0] }] },
      { match: /left arm|left upperarm/i, keys: [{ t: 0, rot: [0, 0, 75] }, { t: 1.2, rot: [0, 0, 75] }] },
      { match: /right arm|right upperarm/i, keys: [{ t: 0, rot: [0, 0, -75] }, { t: 1.2, rot: [0, 0, -75] }] },
    ],
  },
  {
    id: "headbang",
    name: "Headbang",
    icon: "🤘",
    desc: "Head thrashing up and down",
    duration: 0.6,
    loop: true,
    tracks: [
      { match: /head/i, keys: [{ t: 0, rot: [30, 0, 0] }, { t: 0.3, rot: [-35, 0, 0] }, { t: 0.6, rot: [30, 0, 0] }] },
    ],
  },
  {
    id: "zombie",
    name: "Zombie",
    icon: "🧟",
    desc: "Both arms out, slow shamble",
    duration: 2.0,
    loop: true,
    tracks: [
      { match: /left arm|left upperarm/i, keys: [{ t: 0, rot: [-88, 0, 8] }, { t: 1.0, rot: [-95, 0, -6] }, { t: 2.0, rot: [-88, 0, 8] }] },
      { match: /right arm|right upperarm/i, keys: [{ t: 0, rot: [-92, 0, -8] }, { t: 1.0, rot: [-85, 0, 6] }, { t: 2.0, rot: [-92, 0, -8] }] },
      { match: /left leg|left upperleg/i, keys: [{ t: 0, rot: [-8, 0, 0] }, { t: 1.0, rot: [8, 0, 0] }, { t: 2.0, rot: [-8, 0, 0] }] },
      { match: /right leg|right upperleg/i, keys: [{ t: 0, rot: [8, 0, 0] }, { t: 1.0, rot: [-8, 0, 0] }, { t: 2.0, rot: [8, 0, 0] }] },
    ],
  },
  {
    id: "jacks",
    name: "Jumping Jacks",
    icon: "⭐",
    desc: "Arms and legs out and in",
    duration: 0.8,
    loop: true,
    tracks: [
      { match: /left arm|left upperarm/i, keys: [{ t: 0, rot: [0, 0, 15] }, { t: 0.4, rot: [0, 0, 165] }, { t: 0.8, rot: [0, 0, 15] }] },
      { match: /right arm|right upperarm/i, keys: [{ t: 0, rot: [0, 0, -15] }, { t: 0.4, rot: [0, 0, -165] }, { t: 0.8, rot: [0, 0, -15] }] },
      { match: /left leg|left upperleg/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 0.4, rot: [0, 0, 18] }, { t: 0.8, rot: [0, 0, 0] }] },
      { match: /right leg|right upperleg/i, keys: [{ t: 0, rot: [0, 0, 0] }, { t: 0.4, rot: [0, 0, -18] }, { t: 0.8, rot: [0, 0, 0] }] },
    ],
  },
];

/** Build absolute keyframes for a preset applied to a rig's parts. */
export function presetToAnimation(preset: AnimPreset, parts: PartData[]): AnimationData {
  const tracks: Record<string, AnimKeyframe[]> = {};
  for (const spec of preset.tracks) {
    const part = parts.find((p) => spec.match.test(p.name));
    if (!part) continue;
    const base = part;
    const keys: AnimKeyframe[] = spec.keys.map((k) => ({
      t: k.t,
      pos: [
        base.position[0] + (k.pos?.[0] ?? 0),
        base.position[1] + (k.pos?.[1] ?? 0),
        base.position[2] + (k.pos?.[2] ?? 0),
      ] as Vec3,
      rot: [
        base.rotation[0] + (k.rot?.[0] ?? 0),
        base.rotation[1] + (k.rot?.[1] ?? 0),
        base.rotation[2] + (k.rot?.[2] ?? 0),
      ] as Vec3,
    }));
    if (!keys.some((k) => k.t === 0)) {
      keys.unshift({ t: 0, pos: [...base.position] as Vec3, rot: [...base.rotation] as Vec3 });
    }
    tracks[part.id] = keys;
  }
  return { id: uid("anim"), name: preset.name, duration: preset.duration, loop: preset.loop, tracks };
}

/** Convert an animation's part-id-keyed tracks to part-NAME-keyed tracks (portable). */
export function animationToPortable(anim: AnimationData, parts: PartData[]): AnimationData {
  const nameOf = new Map(parts.map((p) => [p.id, p.name]));
  const tracks: Record<string, AnimKeyframe[]> = {};
  for (const [pid, keys] of Object.entries(anim.tracks)) {
    const name = nameOf.get(pid) ?? pid;
    tracks[name] = keys;
  }
  return { ...anim, tracks };
}

/** Apply a portable (name-keyed) animation onto a rig's real part ids. */
export function portableToAnimation(anim: AnimationData, parts: PartData[]): AnimationData {
  const byName = new Map(parts.map((p) => [p.name.toLowerCase(), p.id]));
  const tracks: Record<string, AnimKeyframe[]> = {};
  for (const [name, keys] of Object.entries(anim.tracks)) {
    const pid = byName.get(name.toLowerCase());
    if (pid) tracks[pid] = keys;
  }
  return { ...anim, id: uid("anim"), tracks };
}
