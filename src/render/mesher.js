// Construction des maillages de chunk : faces visibles, occlusion ambiante et lumière lissée.
import {
  blocks, B, OPAQUE, SHAPES, SHAPE, TRANSLUCENT, SOLID, ANIM,
} from '../blocks.js';
import { WORLD_HEIGHT } from '../constants.js';
import { hash3 } from '../noise.js';

// Format d'un sommet (16 octets) :
//  u16 x*16, y*16, z*16, couche de texture | u8 u, v, animation, 0 | u8 ciel*16, bloc*16, ombre, 0
export const VERTEX_BYTES = 16;

class MeshBuilder {
  constructor(initialQuads = 4096) {
    this.buf = new ArrayBuffer(initialQuads * 4 * VERTEX_BYTES);
    this.u16 = new Uint16Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.quads = 0;
  }
  reset() { this.quads = 0; }
  ensure() {
    if ((this.quads + 1) * 4 * VERTEX_BYTES > this.buf.byteLength) {
      const nb = new ArrayBuffer(this.buf.byteLength * 2);
      new Uint8Array(nb).set(this.u8);
      this.buf = nb;
      this.u16 = new Uint16Array(nb);
      this.u8 = new Uint8Array(nb);
    }
  }
  vertex(v, x, y, z, layer, u, tv, anim, sky, blk, shade) {
    const o16 = v * 8, o8 = v * 16;
    const u16 = this.u16, u8 = this.u8;
    u16[o16] = Math.round(x * 16);
    u16[o16 + 1] = Math.round(y * 16);
    u16[o16 + 2] = Math.round(z * 16);
    u16[o16 + 3] = layer;
    u8[o8 + 8] = u;
    u8[o8 + 9] = tv;
    u8[o8 + 10] = anim;
    u8[o8 + 11] = 0;
    u8[o8 + 12] = sky;
    u8[o8 + 13] = blk;
    u8[o8 + 14] = shade;
    u8[o8 + 15] = 0;
  }
  view() { return new Uint8Array(this.buf, 0, this.quads * 4 * VERTEX_BYTES); }
}

const opaqueBuilder = new MeshBuilder(8192);
const transBuilder = new MeshBuilder(2048);

// Tableaux « rembourrés » 18 x 18 x 130 : le chunk plus une bordure d'un bloc.
const PW = 18, PH = WORLD_HEIGHT + 2, LAYER = PW * PW;
const pBlocks = new Uint8Array(LAYER * PH);
const pMeta = new Uint8Array(LAYER * PH);
const pLight = new Uint8Array(LAYER * PH);
const pIndex = (x, y, z) => (x + 1) + (z + 1) * PW + (y + 1) * LAYER;
const off = (dx, dy, dz) => dx + dz * PW + dy * LAYER;

const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
];
const UVS = [[0, 16], [16, 16], [16, 0], [0, 0]];
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

// Décalages précalculés pour l'occlusion ambiante : [voisin, côté1, côté2, coin] par sommet.
for (const f of FACES) {
  f.nOff = off(f.n[0], f.n[1], f.n[2]);
  f.ao = f.c.map((c) => {
    const t = [];
    for (let a = 0; a < 3; a++) {
      if (f.n[a] !== 0) continue;
      const d = [0, 0, 0];
      d[a] = c[a] === 0 ? -1 : 1;
      t.push(d);
    }
    const s1 = [f.n[0] + t[0][0], f.n[1] + t[0][1], f.n[2] + t[0][2]];
    const s2 = [f.n[0] + t[1][0], f.n[1] + t[1][1], f.n[2] + t[1][2]];
    const cc = [f.n[0] + t[0][0] + t[1][0], f.n[1] + t[0][1] + t[1][1], f.n[2] + t[0][2] + t[1][2]];
    return [off(...s1), off(...s2), off(...cc)];
  });
}

const CULL_SAME = new Uint8Array(256);
const ANIMS = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  if (!blocks[i]) continue;
  CULL_SAME[i] = blocks[i].cullSame ? 1 : 0;
  ANIMS[i] = blocks[i].anim;
}

