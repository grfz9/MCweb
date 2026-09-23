// Propagation de la lumière (ciel et blocs) par parcours en largeur, y compris entre chunks.
import { LIGHT_OPACITY, LIGHT_EMIT } from '../blocks.js';
import { WORLD_HEIGHT } from '../constants.js';

const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;

// File réutilisable (tableau JS simple, très rapide pour des entiers).
const localQueue = [];

// Éclairage initial d'un chunk qui vient d'être généré ou chargé.
export function initChunkLight(world, c) {
  const L = c.light, Bk = c.blocks;
  L.fill(0);
  const top = Math.min(WORLD_HEIGHT - 1, c.maxY + 1);

  // 1) Colonnes de soleil : 15 depuis le ciel jusqu'au premier bloc qui filtre.
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const i = x | (z << 4) | (y << 8);
        if (LIGHT_OPACITY[Bk[i]] !== 0) break;
        L[i] = 15;
      }
    }

  // 2) Graines : cellules pleinement éclairées voisines de cellules plus sombres.
  const q = localQueue;
  q.length = 0;
  for (let y = 0; y <= top; y++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const i = x | (z << 4) | (y << 8);
        if (L[i] !== 15) continue;
        if (
          (x > 0 && dimmer(L, Bk, i - 1)) || (x < 15 && dimmer(L, Bk, i + 1)) ||
          (z > 0 && dimmer(L, Bk, i - 16)) || (z < 15 && dimmer(L, Bk, i + 16)) ||
          (y > 0 && dimmer(L, Bk, i - 256))
        ) q.push(i);
      }
  spreadLocal(L, Bk, q, true);

  // 3) Lumière des blocs émetteurs (lave, pierre lumineuse...)
  q.length = 0;
  for (let i = 0; i < (top + 1) << 8; i++) {
    const e = LIGHT_EMIT[Bk[i]];
    if (e) { L[i] = (L[i] & 0x0f) | (e << 4); q.push(i); }
  }
  spreadLocal(L, Bk, q, false);

  c.lit = true;

  // 4) Échange avec les chunks voisins déjà éclairés.
  const skyQ = [], blkQ = [];
  exchangeBorder(world, c, 1, 0, skyQ, blkQ);
  exchangeBorder(world, c, -1, 0, skyQ, blkQ);
  exchangeBorder(world, c, 0, 1, skyQ, blkQ);
  exchangeBorder(world, c, 0, -1, skyQ, blkQ);
  propagate(world, skyQ, true);
  propagate(world, blkQ, false);
}

function dimmer(L, Bk, n) {
  return LIGHT_OPACITY[Bk[n]] < 15 && (L[n] & 15) < 14;
}

function spreadLocal(L, Bk, q, sky) {
  let qi = 0;
  const shift = sky ? 0 : 4;
  const keep = sky ? 0xf0 : 0x0f;
  while (qi < q.length) {
    const i = q[qi++];
    const lv = (L[i] >> shift) & 15;
    if (lv <= 1) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    for (let d = 0; d < 6; d++) {
      let n;
      if (d === 0) { if (x === 15) continue; n = i + 1; }
      else if (d === 1) { if (x === 0) continue; n = i - 1; }
      else if (d === 2) { if (y === WORLD_HEIGHT - 1) continue; n = i + 256; }
      else if (d === 3) { if (y === 0) continue; n = i - 256; }
      else if (d === 4) { if (z === 15) continue; n = i + 16; }
      else { if (z === 0) continue; n = i - 16; }
      const op = LIGHT_OPACITY[Bk[n]];
      if (op >= 15) continue;
      const nl = sky && d === DOWN && lv === 15 && op === 0 ? 15 : lv - 1 - op;
      if (nl <= 0) continue;
      if (((L[n] >> shift) & 15) < nl) {
        L[n] = (L[n] & keep) | (nl << shift);
        q.push(n);
      }
    }
  }
  q.length = 0;
}

function exchangeBorder(world, c, dx, dz, skyQ, blkQ) {
  const n = world.getChunk(c.cx + dx, c.cz + dz);
  if (!n || !n.lit) return;
  // Toute la hauteur : la lumière d'une torche peut passer au-dessus du relief des deux chunks.
  const ox = c.cx * 16, oz = c.cz * 16;
  for (let y = 0; y < WORLD_HEIGHT; y++)
    for (let k = 0; k < 16; k++) {
      let lx, lz, nx, nz;
      if (dx === 1) { lx = 15; lz = k; nx = 0; nz = k; }
      else if (dx === -1) { lx = 0; lz = k; nx = 15; nz = k; }
      else if (dz === 1) { lx = k; lz = 15; nx = k; nz = 0; }
      else { lx = k; lz = 0; nx = k; nz = 15; }
      const a = c.light[lx | (lz << 4) | (y << 8)];
      const b = n.light[nx | (nz << 4) | (y << 8)];
      const sa = a & 15, sb = b & 15, ba = a >> 4, bb = b >> 4;
      if (sa > sb + 1) skyQ.push(ox + lx, y, oz + lz);
      else if (sb > sa + 1) skyQ.push(ox + dx * 16 + nx, y, oz + dz * 16 + nz);
      if (ba > bb + 1) blkQ.push(ox + lx, y, oz + lz);
      else if (bb > ba + 1) blkQ.push(ox + dx * 16 + nx, y, oz + dz * 16 + nz);
    }
}

