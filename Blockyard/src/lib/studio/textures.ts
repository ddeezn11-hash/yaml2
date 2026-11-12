/* Procedural grayscale textures for Roblox-style materials.
 * Each texture tiles in world space (repeat = partSize / texScale) and is
 * multiplied by the part's BrickColor, exactly like Roblox's material model.
 * All drawing is deterministic (seeded) so every client renders identically. */

import * as THREE from "three";

const SIZE = 256;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

function grayscale(c: CanvasRenderingContext2D, fn: (x: number, y: number) => number) {
  const img = c.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y))));
      const i = (y * SIZE + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

/** Simple tileable value noise built from a coarse grid + bilinear smoothing. */
function valueNoise(seed: number, cells: number) {
  const rand = mulberry32(seed);
  const grid: number[] = [];
  for (let i = 0; i < cells * cells; i++) grid.push(rand());
  const at = (x: number, y: number) => {
    const gx = ((x % cells) + cells) % cells;
    const gy = ((y % cells) + cells) % cells;
    return grid[gy * cells + gx];
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    // u, v in [0,1) — sample with wrap so the texture tiles.
    const fx = u * cells;
    const fy = v * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

function fractal(seed: number, baseCells: number, octaves: number) {
  const noises = Array.from({ length: octaves }, (_, o) => valueNoise(seed + o * 131, baseCells * 2 ** o));
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noises[o](u, v) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  };
}

type Recipe = (c: CanvasRenderingContext2D) => void;

function noiseRecipe(seed: number, cells: number, octaves: number, lo: number, hi: number, power = 1): Recipe {
  return (c) => {
    const n = fractal(seed, cells, octaves);
    grayscale(c, (x, y) => {
      let t = n(x / SIZE, y / SIZE);
      t = Math.pow(t, power);
      return lo + (hi - lo) * t;
    });
  };
}

const recipes: Record<string, Recipe> = {
  wood: (c) => {
    const n = fractal(11, 4, 3);
    grayscale(c, (x, y) => {
      const grain = Math.sin((x + n(x / SIZE, y / SIZE) * 26) * 0.55) * 0.5 + 0.5;
      const ring = Math.pow(grain, 2.2);
      return 118 + ring * 70;
    });
  },
  planks: (c) => {
    const n = fractal(23, 5, 3);
    const plankH = 64;
    grayscale(c, (x, y) => {
      const row = Math.floor(y / plankH);
      const edge = y % plankH < 3 || y % plankH >= plankH - 2 ? -46 : 0;
      const shift = row * 53;
      const grain = Math.sin((x + shift + n(x / SIZE, y / SIZE) * 30) * 0.5) * 0.5 + 0.5;
      return 108 + grain * 42 + edge + (row % 2 ? -8 : 6);
    });
  },
  marble: (c) => {
    const n = fractal(37, 4, 4);
    grayscale(c, (x, y) => {
      const v = n(x / SIZE, y / SIZE);
      const vein = Math.abs(Math.sin((v + n(y / SIZE, x / SIZE) * 0.6) * 9));
      return 150 + vein * 80 - v * 22;
    });
  },
  slate: noiseRecipe(41, 6, 4, 78, 168),
  concrete: noiseRecipe(53, 16, 3, 112, 150, 1.4),
  granite: (c) => {
    const rand = mulberry32(59);
    const speckles: [number, number, number][] = [];
    for (let i = 0; i < 2600; i++) speckles.push([rand() * SIZE, rand() * SIZE, rand()]);
    grayscale(c, () => 132);
    for (const [x, y, t] of speckles) {
      const v = t < 0.33 ? 72 : t < 0.66 ? 108 : 196;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.globalAlpha = 0.85;
      c.fillRect(x, y, 2, 2);
    }
    c.globalAlpha = 1;
  },
  brick: (c) => {
    grayscale(c, () => 138);
    const bw = 64;
    const bh = 32;
    const mortar = "#8d8d8d";
    c.fillStyle = mortar;
    for (let row = 0; row * bh < SIZE; row++) {
      c.fillRect(0, row * bh, SIZE, 4);
      const offset = row % 2 ? bw / 2 : 0;
      for (let bx = -bw; bx < SIZE + bw; bx += bw) {
        c.fillRect(bx + offset, row * bh, 4, bh);
      }
    }
    const rand = mulberry32(67);
    for (let row = 0; row * bh < SIZE; row++) {
      const offset = row % 2 ? bw / 2 : 0;
      for (let bx = -bw; bx < SIZE + bw; bx += bw) {
        const v = 132 + rand() * 44;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(bx + offset + 4, row * bh + 4, bw - 4, bh - 4);
      }
    }
  },
  pebble: (c) => {
    grayscale(c, () => 96);
    const rand = mulberry32(71);
    for (let i = 0; i < 120; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 7 + rand() * 11;
      const v = 128 + rand() * 84;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  },
  cobble: (c) => {
    grayscale(c, () => 74);
    const rand = mulberry32(79);
    const cell = 64;
    for (let gy = 0; gy < SIZE / cell; gy++) {
      for (let gx = 0; gx < SIZE / cell; gx++) {
        const cx = gx * cell + cell / 2 + (rand() - 0.5) * 14;
        const cy = gy * cell + cell / 2 + (rand() - 0.5) * 14;
        const r = cell * 0.42 + rand() * 6;
        const v = 118 + rand() * 74;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  },
  rock: noiseRecipe(83, 8, 5, 70, 178, 1.2),
  sandstone: (c) => {
    const n = fractal(89, 4, 3);
    grayscale(c, (x, y) => {
      const band = Math.sin(y * 0.09 + n(x / SIZE, y / SIZE) * 5) * 0.5 + 0.5;
      return 128 + band * 46;
    });
  },
  limestone: noiseRecipe(97, 5, 3, 128, 176, 1.1),
  corroded: (c) => {
    const n = fractal(101, 5, 4);
    grayscale(c, (x, y) => {
      const v = n(x / SIZE, y / SIZE);
      return v > 0.55 ? 96 + v * 60 : 128 + v * 30;
    });
  },
  diamondplate: (c) => {
    grayscale(c, () => 118);
    const rand = mulberry32(103);
    c.save();
    c.translate(SIZE / 2, SIZE / 2);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const x = i * 74 + (pass ? 37 : 0);
          const y = j * 74 + (pass ? 37 : 0);
          c.save();
          c.translate(x, y);
          c.rotate(Math.PI / 4);
          const v = 148 + rand() * 70;
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(-14, -14, 28, 28);
          c.restore();
        }
      }
    }
    c.restore();
  },
  foil: noiseRecipe(107, 24, 2, 150, 210),
  brushedmetal: (c) => {
    const rand = mulberry32(109);
    grayscale(c, (x, y) => {
      const streak = Math.sin(y * 1.7 + rand() * 0.4) * 8;
      return 138 + streak + (y % 3) * 4;
    });
  },
  grass: noiseRecipe(113, 10, 4, 84, 168, 1.2),
  leafygrass: (c) => {
    const n = fractal(127, 8, 4);
    const rand = mulberry32(131);
    grayscale(c, (x, y) => {
      const v = n(x / SIZE, y / SIZE);
      const blade = rand() > 0.994 ? 210 : 0;
      return 92 + v * 74 + blade;
    });
  },
  sand: (c) => {
    const rand = mulberry32(137);
    grayscale(c, () => 158);
    for (let i = 0; i < 3200; i++) {
      const v = rand() > 0.5 ? 190 : 130;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.globalAlpha = 0.7;
      c.fillRect(rand() * SIZE, rand() * SIZE, 1.5, 1.5);
    }
    c.globalAlpha = 1;
  },
  fabric: (c) => {
    grayscale(c, (x, y) => {
      const weave = (Math.sin(x * 1.4) * Math.sin(y * 1.4)) > 0 ? 1 : 0;
      return 118 + weave * 52;
    });
  },
  snow: noiseRecipe(139, 12, 3, 186, 230, 1.2),
  mud: noiseRecipe(149, 6, 4, 66, 128, 1.15),
  ground: noiseRecipe(151, 7, 5, 82, 150, 1.2),
  asphalt: (c) => {
    const rand = mulberry32(157);
    grayscale(c, () => 92);
    for (let i = 0; i < 2400; i++) {
      const v = rand() > 0.5 ? 122 : 66;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.globalAlpha = 0.8;
      c.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
    }
    c.globalAlpha = 1;
  },
  salt: (c) => {
    const rand = mulberry32(163);
    grayscale(c, () => 200);
    for (let i = 0; i < 1600; i++) {
      const v = 168 + rand() * 66;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.globalAlpha = 0.9;
      c.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
    }
    c.globalAlpha = 1;
  },
  ice: (c) => {
    const n = fractal(167, 3, 3);
    grayscale(c, (x, y) => {
      const crack = Math.abs(Math.sin((n(x / SIZE, y / SIZE) + 0.13) * 11));
      return 172 + crack * 66;
    });
  },
  glacier: (c) => {
    const n = fractal(173, 4, 4);
    grayscale(c, (x, y) => {
      const streak = Math.sin((y + n(x / SIZE, y / SIZE) * 40) * 0.2) * 0.5 + 0.5;
      return 150 + streak * 78;
    });
  },
  forcefield: (c) => {
    const n = fractal(179, 6, 3);
    grayscale(c, (x, y) => {
      const hex = Math.abs(Math.sin(x * 0.12) * Math.sin(y * 0.12));
      return 128 + hex * 70 + n(x / SIZE, y / SIZE) * 30;
    });
  },
  pavement: (c) => {
    grayscale(c, () => 128);
    c.fillStyle = "#7f7f7f";
    for (let i = 0; i <= 4; i++) {
      c.fillRect(i * 64 - 2, 0, 4, SIZE);
      c.fillRect(0, i * 64 - 2, SIZE, 4);
    }
    const rand = mulberry32(181);
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const v = 132 + rand() * 36;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(gx * 64 + 4, gy * 64 + 4, 56, 56);
      }
  },
  crackedlava: (c) => {
    const n = fractal(191, 4, 4);
    grayscale(c, (x, y) => {
      const v = n(x / SIZE, y / SIZE);
      // Dark crust with bright cracks; brightness also drives the emissive map.
      const crack = Math.max(0, Math.sin(v * 14) - 0.82) / 0.18;
      return 34 + crack * 220;
    });
  },
  plaster: noiseRecipe(193, 6, 2, 148, 186, 1.05),
  cardboard: (c) => {
    grayscale(c, (x, y) => 156 + Math.sin(y * 2.2) * 6);
    c.fillStyle = "#a2a2a2";
    for (let y = 8; y < SIZE; y += 32) c.fillRect(0, y, SIZE, 6);
  },
  carpet: (c) => {
    const rand = mulberry32(197);
    grayscale(c, (x, y) => 128 + (rand() - 0.5) * 6 + ((x + y) % 2) * 5);
  },
  ceramic: (c) => {
    grayscale(c, () => 168);
    c.fillStyle = "#8c8c8c";
    c.fillRect(0, 0, SIZE, 5);
    c.fillRect(0, 0, 5, SIZE);
    const rand = mulberry32(199);
    c.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 40; i++) c.fillRect(rand() * SIZE, rand() * SIZE, 20, 3);
  },
  claytiles: (c) => {
    grayscale(c, () => 118);
    const rand = mulberry32(211);
    for (let row = 0; row * 40 < SIZE; row++) {
      const offset = row % 2 ? 32 : 0;
      for (let bx = -64; bx < SIZE + 64; bx += 64) {
        const v = 132 + rand() * 56;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.beginPath();
        c.roundRect(bx + offset, row * 40 + 3, 60, 34, 12);
        c.fill();
      }
    }
  },
  leather: (c) => {
    const n = fractal(223, 12, 3);
    grayscale(c, (x, y) => 96 + n(x / SIZE, y / SIZE) * 74 + Math.sin(x * 0.6 + y * 0.4) * 4);
  },
  rubber: noiseRecipe(227, 18, 2, 74, 104, 1.1),
  studs: (c) => {
    // Classic Roblox top-stud bump map for the baseplate.
    grayscale(c, (x, y) => {
      const cx = 128;
      const cy = 128;
      const d = Math.hypot(x - cx, y - cy);
      if (d < 74) {
        const edge = d > 66 ? 26 : 0;
        return 148 + edge;
      }
      return 128;
    });
    const rand = mulberry32(229);
    c.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 300; i++) c.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
  },
};

const cache = new Map<string, HTMLCanvasElement>();

function getRecipeCanvas(recipe: string): HTMLCanvasElement {
  let canvas = cache.get(recipe);
  if (!canvas) {
    canvas = makeCanvas();
    const ctx = canvas.getContext("2d")!;
    (recipes[recipe] ?? recipes.concrete)(ctx);
    cache.set(recipe, canvas);
  }
  return canvas;
}

const texCache = new Map<string, THREE.Texture>();

/** Shared, tiled Three.js texture for a material recipe ( RepeatWrapping ). */
export function getMaterialTexture(recipe: string): THREE.Texture {
  let tex = texCache.get(recipe);
  if (!tex) {
    tex = new THREE.CanvasTexture(getRecipeCanvas(recipe));
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    texCache.set(recipe, tex);
  }
  return tex;
}

/** Small preview canvas (for material picker thumbnails), cached per recipe. */
export function getMaterialThumb(recipe: string, size = 44): HTMLCanvasElement {
  const src = getRecipeCanvas(recipe);
  const key = `${recipe}:${size}`;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, size, size);
    cache.set(key, canvas);
  }
  return canvas;
}