function fillPadded(world, chunk, ymax) {
  const cx = chunk.cx, cz = chunk.cz;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(cx + dx, cz + dz);
      const x0 = dx === -1 ? 15 : 0, x1 = dx === 1 ? 0 : 15;
      const z0 = dz === -1 ? 15 : 0, z1 = dz === 1 ? 0 : 15;
      for (let y = 0; y <= ymax; y++)
        for (let z = z0; z <= z1; z++) {
          const pz = dz === -1 ? -1 : dz === 1 ? 16 : z;
          for (let x = x0; x <= x1; x++) {
            const px = dx === -1 ? -1 : dx === 1 ? 16 : x;
            const pi = pIndex(px, y, pz);
            if (!c) { pBlocks[pi] = 0; pMeta[pi] = 0; pLight[pi] = 15; continue; }
            const i = x | (z << 4) | (y << 8);
            pBlocks[pi] = c.blocks[i];
            pMeta[pi] = c.meta[i];
            pLight[pi] = c.light[i];
          }
        }
    }
  // Sous le monde : opaque ; au-dessus de ymax : air éclairé par le ciel.
  for (let i = 0; i < LAYER; i++) { pBlocks[i] = B.BEDROCK; pLight[i] = 0; pMeta[i] = 0; }
  const topLayer = (ymax + 2) * LAYER;
  if (ymax + 2 < PH) {
    pBlocks.fill(0, topLayer, topLayer + LAYER);
    pMeta.fill(0, topLayer, topLayer + LAYER);
    pLight.fill(15, topLayer, topLayer + LAYER);
  }
}

// Hauteur (0..1) du liquide dans une cellule rembourrée.
function liquidHeight(p, id) {
  if (pBlocks[p] !== id) return -1;
  if (pBlocks[p + LAYER] === id) return 1;
  const m = pMeta[p];
  if (m === 0 || m >= 8) return 0.875;
  return (8 - m) / 9;
}

// Hauteur d'un coin de la surface du liquide : moyenne des 4 cellules qui le partagent.
function cornerHeight(p, id, sx, sz) {
  let sum = 0, n = 0;
  const cells = [p, p + sx, p + sz * PW, p + sx + sz * PW];
  for (const q of cells) {
    if (pBlocks[q + LAYER] === id) return 1;
    const h = liquidHeight(q, id);
    if (h >= 0) { sum += h; n++; } else if (!SOLID[pBlocks[q]]) { n++; }
  }
  return n ? sum / n : 0.875;
}

export function buildChunkMesh(world, chunk) {
  const ymax = Math.min(WORLD_HEIGHT - 1, chunk.maxY + 1);
  fillPadded(world, chunk, Math.min(WORLD_HEIGHT - 1, ymax + 1));
  opaqueBuilder.reset();
  transBuilder.reset();

  for (let y = 0; y <= ymax; y++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const p = pIndex(x, y, z);
        const id = pBlocks[p];
        if (id === 0) continue;
        const shape = SHAPES[id];
        if (shape === SHAPE.CUBE) cubeBlock(p, id, x, y, z);
        else if (shape === SHAPE.CROSS) crossBlock(p, id, x, y, z, chunk);
        else if (shape === SHAPE.LIQUID) liquidBlock(p, id, x, y, z);
        else if (shape === SHAPE.TORCH) torchBlock(p, id, x, y, z);
        else if (shape === SHAPE.CACTUS) cactusBlock(p, id, x, y, z);
      }

  return {
    opaque: opaqueBuilder.view(),
    opaqueQuads: opaqueBuilder.quads,
    trans: transBuilder.view(),
    transQuads: transBuilder.quads,
  };
}

function faceTexture(b, f, meta) {
  if (b.axis && meta) {
    const along = meta === 1 ? 0 : 2; // axe X ou Z
    const axisFace = f >> 1; // 0 = X, 1 = Y, 2 = Z
    if (axisFace === along) return b.tex[2];
    return b.tex[0];
  }
  if (b.facing) {
    if (f === meta) return b.tex[4];
    if (f === 2) return b.tex[2];
    if (f === 3) return b.tex[3];
    return b.tex[0];
  }
  return b.tex[f];
}

function uvRotated(b, f, meta) {
  if (!b.axis || !meta) return false;
  if (meta === 1) return f !== 0 && f !== 1;
  return f === 0 || f === 1;
}

const vAo = [0, 0, 0, 0], vSky = [0, 0, 0, 0], vBlk = [0, 0, 0, 0];