// Propagation dans le monde à partir d'une file de coordonnées [x, y, z, ...].
export function propagate(world, q, sky) {
  const shift = sky ? 0 : 4;
  const keep = sky ? 0xf0 : 0x0f;
  let qi = 0;
  while (qi < q.length) {
    const x = q[qi++], y = q[qi++], z = q[qi++];
    const cx = x >> 4, cz = z >> 4;
    const c = world.getLitChunk(cx, cz);
    if (!c) continue;
    const lv = (c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] >> shift) & 15;
    if (lv <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const ny = y + DY[d];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const nx = x + DX[d], nz = z + DZ[d];
      const nc = nx >> 4 === cx && nz >> 4 === cz ? c : world.getLitChunk(nx >> 4, nz >> 4);
      if (!nc) continue;
      const ni = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
      const op = LIGHT_OPACITY[nc.blocks[ni]];
      if (op >= 15) continue;
      const nl = sky && d === DOWN && lv === 15 && op === 0 ? 15 : lv - 1 - op;
      if (nl <= 0) continue;
      if (((nc.light[ni] >> shift) & 15) < nl) {
        nc.light[ni] = (nc.light[ni] & keep) | (nl << shift);
        world.markLightChanged(nc, nx, nz);
        q.push(nx, ny, nz);
      }
    }
  }
}

// Retire la lumière d'une cellule et de tout ce qu'elle éclairait, puis ré-éclaire depuis les autres sources.
function removeLight(world, x, y, z, sky) {
  const shift = sky ? 0 : 4;
  const keep = sky ? 0xf0 : 0x0f;
  const c = world.getLitChunk(x >> 4, z >> 4);
  if (!c) return;
  const i0 = (x & 15) | ((z & 15) << 4) | (y << 8);
  const lv0 = (c.light[i0] >> shift) & 15;
  c.light[i0] &= keep;
  world.markLightChanged(c, x, z);
  if (lv0 === 0) {
    // Rien à retirer, mais la cellule peut devoir être ré-éclairée par ses voisins.
    const aq = [];
    for (let d = 0; d < 6; d++) {
      const ny = y + DY[d];
      if (ny >= 0 && ny < WORLD_HEIGHT) aq.push(x + DX[d], ny, z + DZ[d]);
    }
    propagate(world, aq, sky);
    return;
  }
  const rq = [x, y, z, lv0];
  const aq = [];
  let qi = 0;
  while (qi < rq.length) {
    const cx = rq[qi++], cy = rq[qi++], cz = rq[qi++], lv = rq[qi++];
    for (let d = 0; d < 6; d++) {
      const ny = cy + DY[d];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      const nx = cx + DX[d], nz = cz + DZ[d];
      const nc = world.getLitChunk(nx >> 4, nz >> 4);
      if (!nc) continue;
      const ni = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
      const nl = (nc.light[ni] >> shift) & 15;
      if (nl === 0) continue;
      if ((sky && d === DOWN && lv === 15 && nl === 15) || nl < lv) {
        nc.light[ni] &= keep;
        world.markLightChanged(nc, nx, nz);
        rq.push(nx, ny, nz, nl);
      } else {
        aq.push(nx, ny, nz);
      }
    }
  }
  propagate(world, aq, sky);
}

// Met à jour l'éclairage après le remplacement d'un bloc.
export function updateLight(world, x, y, z, oldId, newId) {
  const oldOp = LIGHT_OPACITY[oldId], newOp = LIGHT_OPACITY[newId];
  const oldEm = LIGHT_EMIT[oldId], newEm = LIGHT_EMIT[newId];
  const c = world.getLitChunk(x >> 4, z >> 4);
  if (!c) return;
  const i = (x & 15) | ((z & 15) << 4) | (y << 8);

  // Lumière des blocs
  if (newOp > oldOp || newEm < oldEm) removeLight(world, x, y, z, false);
  if (newEm > 0 && newEm > c.light[i] >> 4) {
    c.light[i] = (c.light[i] & 0x0f) | (newEm << 4);
    world.markLightChanged(c, x, z);
    propagate(world, [x, y, z], false);
  }
  // Lumière du ciel
  if (newOp > oldOp) removeLight(world, x, y, z, true);

  if (newOp < oldOp) {
    const q = [];
    for (let d = 0; d < 6; d++) {
      const ny = y + DY[d];
      if (ny >= 0 && ny < WORLD_HEIGHT) q.push(x + DX[d], ny, z + DZ[d]);
    }
    if (y === WORLD_HEIGHT - 1) {
      c.light[i] = (c.light[i] & 0xf0) | 15;
      q.push(x, y, z);
    }
    propagate(world, q.slice(), true);
    propagate(world, q, false);
  }
}
