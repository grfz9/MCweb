import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { Chunk, rleEncode, rleDecode } from '../src/world/chunk.js';
import { Generator } from '../src/world/generator.js';
import { B } from '../src/blocks.js';
import { chunkKey, CHUNK_VOLUME, SEA_LEVEL } from '../src/constants.js';
import { mulberry32 } from '../src/noise.js';

function loadArea(world, r) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) world.loadChunk(dx, dz);
}

test('le générateur est déterministe et raccorde les arbres entre chunks', () => {
  const a = new Generator(42), b = new Generator(42);
  for (const [cx, cz] of [[0, 0], [5, -3], [-7, 11]]) {
    const ca = new Chunk(cx, cz), cb = new Chunk(cx, cz);
    a.generate(ca);
    b.generate(cb);
    assert.deepEqual(ca.blocks, cb.blocks);
  }
  // Un monde entièrement chargé ne doit contenir aucune bûche flottante coupée par un bord de chunk :
  // chaque bûche au-dessus du sol repose sur une autre bûche ou sur de la terre.
  const w = new World(1234);
  loadArea(w, 3);
  const logs = new Set([B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG]);
  let checked = 0;
  for (let x = -40; x < 40; x++)
    for (let z = -40; z < 40; z++)
      for (let y = SEA_LEVEL; y < 120; y++) {
        const id = w.getBlock(x, y, z);
        if (!logs.has(id)) continue;
        const below = w.getBlock(x, y - 1, z);
        assert.ok(logs.has(below) || below === B.DIRT || below === B.GRASS || below === B.SNOWY_GRASS, `bûche flottante en ${x},${y},${z}`);
        checked++;
      }
  assert.ok(checked > 0, 'au moins un arbre attendu');
});

test('l’éclairage incrémental correspond à un recalcul complet', () => {
  const seed = 777;
  const w = new World(seed);
  loadArea(w, 3);
  const rand = mulberry32(99);
  const ids = [B.STONE, B.AIR, B.GLASS, B.TORCH, B.GLOWSTONE, B.OAK_LEAVES, B.AIR, B.AIR];
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(rand() * 40) - 20, z = Math.floor(rand() * 40) - 20;
    const top = w.topSolidY(x, z);
    const y = Math.max(1, top - 6 + Math.floor(rand() * 10));
    const id = ids[Math.floor(rand() * ids.length)];
    w.setBlock(x, y, z, id, 0, false);
  }
  // Monde de référence : mêmes blocs, lumière calculée depuis zéro.
  const saved = new Map();
  for (const c of w.chunks.values()) {
    saved.set(chunkKey(c.cx, c.cz), { b: rleEncode(c.blocks), m: rleEncode(c.meta), e: [] });
  }
  const ref = new World(seed, saved);
  loadArea(ref, 3);
  let diffs = 0;
  for (const c of w.chunks.values()) {
    const r = ref.getChunk(c.cx, c.cz);
    for (let i = 0; i < CHUNK_VOLUME; i++) if (c.light[i] !== r.light[i]) diffs++;
  }
  assert.equal(diffs, 0);
});

test('une torche éclaire à 14 et s’éteint quand on la retire', () => {
  const w = new World(5);
  loadArea(w, 2);
  const x = 3, z = 3, y = 20; // sous terre
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++) w.setBlock(x + dx, y + dy, z + dz, B.STONE, 0, false);
  w.setBlock(x, y, z, B.AIR, 0, false);
  w.setBlock(x + 1, y, z, B.AIR, 0, false);
  w.setBlock(x, y, z, B.TORCH, 0, false);
  assert.equal(w.getBlockLight(x, y, z), 14);
  assert.equal(w.getBlockLight(x + 1, y, z), 13);
  w.setBlock(x, y, z, B.AIR, 0, false);
  assert.equal(w.getBlockLight(x, y, z), 0);
  assert.equal(w.getBlockLight(x + 1, y, z), 0);
});

test('un bloc posé fait de l’ombre et la retire en le cassant', () => {
  const w = new World(8);
  loadArea(w, 2);
  const x = 2, z = 2;
  const top = w.topSolidY(x, z);
  assert.equal(w.getSkyLight(x, top + 1, z), 15);
  w.setBlock(x, top + 5, z, B.STONE, 0, false);
  assert.ok(w.getSkyLight(x, top + 1, z) < 15, 'ombre sous le bloc');
  w.setBlock(x, top + 5, z, B.AIR, 0, false);
  assert.equal(w.getSkyLight(x, top + 1, z), 15);
});

function flatPool(w) {
  // Plate-forme de pierre fermée à y = 100
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
    for (let y = 100; y < 104; y++) w.setBlock(x, y, z, B.AIR, 0, false);
    w.setBlock(x, 99, z, B.STONE, 0, false);
  }
}

test('l’eau s’écoule sur 7 blocs puis se retire sans source', () => {
  const w = new World(3);
  loadArea(w, 2);
  flatPool(w);
  w.setBlock(0, 100, 0, B.WATER, 0);
  for (let i = 0; i < 400; i++) w.update();
  assert.equal(w.getBlock(7, 100, 0), B.WATER);
  assert.equal(w.getMeta(7, 100, 0), 7);
  assert.equal(w.getBlock(8, 100, 0), B.AIR);
  w.setBlock(0, 100, 0, B.AIR);
  for (let i = 0; i < 400; i++) w.update();
  let water = 0;
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) if (w.getBlock(x, 100, z) === B.WATER) water++;
  assert.equal(water, 0);
});