function cubeBlock(p, id, x, y, z) {
  const b = blocks[id];
  const builder = TRANSLUCENT[id] ? transBuilder : opaqueBuilder;
  const cullSame = CULL_SAME[id];
  const anim = ANIMS[id] === ANIM.LEAVES ? 3 : 0;
  const meta = pMeta[p];
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const np = p + face.nOff;
    const nid = pBlocks[np];
    if (OPAQUE[nid]) continue;
    if (cullSame && nid === id) continue;
    const layer = faceTexture(b, f, meta);
    const rot = uvRotated(b, f, meta);
    // Lumière et occlusion par sommet
    const nl = pLight[np];
    for (let k = 0; k < 4; k++) {
      const a = face.ao[k];
      const s1 = OPAQUE[pBlocks[np + a[0] - face.nOff]] ? 1 : 0;
      const s2 = OPAQUE[pBlocks[np + a[1] - face.nOff]] ? 1 : 0;
      const cc = OPAQUE[pBlocks[np + a[2] - face.nOff]] ? 1 : 0;
      vAo[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
      let sky = nl & 15, blk = nl >> 4, n = 1;
      if (!s1) { const l = pLight[p + a[0]]; sky += l & 15; blk += l >> 4; n++; }
      if (!s2) { const l = pLight[p + a[1]]; sky += l & 15; blk += l >> 4; n++; }
      if (!cc && !(s1 && s2)) { const l = pLight[p + a[2]]; sky += l & 15; blk += l >> 4; n++; }
      vSky[k] = Math.round((sky * 16) / n);
      vBlk[k] = Math.round((blk * 16) / n);
    }
    builder.ensure();
    const base = builder.quads * 4;
    const flip = vAo[0] + vAo[2] < vAo[1] + vAo[3];
    for (let j = 0; j < 4; j++) {
      const k = flip ? (j + 1) & 3 : j;
      const c = face.c[k];
      const uv = UVS[rot ? (k + 1) & 3 : k];
      builder.vertex(base + j, x + c[0], y + c[1], z + c[2], layer, uv[0], uv[1], anim,
        vSky[k], vBlk[k], Math.round(255 * face.shade * AO_CURVE[vAo[k]]));
    }
    builder.quads++;
  }
}

function emitQuad(builder, pts, uvs, layer, anim, sky, blk, shade, animMask = 0b1111) {
  builder.ensure();
  const base = builder.quads * 4;
  for (let j = 0; j < 4; j++) {
    const q = pts[j], uv = uvs[j];
    builder.vertex(base + j, q[0], q[1], q[2], layer, uv[0], uv[1], animMask & (1 << j) ? anim : 0, sky, blk, shade);
  }
  builder.quads++;
}

function crossBlock(p, id, x, y, z, chunk) {
  const b = blocks[id];
  const l = pLight[p];
  const sky = (l & 15) * 16, blk = (l >> 4) * 16;
  let ox = 0, oz = 0;
  if (id === B.TALL_GRASS || id === B.DANDELION || id === B.POPPY) {
    const wx = chunk.cx * 16 + x, wz = chunk.cz * 16 + z;
    ox = (hash3(wx, y, wz, 77) - 0.5) * 0.3;
    oz = (hash3(wx, y, wz, 91) - 0.5) * 0.3;
  }
  const a = 0.15, c = 0.85;
  const x0 = x + a + ox, x1 = x + c + ox, z0 = z + a + oz, z1 = z + c + oz;
  const uv = [[0, 16], [16, 16], [16, 0], [0, 0]];
  const layer = b.tex[0];
  // Masque d'animation : seuls les sommets du haut ondulent (indices 2 et 3).
  const d1 = [[x0, y, z0], [x1, y, z1], [x1, y + 1, z1], [x0, y + 1, z0]];
  const d2 = [[x0, y, z1], [x1, y, z0], [x1, y + 1, z0], [x0, y + 1, z1]];
  const shade = 235;
  for (const d of [d1, d2]) {
    emitQuad(opaqueBuilder, d, uv, layer, 4, sky, blk, shade, 0b1100);
    emitQuad(opaqueBuilder, [d[1], d[0], d[3], d[2]], uv, layer, 4, sky, blk, shade, 0b1100);
  }
}

