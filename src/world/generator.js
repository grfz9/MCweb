// Génération procédurale du terrain : relief, biomes, grottes, minerais, arbres et plantes.
import { Simplex, fbm2, hash2, hash3, mulberry32 } from '../noise.js';
import { B } from '../blocks.js';
import { SEA_LEVEL, WORLD_HEIGHT } from '../constants.js';
import { smoothstep, lerp } from '../math.js';

export const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH_FOREST: 4, DESERT: 5, TAIGA: 6, MOUNTAINS: 7,
  SNOWY_PLAINS: 8, FROZEN_OCEAN: 9,
};
export const BIOME_NAMES = [
  'Océan', 'Plage', 'Plaines', 'Forêt', 'Forêt de bouleaux', 'Désert', 'Taïga', 'Montagnes',
  'Plaines enneigées', 'Océan gelé',
];

const CONT_SPLINE = [[-1, 24], [-0.5, 36], [-0.25, 50], [-0.12, 58], [-0.04, 62.5], [0.04, 65], [0.3, 70], [0.6, 77], [1, 86]];

function spline(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return lerp(pts[i - 1][1], pts[i][1], t * t * (3 - 2 * t));
    }
  }
  return pts[pts.length - 1][1];
}

export const TREE = { OAK: 0, BIRCH: 1, SPRUCE: 2 };

// Densité d'arbres par colonne selon le biome.
const TREE_DENSITY = [0, 0, 0.004, 0.045, 0.04, 0, 0.03, 0.006, 0.002, 0];
const MAX_TREE_DENSITY = 0.045;

const idx = (x, y, z) => x | (z << 4) | (y << 8);

export class Generator {
  constructor(seed) {
    this.seed = seed | 0;
    const s = this.seed;
    this.nCont = new Simplex(s ^ 0x1a2b3c);
    this.nHills = new Simplex(s ^ 0x2b3c4d);
    this.nMount = new Simplex(s ^ 0x3c4d5e);
    this.nMask = new Simplex(s ^ 0x4d5e6f);
    this.nDetail = new Simplex(s ^ 0x5e6f70);
    this.nTemp = new Simplex(s ^ 0x6f7081);
    this.nHum = new Simplex(s ^ 0x708192);
    this.nCave1 = new Simplex(s ^ 0x8192a3);
    this.nCave2 = new Simplex(s ^ 0x92a3b4);
    this.nCave3 = new Simplex(s ^ 0xa3b4c5);
    this.nEntrance = new Simplex(s ^ 0xb4c5d6);
    this.nSurface = new Simplex(s ^ 0xc5d6e7);
    // Résultat du dernier appel à column()
    this.h = 0;
    this.biome = 0;
    this.mask = 0;
    this.temp = 0;
    this.hum = 0;
    this._caveS = new Float32Array(5 * 33 * 5);
    this._caveC = new Float32Array(5 * 33 * 5);
  }

  // Calcule la hauteur et le biome d'une colonne (écrit dans this.h / this.biome).
  column(x, z) {
    const cont = fbm2(this.nCont, x * 0.0011, z * 0.0011, 5) * 1.7 + 0.1;
    const base = spline(CONT_SPLINE, cont);
    const land = smoothstep(-0.08, 0.12, cont);
    const hills = fbm2(this.nHills, x * 0.0075, z * 0.0075, 4);
    const detail = fbm2(this.nDetail, x * 0.035, z * 0.035, 3);
    const mask = smoothstep(0.08, 0.38, fbm2(this.nMask, x * 0.0014, z * 0.0014, 3) * 1.5) * land;
    let ridge = 1 - Math.abs(fbm2(this.nMount, x * 0.0045, z * 0.0045, 4) * 1.8);
    if (ridge < 0) ridge = 0;
    let h = base + hills * (3 + 14 * land) + mask * (8 + ridge * ridge * 52) + detail * 2;
    h = Math.max(4, Math.min(WORLD_HEIGHT - 12, Math.round(h)));

    const temp = fbm2(this.nTemp, x * 0.0016, z * 0.0016, 3) * 1.7 - mask * 0.35;
    const hum = fbm2(this.nHum, x * 0.0016, z * 0.0016, 3) * 1.7;
    let biome;
    if (h < SEA_LEVEL - 1) biome = temp < -0.45 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    else if (h <= SEA_LEVEL + 1 && cont < 0.06) biome = temp < -0.45 ? BIOME.SNOWY_PLAINS : temp > 0.35 && hum < 0 ? BIOME.DESERT : BIOME.BEACH;
    else if (mask > 0.45 && h > 86) biome = BIOME.MOUNTAINS;
    else if (temp > 0.32 && hum < 0.15) biome = BIOME.DESERT;
    else if (temp < -0.38) biome = hum > -0.05 ? BIOME.TAIGA : BIOME.SNOWY_PLAINS;
    else if (hum > 0.28) biome = temp < 0.05 && hum < 0.5 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    else biome = BIOME.PLAINS;

    this.h = h;
    this.biome = biome;
    this.mask = mask;
    this.temp = temp;
    this.hum = hum;
    return h;
  }

