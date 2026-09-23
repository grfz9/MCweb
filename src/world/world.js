// Le monde : chargement des chunks, accès aux blocs, mises à jour (liquides, gravité, herbe...).
import { Chunk, rleEncode, rleDecode } from './chunk.js';
import { Generator, placeTree, TREE } from './generator.js';
import { initChunkLight, updateLight } from './lighting.js';
import { chunkKey, CHUNK_VOLUME, WORLD_HEIGHT, FACE_DIRS } from '../constants.js';
import {
  B, blocks, SOLID, OPAQUE, IS_LIQUID, REPLACEABLE, isSupporting,
} from '../blocks.js';
import { mulberry32 } from '../noise.js';

const H_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class World {
  constructor(seed, saved = new Map()) {
    this.seed = seed | 0;
    this.gen = new Generator(this.seed);
    this.chunks = new Map();
    this.saved = saved; // clé -> { b, m, e } (chunks modifiés, compressés)
    this.pendingSaves = new Set(); // clés à écrire dans IndexedDB
    this.dirtyChunks = new Set();
    this.scheduled = new Map(); // "x,y,z" -> tick
    this.tick = 0;
    this._lc = null;
    this.rand = mulberry32(this.seed ^ 0xabcdef);
    // Rappels fournis par le jeu
    this.hooks = {
      dropItems: null, // (x, y, z, stacks)
      fallingBlock: null, // (x, y, z, id, meta)
      blockRemoved: null, // (x, y, z, oldId, entity)
    };
  }

  // ------------------------------------------------------------------ chunks
  getChunk(cx, cz) {
    const lc = this._lc;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) this._lc = c;
    return c;
  }

  getLitChunk(cx, cz) {
    const c = this.getChunk(cx, cz);
    return c && c.lit ? c : null;
  }

  hasChunk(cx, cz) {
    return this.chunks.has(chunkKey(cx, cz));
  }

  loadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    c = new Chunk(cx, cz);
    const saved = this.saved.get(key);
    if (saved) {
      c.blocks = rleDecode(saved.b, CHUNK_VOLUME);
      c.meta = rleDecode(saved.m, CHUNK_VOLUME);
      if (saved.e) for (const [i, data] of saved.e) c.blockEntities.set(i, structuredCloneSafe(data));
      c.generated = true;
      c.computeMaxY();
    } else {
      this.gen.generate(c);
    }
    this.chunks.set(key, c);
    initChunkLight(this, c);
    this.markChunkAndNeighborsDirty(c);
    return c;
  }

  unloadChunk(c) {
    if (c.modified) this.storeChunk(c);
    this.chunks.delete(chunkKey(c.cx, c.cz));
    this.dirtyChunks.delete(c);
    if (this._lc === c) this._lc = null;
  }

  // Sérialise un chunk modifié dans la table des sauvegardes.
  storeChunk(c) {
    const key = chunkKey(c.cx, c.cz);
    const e = [];
    for (const [i, data] of c.blockEntities) e.push([i, structuredCloneSafe(data)]);
    this.saved.set(key, { cx: c.cx, cz: c.cz, b: rleEncode(c.blocks), m: rleEncode(c.meta), e });
    this.pendingSaves.add(key);
    c.modified = false;
  }

  storeAllModified() {
    for (const c of this.chunks.values()) if (c.modified) this.storeChunk(c);
  }

  // Un chunk peut être maillé quand lui et ses 8 voisins sont éclairés.
  isMeshable(c) {
    if (!c.lit) return false;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const n = this.getChunk(c.cx + dx, c.cz + dz);
        if (!n || !n.lit) return false;
      }
    return true;
  }

  markDirty(c) {
    if (!c) return;
    c.dirty = true;
    this.dirtyChunks.add(c);
  }

  markChunkAndNeighborsDirty(c) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) this.markDirty(this.getChunk(c.cx + dx, c.cz + dz));
  }

  // Marque à remailler le chunk d'une cellule (et ses voisins si la cellule est au bord).
  markLightChanged(c, x, z) {
    if (!c.dirty) { c.dirty = true; this.dirtyChunks.add(c); }
    const lx = x & 15, lz = z & 15;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15) {
      const dx = lx === 0 ? -1 : lx === 15 ? 1 : 0;
      const dz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
      if (dx) this.markDirtyAt(c.cx + dx, c.cz);
      if (dz) this.markDirtyAt(c.cx, c.cz + dz);
      if (dx && dz) this.markDirtyAt(c.cx + dx, c.cz + dz);
    }
  }

  markDirtyAt(cx, cz) {
    const n = this.getChunk(cx, cz);
    if (n && !n.dirty) { n.dirty = true; this.dirtyChunks.add(n); }
  }

  // ------------------------------------------------------------------ blocs
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_HEIGHT) return B.AIR;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return B.AIR;
    return c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }

  getMeta(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }

  isLoadedAt(x, z) {
    const c = this.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
    return !!c && c.lit;
  }

  getLight(x, y, z) {
    if (y >= WORLD_HEIGHT) return 15;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 15;
    return c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
  }

  getSkyLight(x, y, z) { return this.getLight(x, y, z) & 15; }
  getBlockLight(x, y, z) { return this.getLight(x, y, z) >> 4; }

  setBlock(x, y, z, id, meta = 0, notify = true) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.lit) return false;
    const i = (x & 15) | ((z & 15) << 4) | (y << 8);
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    c.modified = true;
    if (id !== B.AIR && y > c.maxY) c.maxY = y;
    if (old !== id) {
      const keep = (old === B.FURNACE || old === B.LIT_FURNACE) && (id === B.FURNACE || id === B.LIT_FURNACE);
      if (!keep && c.blockEntities.has(i)) c.blockEntities.delete(i);
      updateLight(this, x, y, z, old, id);
    }
    this.markLightChanged(c, x, z);
    if (notify) this.notifyAround(x, y, z);
    return true;
  }

  getBlockEntity(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return null;
    return c.blockEntities.get((x & 15) | ((z & 15) << 4) | (y << 8)) || null;
  }

  setBlockEntity(x, y, z, data) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    c.blockEntities.set((x & 15) | ((z & 15) << 4) | (y << 8), data);
    c.modified = true;
  }

  // Parcourt toutes les entités de blocs chargées (fours à faire cuire).
  *allBlockEntities() {
    for (const c of this.chunks.values()) {
      if (!c.blockEntities.size) continue;
      for (const [i, data] of c.blockEntities) {
        yield { x: c.cx * 16 + (i & 15), y: i >> 8, z: c.cz * 16 + ((i >> 4) & 15), data, chunk: c };
      }
    }
  }

  // ------------------------------------------------------------------ mises à jour de blocs
  schedule(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    const t = this.tick + delay;
    const cur = this.scheduled.get(k);
    if (cur === undefined || cur > t) this.scheduled.set(k, t);
  }

  notifyAround(x, y, z) {
    this.neighborChanged(x, y, z);
    for (const d of FACE_DIRS) this.neighborChanged(x + d[0], y + d[1], z + d[2]);
  }

  neighborChanged(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    const b = blocks[id];
    if (IS_LIQUID[id]) this.schedule(x, y, z, id === B.WATER ? 5 : 30);
    else if (b.gravity) this.schedule(x, y, z, 2);
    else if (b.support) this.schedule(x, y, z, 1);
  }

  hasSupport(x, y, z, id) {
    const b = blocks[id];
    const below = this.getBlock(x, y - 1, z);
    switch (b.support) {
      case 'plant': return below === B.GRASS || below === B.DIRT || below === B.SNOWY_GRASS;
      case 'sand': return below === B.SAND || below === B.GRASS || below === B.DIRT;
      case 'cactus': return below === B.SAND || below === B.CACTUS;
      case 'torch': {
        const m = this.getMeta(x, y, z);
        if (m === 0) return isSupporting(below);
        const d = FACE_DIRS[m - 1];
        return isSupporting(this.getBlock(x - d[0], y - d[1], z - d[2]));
      }
      default: return true;
    }
  }

  // Casse un bloc sans outil (support manquant, eau...) et fait tomber ses objets.
  popBlock(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    const b = blocks[id];
    const stacks = b.drops ? b.drops(Math.random) : [[id, 1]];
    this.setBlock(x, y, z, B.AIR);
    if (this.hooks.dropItems && stacks.length) this.hooks.dropItems(x + 0.5, y + 0.3, z + 0.5, stacks);
  }

  update() {
    this.tick++;
    if (this.scheduled.size) {
      const due = [];
      for (const [k, t] of this.scheduled) if (t <= this.tick) due.push(k);
      let budget = 600; // évite de bloquer une image entière lors d'une grande inondation
      for (const k of due) {
        if (budget-- <= 0) break;
        this.scheduled.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        if (!this.isLoadedAt(x, z)) continue;
        this.blockTick(x, y, z);
      }
    }
  }

  blockTick(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    const b = blocks[id];
    if (IS_LIQUID[id]) this.fluidTick(x, y, z, id);
    else if (b.gravity) {
      const below = this.getBlock(x, y - 1, z);
      if (y > 0 && (below === B.AIR || IS_LIQUID[below] || (REPLACEABLE[below] && !SOLID[below]))) {
        const meta = this.getMeta(x, y, z);
        this.setBlock(x, y, z, B.AIR);
        if (this.hooks.fallingBlock) this.hooks.fallingBlock(x, y, z, id, meta);
      }
    } else if (b.support && !this.hasSupport(x, y, z, id)) {
      this.popBlock(x, y, z);
    }
  }

  // Écoulement de l'eau et de la lave (niveaux 0 = source, 1..7 = courant, 8 = chute).
  fluidTick(x, y, z, id) {
    const water = id === B.WATER;
    const maxLevel = water ? 7 : 3;
    const delay = water ? 5 : 30;
    let level = this.getMeta(x, y, z);

    if (!water) {
      // Lave au contact de l'eau : obsidienne (source) ou pierre taillée (courant).
      for (const d of FACE_DIRS) {
        if (d[1] === -1) continue;
        if (this.getBlock(x + d[0], y + d[1], z + d[2]) === B.WATER) {
          this.setBlock(x, y, z, level === 0 ? B.OBSIDIAN : B.COBBLESTONE);
          return;
        }
      }
    }

    if (level !== 0) {
      let newLevel;
      if (this.getBlock(x, y + 1, z) === id) newLevel = 8; // alimentée par le haut : chute
      else {
        let minL = 99, sources = 0;
        for (const [dx, dz] of H_DIRS) {
          if (this.getBlock(x + dx, y, z + dz) !== id) continue;
          const m = this.getMeta(x + dx, y, z + dz);
          if (m === 0) sources++;
          const eff = m >= 8 ? 0 : m;
          if (eff < minL) minL = eff;
        }
        newLevel = minL + 1;
        if (water && sources >= 2) {
          const below = this.getBlock(x, y - 1, z);
          if (SOLID[below] || (below === B.WATER && this.getMeta(x, y - 1, z) === 0)) newLevel = 0;
        }
        // Plus alimentée (ou trop loin de sa source) : elle s'assèche.
        if (newLevel > maxLevel) {
          this.setBlock(x, y, z, B.AIR);
          return;
        }
      }
      if (newLevel !== level) {
        this.setBlock(x, y, z, id, newLevel);
        level = newLevel;
      }
    }

    // Vers le bas en priorité
    if (y > 0) {
      const below = this.getBlock(x, y - 1, z);
      if (this.flowInto(x, y - 1, z, below, id, 8)) {
        if (level !== 0) return;
      } else if (below === id) {
        if (level !== 0) return;
      }
    }
    // Puis sur les côtés
    const eff = level >= 8 ? 0 : level;
    const next = eff + 1;
    if (next > maxLevel) return;
    const belowId = this.getBlock(x, y - 1, z);
    if (level >= 8 && (belowId === id || belowId === B.AIR)) return;
    for (const [dx, dz] of H_DIRS) {
      const nx = x + dx, nz = z + dz;
      const nid = this.getBlock(nx, y, nz);
      if (nid === id) {
        // La voisine recalcule elle-même son niveau (évite que deux cases s'alimentent en boucle).
        const m = this.getMeta(nx, y, nz);
        if (m !== 0 && m < 8 && m > next) this.schedule(nx, y, nz, delay);
      } else {
        this.flowInto(nx, y, nz, nid, id, next);
      }
    }
  }

  flowInto(x, y, z, cur, id, level) {
    if (!this.isLoadedAt(x, z)) return false;
    if (cur === B.AIR) {
      this.setBlock(x, y, z, id, level);
      return true;
    }
    if (IS_LIQUID[cur]) {
      if (cur !== id && id === B.WATER && cur === B.LAVA) {
        this.setBlock(x, y, z, this.getMeta(x, y, z) === 0 ? B.OBSIDIAN : B.COBBLESTONE);
        return true;
      }
      if (cur !== id && id === B.LAVA && cur === B.WATER) {
        this.setBlock(x, y, z, B.STONE);
        return true;
      }
      return false;
    }
    const b = blocks[cur];
    if (!b.solid && (b.replaceable || b.support)) {
      this.popBlock(x, y, z);
      this.setBlock(x, y, z, id, level);
      return true;
    }
    return false;
  }

  // Ticks aléatoires : herbe qui pousse ou meurt, pousses d'arbres.
  randomTicks(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (!c || !c.lit) return;
    const n = 3 * ((c.maxY >> 4) + 1);
    for (let k = 0; k < n; k++) {
      const r = (this.rand() * 4294967296) >>> 0;
      const lx = r & 15, lz = (r >> 4) & 15, y = (r >>> 8) % (c.maxY + 1);
      const i = lx | (lz << 4) | (y << 8);
      const id = c.blocks[i];
      if (id !== B.GRASS && id !== B.DIRT && id !== B.OAK_SAPLING && id !== B.BIRCH_SAPLING && id !== B.SPRUCE_SAPLING) continue;
      const x = cx * 16 + lx, z = cz * 16 + lz;
      if (id === B.GRASS) {
        const above = this.getBlock(x, y + 1, z);
        if (OPAQUE[above] || IS_LIQUID[above]) { this.setBlock(x, y, z, B.DIRT); continue; }
        const tx = x + Math.floor(this.rand() * 3) - 1, ty = y + Math.floor(this.rand() * 5) - 3, tz = z + Math.floor(this.rand() * 3) - 1;
        if (this.getBlock(tx, ty, tz) === B.DIRT) {
          const ab = this.getBlock(tx, ty + 1, tz);
          if (!OPAQUE[ab] && !IS_LIQUID[ab] && (this.getLight(tx, ty + 1, tz) & 15) >= 9) this.setBlock(tx, ty, tz, B.GRASS);
        }
      } else if (id === B.DIRT) {
        // rien : la terre ne devient herbe que par propagation
      } else if (this.rand() < 0.15) {
        this.growTree(x, y, z, id);
      }
    }
  }

  growTree(x, y, z, saplingId) {
    const type = saplingId === B.BIRCH_SAPLING ? TREE.BIRCH : saplingId === B.SPRUCE_SAPLING ? TREE.SPRUCE : TREE.OAK;
    // Vérifie l'espace libre au-dessus
    for (let k = 1; k < 7; k++) {
      const id = this.getBlock(x, y + k, z);
      if (id !== B.AIR && !blocks[id].anim) return false;
    }
    this.setBlock(x, y, z, B.AIR, 0, false);
    placeTree((tx, ty, tz, id) => {
      const cur = this.getBlock(tx, ty, tz);
      if (cur === B.AIR || cur === B.TALL_GRASS || (id !== B.OAK_LEAVES && id !== B.BIRCH_LEAVES && id !== B.SPRUCE_LEAVES && blocks[cur].anim === 3)) {
        this.setBlock(tx, ty, tz, id, 0, false);
      }
    }, x, y, z, type, mulberry32((this.rand() * 4294967296) | 0));
    if (this.getBlock(x, y - 1, z) === B.GRASS) this.setBlock(x, y - 1, z, B.DIRT, 0, false);
    return true;
  }

  // ------------------------------------------------------------------ requêtes
  // Lancer de rayon (DDA) : premier bloc visé depuis (ox,oy,oz) dans la direction (dx,dy,dz).
  raycast(ox, oy, oz, dx, dy, dz, maxDist, hitLiquids = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
    let face = -1, t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (hitLiquids || !IS_LIQUID[id]) && face !== -2) {
        return { x, y, z, id, face, dist: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4; }
      if (y < -1 || y > WORLD_HEIGHT) break;
    }
    return null;
  }

  // Plus haut bloc solide d'une colonne (ou -1).
  topSolidY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (SOLID[id] || IS_LIQUID[id]) return y;
    }
    return -1;
  }

  // Charge/génère les chunks proches du joueur dans un budget de temps.
  updateLoading(px, pz, radius, budgetMs) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const start = performance.now();
    const r = radius + 1;
    if (!this._order || this._orderRadius !== r) {
      const list = [];
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= (r + 0.5) * (r + 0.5)) list.push([dx, dz, dx * dx + dz * dz]);
      list.sort((a, b) => a[2] - b[2]);
      this._order = list;
      this._orderRadius = r;
    }
    let generated = 0;
    for (const [dx, dz] of this._order) {
      const cx = pcx + dx, cz = pcz + dz;
      if (this.hasChunk(cx, cz)) continue;
      this.loadChunk(cx, cz);
      generated++;
      if (performance.now() - start > budgetMs) break;
    }
    // Déchargement des chunks lointains
    const far = r + 2;
    for (const c of this.chunks.values()) {
      const ddx = c.cx - pcx, ddz = c.cz - pcz;
      if (ddx * ddx + ddz * ddz > far * far) {
        if (this.onUnload) this.onUnload(c);
        this.unloadChunk(c);
      }
    }
    return generated;
  }

  // Liste des objets à sauvegarder et vidage de la file.
  takePendingSaves() {
    const out = [];
    for (const key of this.pendingSaves) {
      const s = this.saved.get(key);
      if (s) out.push({ key, ...s });
    }
    this.pendingSaves.clear();
    return out;
  }
}

function structuredCloneSafe(v) {
  return JSON.parse(JSON.stringify(v));
}

