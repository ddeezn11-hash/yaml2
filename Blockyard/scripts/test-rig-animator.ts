/* Numeric test: PartRigAnimator pivot math — playing the built-in Wave
 * preset on an R6 dummy must raise the Right Arm around its shoulder. */
import * as THREE from "three";
import { PartRigAnimator } from "../src/lib/studio/animruntime.ts";
import type { RigPartInfo } from "../src/lib/studio/animruntime.ts";

/* R6 dummy limb parts (world positions straight from makeRigParts) */
const parts: RigPartInfo[] = [
  { id: "p_torso", name: "Torso", position: [0, 3, 0], rotation: [0, 0, 0], size: [2, 2, 1] },
  { id: "p_head", name: "Head", position: [0, 4.65, 0], rotation: [0, 0, 0], size: [1.2, 1.2, 1.2] },
  { id: "p_larm", name: "Left Arm", position: [-1.5, 3, 0], rotation: [0, 0, 0], size: [1, 2, 1] },
  { id: "p_rarm", name: "Right Arm", position: [1.5, 3, 0], rotation: [0, 0, 0], size: [1, 2, 1] },
  { id: "p_lleg", name: "Left Leg", position: [-0.5, 1, 0], rotation: [0, 0, 0], size: [1, 2, 1] },
  { id: "p_rleg", name: "Right Leg", position: [0.5, 1, 0], rotation: [0, 0, 0], size: [1, 2, 1] },
];

const applied = new Map<string, { position: [number, number, number]; rotation: [number, number, number] }>();
const rig = new PartRigAnimator(parts, (partId, position, rotation) => {
  applied.set(partId, { position, rotation });
});

const expect = (cond: boolean, label: string) => {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
};

expect(rig.limbCount === 6, "all six R6 limbs detected");

/* the built-in Wave preset: right arm up, swinging (from animlibrary) */
const handle = rig.load({
  name: "Wave",
  duration: 1.6,
  loop: true,
  tracks: {
    "Right Arm": [
      { t: 0, rot: [0, 0, -150] },
      { t: 0.4, rot: [0, 20, -170] },
      { t: 0.8, rot: [0, -20, -175] },
      { t: 1.2, rot: [0, 20, -170] },
      { t: 1.6, rot: [0, 0, -150] },
    ],
  },
});
expect(handle.name === "Wave" && handle.length === 1.6, "track loaded with Wave preset shape");

rig.play(handle.token, 0, 1, 1); // no fade — full weight immediately

/* step once so the weight ramps to 1 (time advances slightly), then
 * rewind to t = 0 and re-apply so we can assert the exact first keyframe */
rig.update(1 / 60);
rig.setProp(handle.token, "TimePosition", 0);
rig.update(0);

const arm = applied.get("p_rarm");
expect(!!arm, "Right Arm transform applied");
if (arm) {
  const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
  expect(
    near(arm.rotation[0], 0) && near(arm.rotation[1], 0) && near(arm.rotation[2], -150),
    `arm rotated -150 deg around Z (got ${arm.rotation.map((n) => n.toFixed(1)).join(", ")})`,
  );
  /* shoulder pivot = (1.5, 4, 0); arm center orbits it:
     (0,-1,0) rotated -150 deg around Z -> (-0.5, +0.866, 0) => center (1.0, 4.866, 0) */
  expect(near(arm.position[0], 1.0) && near(arm.position[1], 4.866) && near(arm.position[2], 0),
    `arm center swung up around the shoulder (got ${arm.position.map((n) => n.toFixed(2)).join(", ")})`);
}

/* other limbs untouched while only the right arm track plays */
expect(!applied.has("p_torso") && !applied.has("p_head") && !applied.has("p_larm"), "non-animated limbs untouched");

/* mid-wave: rewind to 0 then step to t = 0.4 → rot [0, 20, -170] */
rig.setProp(handle.token, "TimePosition", 0);
rig.update(0.4);
const arm2 = applied.get("p_rarm")!;
expect(
  Math.abs(arm2.rotation[1] - 20) < 0.01 && Math.abs(arm2.rotation[2] - -170) < 0.01,
  `mid-wave keyframe sampled (got ${arm2.rotation.map((n) => n.toFixed(1)).join(", ")})`,
);

/* stop → weight fades to 0 → base pose restored, track removed */
rig.stop(handle.token, 0.05);
rig.update(0.06);
rig.update(0.06);
rig.update(0.06);
const arm3 = applied.get("p_rarm")!;
expect(
  Math.abs(arm3.rotation[2]) < 0.01 && Math.abs(arm3.position[0] - 1.5) < 0.01 && Math.abs(arm3.position[1] - 3) < 0.01,
  `stop restores the base pose (got rot ${arm3.rotation.map((n) => n.toFixed(2)).join(", ")} pos ${arm3.position.map((n) => n.toFixed(2)).join(", ")})`,
);
expect(rig.getProp(handle.token, "IsPlaying") === null, "faded track removed");

console.log("\nRIG ANIMATOR TESTS PASSED");