function liquidBlock(p, id, x, y, z) {
  const water = id === B.WATER;
  const builder = water ? transBuilder : opaqueBuilder;
  const layer = blocks[id].tex[0];
  const anim = water ? 1 : 2;
  const above = pBlocks[p + LAYER];
  const covered = above === id;
  const h00 = covered ? 1 : cornerHeight(p, id, -1, -1);
  const h10 = covered ? 1 : cornerHeight(p, id, 1, -1);
  const h11 = covered ? 1 : cornerHeight(p, id, 1, 1);
  const h01 = covered ? 1 : cornerHeight(p, id, -1, 1);
  const own = pLight[p];
  const lightOf = (q) => {
    const l = OPAQUE[pBlocks[q]] || (!water && pBlocks[q] === id) ? own : pLight[q];
    return [(l & 15) * 16, (l >> 4) * 16];
  };

  // Dessus (visible des deux côtés quand il n'y a pas de liquide au-dessus)
  if (!covered && !OPAQUE[above]) {
    const [s, bl] = lightOf(p + LAYER);
    const pts = [[x, y + h01, z + 1], [x + 1, y + h11, z + 1], [x + 1, y + h10, z], [x, y + h00, z]];
    emitQuad(builder, pts, UVS, layer, anim, s, bl, 255);
    emitQuad(builder, [pts[1], pts[0], pts[3], pts[2]], [UVS[1], UVS[0], UVS[3], UVS[2]], layer, anim, s, bl, 200);
  }
  // Dessous
  const below = pBlocks[p - LAYER];
  if (below !== id && !OPAQUE[below]) {
    const [s, bl] = lightOf(p - LAYER);
    const f = FACES[3];
    emitQuad(builder, f.c.map((c) => [x + c[0], y + c[1], z + c[2]]), UVS, layer, anim, s, bl, 128);
  }
  // Côtés
  const sides = [
    [0, [[x + 1, 0, z + 1, h11], [x + 1, 0, z, h10]]],
    [1, [[x, 0, z, h00], [x, 0, z + 1, h01]]],
    [4, [[x, 0, z + 1, h01], [x + 1, 0, z + 1, h11]]],
    [5, [[x + 1, 0, z, h10], [x, 0, z, h00]]],
  ];
  for (const [f, [a, b2]] of sides) {
    const np = p + FACES[f].nOff;
    const nid = pBlocks[np];
    if (nid === id || OPAQUE[nid]) continue;
    const [s, bl] = lightOf(np);
    const pts = [[a[0], y, a[2]], [b2[0], y, b2[2]], [b2[0], y + b2[3], b2[2]], [a[0], y + a[3], a[2]]];
    const uvs = [[0, 16], [16, 16], [16, Math.round(16 - b2[3] * 16)], [0, Math.round(16 - a[3] * 16)]];
    const shade = Math.round(255 * FACES[f].shade);
    emitQuad(builder, pts, uvs, layer, anim, s, bl, shade);
    if (water) emitQuad(builder, [pts[1], pts[0], pts[3], pts[2]], [uvs[1], uvs[0], uvs[3], uvs[2]], layer, anim, s, bl, shade);
  }
}

// Petite boîte texturée (torche), avec inclinaison optionnelle pour les torches murales.
function torchBlock(p, id, x, y, z) {
  const layer = blocks[id].tex[0];
  const l = pLight[p];
  const sky = (l & 15) * 16, blk = Math.max(l >> 4, 12) * 16;
  const meta = pMeta[p];
  let lx = 0, lz = 0, baseY = 0, bx = 0.5, bz = 0.5;
  if (meta > 0) {
    const n = FACES[meta - 1].n;
    lx = n[0]; lz = n[2];
    bx = 0.5 - lx * 0.33; bz = 0.5 - lz * 0.33;
    baseY = 0.2;
  }
  const w = 1 / 16, h = 10 / 16;
  const lean = 0.3;
  const P = (dx, dy, dz) => [x + bx + dx + lx * dy * lean, y + baseY + dy, z + bz + dz + lz * dy * lean];
  const x0 = -w, x1 = w, z0 = -w, z1 = w;
  const sideUV = [[7, 16], [9, 16], [9, 6], [7, 6]];
  const faces = [
    [[P(x1, 0, z1), P(x1, 0, z0), P(x1, h, z0), P(x1, h, z1)], 0.8],
    [[P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0)], 0.8],
    [[P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1)], 0.9],
    [[P(x1, 0, z0), P(x0, 0, z0), P(x0, h, z0), P(x1, h, z0)], 0.9],
  ];
  for (const [pts, s] of faces) emitQuad(opaqueBuilder, pts, sideUV, layer, 0, sky, blk, Math.round(255 * s));
  emitQuad(opaqueBuilder, [P(x0, h, z1), P(x1, h, z1), P(x1, h, z0), P(x0, h, z0)], [[7, 8], [9, 8], [9, 6], [7, 6]], layer, 0, sky, blk, 255);
  emitQuad(opaqueBuilder, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], [[7, 16], [9, 16], [9, 14], [7, 14]], layer, 0, sky, blk, 160);
}

function cactusBlock(p, id, x, y, z) {
  const b = blocks[id];
  const inset = 1 / 16;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const np = p + face.nOff;
    const nid = pBlocks[np];
    if (f === 2 || f === 3) {
      if (OPAQUE[nid] || nid === id) continue;
    }
    const l = pLight[f === 2 || f === 3 ? np : p];
    const pts = face.c.map((c) => {
      const q = [x + c[0], y + c[1], z + c[2]];
      if (f === 0) q[0] -= inset; else if (f === 1) q[0] += inset;
      else if (f === 4) q[2] -= inset; else if (f === 5) q[2] += inset;
      return q;
    });
    emitQuad(opaqueBuilder, pts, UVS, b.tex[f], 0, (l & 15) * 16, (l >> 4) * 16, Math.round(255 * face.shade));
  }
}