  generate(chunk) {
    const blocks = chunk.blocks;
    const meta = chunk.meta;
    blocks.fill(0);
    meta.fill(0);
    const ox = chunk.cx * 16, oz = chunk.cz * 16;
    const seed = this.seed;
    const H = new Int16Array(256);
    const BI = new Uint8Array(256);

    // 1) Relief et couches de surface
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const wx = ox + x, wz = oz + z;
        const h = this.column(wx, wz);
        const biome = this.biome;
        H[x + z * 16] = h;
        BI[x + z * 16] = biome;
        const sn = this.nSurface.noise2(wx * 0.08, wz * 0.08);
        let top = B.GRASS, filler = B.DIRT, depth = 3 + (sn > 0.3 ? 1 : 0), under = B.STONE, underDepth = 0;
        switch (biome) {
          case BIOME.OCEAN:
          case BIOME.FROZEN_OCEAN:
            top = h < SEA_LEVEL - 9 ? (sn > 0.2 ? B.GRAVEL : B.DIRT) : sn > 0.55 ? B.CLAY : B.SAND;
            filler = top === B.CLAY ? B.SAND : top;
            break;
          case BIOME.BEACH:
            top = B.SAND; filler = B.SAND; depth = 4; under = B.SANDSTONE; underDepth = 2;
            break;
          case BIOME.DESERT:
            top = B.SAND; filler = B.SAND; depth = 4; under = B.SANDSTONE; underDepth = 3;
            break;
          case BIOME.TAIGA:
          case BIOME.SNOWY_PLAINS:
            top = B.SNOWY_GRASS;
            break;
          case BIOME.MOUNTAINS:
            if (h > 104) { top = B.SNOW_BLOCK; filler = B.STONE; }
            else if (h > 92) { top = sn > 0.4 ? B.GRAVEL : B.STONE; filler = B.STONE; }
            break;
        }
        if (h < SEA_LEVEL && top === B.GRASS) { top = h >= SEA_LEVEL - 3 ? B.SAND : B.DIRT; filler = top; }
        if (h < SEA_LEVEL && top === B.SNOWY_GRASS) { top = B.DIRT; filler = B.DIRT; }

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = B.BEDROCK;
          else if (y < 5 && hash3(wx, y, wz, seed) < (5 - y) / 5) id = B.BEDROCK;
          else {
            const d = h - y;
            if (d === 0) id = top;
            else if (d < depth) id = filler;
            else if (d < depth + underDepth) id = under;
            else id = B.STONE;
          }
          blocks[idx(x, y, z)] = id;
        }
        const frozen = biome === BIOME.FROZEN_OCEAN || biome === BIOME.SNOWY_PLAINS || biome === BIOME.TAIGA;
        for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[idx(x, y, z)] = y === SEA_LEVEL && frozen ? B.ICE : B.WATER;
      }

    // 2) Grottes (bruit 3D échantillonné tous les 4 blocs puis interpolé)
    this.carveCaves(chunk, H);

    // 3) Minerais et poches
    const rng = mulberry32((hash2(chunk.cx, chunk.cz, seed ^ 0x51ed) * 4294967296) | 0);
    this.vein(blocks, rng, B.DIRT, 10, 24, 5, 90);
    this.vein(blocks, rng, B.GRAVEL, 8, 24, 5, 90);
    this.vein(blocks, rng, B.COAL_ORE, 20, 10, 5, 110);
    this.vein(blocks, rng, B.IRON_ORE, 18, 7, 5, 64);
    this.vein(blocks, rng, B.GOLD_ORE, 3, 7, 5, 32);
    this.vein(blocks, rng, B.DIAMOND_ORE, 2, 6, 4, 16);

    // 4) Arbres (y compris ceux des chunks voisins qui débordent sur celui-ci)
    for (let wz = oz - 3; wz < oz + 19; wz++)
      for (let wx = ox - 3; wx < ox + 19; wx++) {
        const r = hash2(wx, wz, seed ^ 0x7eee);
        if (r >= MAX_TREE_DENSITY) continue;
        const inside = wx >= ox && wx < ox + 16 && wz >= oz && wz < oz + 16;
        let h, biome;
        if (inside) { h = H[(wx - ox) + (wz - oz) * 16]; biome = BI[(wx - ox) + (wz - oz) * 16]; }
        else { h = this.column(wx, wz); biome = this.biome; }
        if (r >= TREE_DENSITY[biome] || h <= SEA_LEVEL) continue;
        if (biome === BIOME.MOUNTAINS && h > 90) continue;
        if (inside) {
          const g = blocks[idx(wx - ox, h, wz - oz)];
          if (g !== B.GRASS && g !== B.SNOWY_GRASS && g !== B.DIRT) continue;
        }
        let type = TREE.OAK;
        const t2 = hash2(wx, wz, seed ^ 0x3ee);
        if (biome === BIOME.TAIGA || biome === BIOME.SNOWY_PLAINS || biome === BIOME.MOUNTAINS) type = TREE.SPRUCE;
        else if (biome === BIOME.BIRCH_FOREST) type = t2 < 0.85 ? TREE.BIRCH : TREE.OAK;
        else if (biome === BIOME.FOREST) type = t2 < 0.25 ? TREE.BIRCH : TREE.OAK;
        placeTree((x, y, z, id) => {
          const lx = x - ox, lz = z - oz;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= WORLD_HEIGHT) return;
          const i = idx(lx, y, lz);
          const cur = blocks[i];
          if (id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES) {
            if (cur === B.AIR || cur === B.TALL_GRASS) blocks[i] = id;
          } else if (cur === B.AIR || cur === B.TALL_GRASS || cur === B.OAK_LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES || cur === B.GRASS || cur === B.SNOWY_GRASS) {
            blocks[i] = id;
          }
        }, wx, h + 1, wz, type, mulberry32((r * 4294967296) | 0));
        if (inside) blocks[idx(wx - ox, h, wz - oz)] = B.DIRT;
      }

    // 5) Plantes, cactus et buissons
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const h = H[x + z * 16];
        if (h >= WORLD_HEIGHT - 4 || h < SEA_LEVEL) continue;
        const biome = BI[x + z * 16];
        const top = blocks[idx(x, h, z)];
        if (blocks[idx(x, h + 1, z)] !== B.AIR) continue;
        const r = hash2(ox + x, oz + z, seed ^ 0xf10);
        if (top === B.GRASS) {
          const grass = biome === BIOME.PLAINS ? 0.14 : biome === BIOME.FOREST || biome === BIOME.BIRCH_FOREST ? 0.08 : 0.04;
          if (r < grass) blocks[idx(x, h + 1, z)] = B.TALL_GRASS;
          else if (r < grass + 0.012) blocks[idx(x, h + 1, z)] = B.DANDELION;
          else if (r < grass + 0.022) blocks[idx(x, h + 1, z)] = B.POPPY;
        } else if (top === B.SNOWY_GRASS && r < 0.02) {
          blocks[idx(x, h + 1, z)] = B.TALL_GRASS;
        } else if (top === B.SAND && biome === BIOME.DESERT) {
          if (r < 0.005 && x > 0 && x < 15 && z > 0 && z < 15) {
            const hgt = 1 + Math.floor(hash2(ox + x, oz + z, seed ^ 0xcac) * 3);
            for (let k = 1; k <= hgt; k++) blocks[idx(x, h + k, z)] = B.CACTUS;
          } else if (r < 0.012) blocks[idx(x, h + 1, z)] = B.DEAD_BUSH;
        }
      }

    chunk.computeMaxY();
    chunk.generated = true;
    chunk.dirty = true;
  }

  carveCaves(chunk, H) {
    const blocks = chunk.blocks;
    const ox = chunk.cx * 16, oz = chunk.cz * 16;
    const S = this._caveS, C = this._caveC;
    let maxH = 0;
    for (let i = 0; i < 256; i++) if (H[i] > maxH) maxH = H[i];
    const gyMax = Math.min(32, Math.ceil((maxH + 1) / 4));
    for (let gx = 0; gx < 5; gx++)
      for (let gz = 0; gz < 5; gz++)
        for (let gy = 0; gy <= gyMax; gy++) {
          const wx = ox + gx * 4, wy = gy * 4, wz = oz + gz * 4;
          const n1 = this.nCave1.noise3(wx / 52, wy / 30, wz / 52);
          const n2 = this.nCave2.noise3(wx / 52, wy / 30, wz / 52);
          const i = (gx * 5 + gz) * 33 + gy;
          S[i] = n1 * n1 + n2 * n2;
          C[i] = this.nCave3.noise3(wx / 80, wy / 36, wz / 80);
        }
    for (let x = 0; x < 16; x++) {
      const gx = x >> 2, fx = (x & 3) / 4;
      for (let z = 0; z < 16; z++) {
        const gz = z >> 2, fz = (z & 3) / 4;
        const h = H[x + z * 16];
        const wx = ox + x, wz = oz + z;
        const entrance = this.nEntrance.noise2(wx * 0.012, wz * 0.012) > 0.55;
        let top = entrance ? h : h - 5;
        if (h < SEA_LEVEL + 4) top = Math.min(top, h - 9);
        top = Math.min(top, gyMax * 4 - 1);
        for (let y = 1; y <= top; y++) {
          const gy = y >> 2, fy = (y & 3) / 4;
          const i000 = (gx * 5 + gz) * 33 + gy;
          const i100 = i000 + 5 * 33, i010 = i000 + 1, i001 = i000 + 33;
          const i110 = i100 + 1, i101 = i100 + 33, i011 = i001 + 1, i111 = i101 + 1;
          const s = trilerp(S, i000, i100, i010, i110, i001, i101, i011, i111, fx, fy, fz);
          let carve = s < 0.016;
          if (!carve && y < 48) {
            const c = trilerp(C, i000, i100, i010, i110, i001, i101, i011, i111, fx, fy, fz);
            carve = c > 0.62 - (48 - y) * 0.002;
          }
          if (!carve) continue;
          const bi = idx(x, y, z);
          const cur = blocks[bi];
          if (cur === B.BEDROCK || cur === B.WATER || cur === B.ICE) continue;
          blocks[bi] = y <= 10 ? B.LAVA : B.AIR;
        }
      }
    }
    // L'herbe qui surplombe une entrée de grotte reste de l'herbe ; la terre mise à nu en dessous devient de l'herbe si exposée.
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const h = H[x + z * 16];
        if (h < 2 || h >= WORLD_HEIGHT - 1) continue;
        if (blocks[idx(x, h, z)] === B.AIR) {
          for (let y = h - 1; y > h - 6 && y > 0; y--) {
            const id = blocks[idx(x, y, z)];
            if (id === B.AIR) continue;
            if (id === B.DIRT && H[x + z * 16] >= SEA_LEVEL) blocks[idx(x, y, z)] = B.GRASS;
            break;
          }
        }
      }
  }

  vein(blocks, rng, ore, attempts, size, minY, maxY) {
    for (let a = 0; a < attempts; a++) {
      let x = Math.floor(rng() * 16), y = minY + Math.floor(rng() * (maxY - minY)), z = Math.floor(rng() * 16);
      const n = 1 + Math.floor(rng() * size);
      for (let k = 0; k < n; k++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WORLD_HEIGHT) {
          const i = idx(x, y, z);
          if (blocks[i] === B.STONE) blocks[i] = ore;
        }
        const d = Math.floor(rng() * 6);
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
      }
    }
  }

  // Cherche un point d'apparition sur la terre ferme près de l'origine.
  findSpawn() {
    for (let r = 0; r < 4000; r += 16) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        const h = this.column(x, z);
        if (h > SEA_LEVEL + 1 && h < 90 && this.biome !== BIOME.BEACH && this.biome !== BIOME.MOUNTAINS) return { x: x + 0.5, z: z + 0.5, h };
        if (r === 0) break;
      }
    }
    return { x: 0.5, z: 0.5, h: this.column(0, 0) };
  }
}