test('deux sources d’eau voisines créent une source infinie', () => {
  const w = new World(4);
  loadArea(w, 2);
  flatPool(w);
  // Tranchée de 3 blocs entourée de pierre
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) if (z !== 0 || Math.abs(x) === 2) w.setBlock(x, 100, z, B.STONE, 0, false);
  w.setBlock(-1, 100, 0, B.WATER, 0);
  w.setBlock(1, 100, 0, B.WATER, 0);
  for (let i = 0; i < 100; i++) w.update();
  assert.equal(w.getBlock(0, 100, 0), B.WATER);
  assert.equal(w.getMeta(0, 100, 0), 0);
});

test('la lave rencontrant l’eau donne de l’obsidienne ou de la pierre', () => {
  const w = new World(6);
  loadArea(w, 2);
  flatPool(w);
  w.setBlock(0, 100, 0, B.LAVA, 0);
  w.setBlock(1, 100, 0, B.WATER, 0);
  for (let i = 0; i < 100; i++) w.update();
  assert.equal(w.getBlock(0, 100, 0), B.OBSIDIAN);
});

test('le sable sans support déclenche la chute', () => {
  const w = new World(9);
  loadArea(w, 2);
  flatPool(w);
  const falling = [];
  w.hooks.fallingBlock = (x, y, z, id) => falling.push([x, y, z, id]);
  w.setBlock(0, 103, 0, B.SAND, 0);
  for (let i = 0; i < 5; i++) w.update();
  assert.equal(w.getBlock(0, 103, 0), B.AIR);
  assert.deepEqual(falling, [[0, 103, 0, B.SAND]]);
});

test('une torche sans support tombe', () => {
  const w = new World(10);
  loadArea(w, 2);
  flatPool(w);
  const drops = [];
  w.hooks.dropItems = (x, y, z, stacks) => drops.push(...stacks);
  w.setBlock(0, 100, 0, B.STONE, 0);
  w.setBlock(1, 100, 0, B.TORCH, 1); // accrochée au mur en -X
  w.setBlock(0, 100, 0, B.AIR);
  for (let i = 0; i < 3; i++) w.update();
  assert.equal(w.getBlock(1, 100, 0), B.AIR);
  assert.deepEqual(drops, [[B.TORCH, 1]]);
});

test('le lancer de rayon trouve le bloc et la face visés', () => {
  const w = new World(11);
  loadArea(w, 1);
  flatPool(w);
  w.setBlock(0, 100, -5, B.STONE, 0, false);
  const hit = w.raycast(0.5, 100.5, 0.5, 0, 0, -1, 10);
  assert.equal(hit.x, 0);
  assert.equal(hit.y, 100);
  assert.equal(hit.z, -5);
  assert.equal(hit.face, 4); // face +Z
});

test('la compression RLE est réversible', () => {
  const a = new Uint8Array(CHUNK_VOLUME);
  const r = mulberry32(1);
  for (let i = 0; i < a.length; i++) a[i] = r() < 0.7 ? 1 : Math.floor(r() * 5);
  const enc = rleEncode(a);
  assert.deepEqual(rleDecode(enc, a.length), a);
  assert.ok(rleEncode(new Uint8Array(CHUNK_VOLUME)).length < 300);
});

test('les chunks modifiés sont sauvegardés puis rechargés à l’identique', () => {
  const w = new World(12);
  loadArea(w, 1);
  w.setBlock(4, 90, 4, B.DIAMOND_BLOCK, 0, false);
  w.setBlockEntity(4, 90, 4, { type: 'chest', slots: [{ id: 260, count: 3, dmg: 0 }] });
  w.storeAllModified();
  const saves = w.takePendingSaves();
  assert.equal(saves.length, 1);
  const map = new Map(saves.map((s) => [s.key, s]));
  const w2 = new World(12, map);
  loadArea(w2, 1);
  assert.equal(w2.getBlock(4, 90, 4), B.DIAMOND_BLOCK);
  assert.equal(w2.getBlockEntity(4, 90, 4).slots[0].count, 3);
});

test('les feuilles naturelles tombent quand le tronc disparaît, pas celles posées', () => {
  const w = new World(13);
  loadArea(w, 2);
  flatPool(w);
  w.setBlock(0, 100, 0, B.OAK_LOG, 0, false);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1]]) w.setBlock(x, 100, z, B.OAK_LEAVES, 0, false);
  w.setBlock(0, 100, -1, B.OAK_LEAVES, 1, false); // posée par le joueur
  w.setBlock(0, 100, 0, B.AIR);
  for (let i = 0; i < 250; i++) w.update();
  assert.equal(w.getBlock(1, 100, 0), B.AIR);
  assert.equal(w.getBlock(-1, 100, 0), B.AIR);
  assert.equal(w.getBlock(0, 100, 1), B.AIR);
  assert.equal(w.getBlock(0, 100, -1), B.OAK_LEAVES);
});