function trilerp(A, i000, i100, i010, i110, i001, i101, i011, i111, fx, fy, fz) {
  const a = A[i000] + (A[i100] - A[i000]) * fx;
  const b = A[i010] + (A[i110] - A[i010]) * fx;
  const c = A[i001] + (A[i101] - A[i001]) * fx;
  const d = A[i011] + (A[i111] - A[i011]) * fx;
  const e = a + (c - a) * fz;
  const f = b + (d - b) * fz;
  return e + (f - e) * fy;
}

// Place un arbre via une fonction set(x, y, z, id). Utilisé à la génération et par les pousses.
export function placeTree(set, x, y, z, type, rng) {
  if (type === TREE.SPRUCE) {
    const height = 6 + Math.floor(rng() * 4);
    for (let i = 0; i < height; i++) set(x, y + i, z, B.SPRUCE_LOG);
    const radii = [0, 1, 1, 2, 1, 2, 2, 1, 2, 3, 2];
    const layers = height - 1;
    for (let i = 0; i <= layers; i++) {
      const ly = y + height - i;
      const r = Math.min(radii[i] ?? 2, 3);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (r >= 2 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          if (r === 1 && Math.abs(dx) === 1 && Math.abs(dz) === 1 && i < 3) continue;
          if (dx === 0 && dz === 0 && i > 0) continue;
          set(x + dx, ly, z + dz, B.SPRUCE_LEAVES);
        }
    }
    set(x, y + height, z, B.SPRUCE_LEAVES);
    return;
  }
  const birch = type === TREE.BIRCH;
  const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
  const leaf = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
  const height = (birch ? 5 : 4) + Math.floor(rng() * 3);
  for (let ly = y + height - 3; ly <= y + height; ly++) {
    const top = ly >= y + height - 1;
    const r = top ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (top || rng() < 0.5)) continue;
        set(x + dx, ly, z + dz, leaf);
      }
  }
  for (let i = 0; i < height; i++) set(x, y + i, z, log);
}
