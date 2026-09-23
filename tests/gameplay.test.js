import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRecipe, smeltResult } from '../src/crafting.js';
import { Inventory } from '../src/inventory.js';
import { B } from '../src/blocks.js';
import { I, toolId, breakTime, canHarvest } from '../src/items.js';
import { World } from '../src/world/world.js';
import { moveEntity } from '../src/entity/physics.js';
import { buildTiles, TILE_NAMES } from '../src/textures.js';
import { buildChunkMesh } from '../src/render/mesher.js';
import { seedFromString } from '../src/noise.js';

const _ = null;

test('recettes de base', () => {
  assert.deepEqual(findRecipe([B.OAK_LOG, _, _, _], 2, 2), { id: B.OAK_PLANKS, count: 4 });
  assert.deepEqual(findRecipe([_, B.BIRCH_PLANKS, _, B.OAK_PLANKS], 2, 2), { id: I.STICK, count: 4 });
  assert.deepEqual(findRecipe([B.OAK_PLANKS, B.OAK_PLANKS, B.SPRUCE_PLANKS, B.OAK_PLANKS], 2, 2), { id: B.CRAFTING_TABLE, count: 1 });
  assert.deepEqual(findRecipe([I.COAL, _, I.STICK, _], 2, 2), { id: B.TORCH, count: 4 });
  const c = B.COBBLESTONE;
  assert.deepEqual(findRecipe([c, c, c, c, _, c, c, c, c], 3, 3), { id: B.FURNACE, count: 1 });
  assert.equal(findRecipe([c, c, _, c, _, _, _, _, _], 3, 3), null);
});

test('outils avec forme et symétrie', () => {
  const p = B.OAK_PLANKS, s = I.STICK;
  assert.equal(findRecipe([p, p, p, _, s, _, _, s, _], 3, 3).id, toolId('wooden', 'pickaxe'));
  assert.equal(findRecipe([p, p, _, p, s, _, _, s, _], 3, 3).id, toolId('wooden', 'axe'));
  assert.equal(findRecipe([_, p, p, _, s, p, _, s, _], 3, 3).id, toolId('wooden', 'axe'), 'hache miroir');
  const d = I.DIAMOND;
  assert.equal(findRecipe([_, d, _, _, d, _, _, s, _], 3, 3).id, toolId('diamond', 'sword'));
  assert.equal(findRecipe([_, _, _, _, I.IRON_INGOT, _, _, s, _], 3, 3), null);
});

test('cuisson', () => {
  assert.equal(smeltResult(B.IRON_ORE), I.IRON_INGOT);
  assert.equal(smeltResult(B.SAND), B.GLASS);
  assert.equal(smeltResult(B.DIRT), null);
});

test('inventaire : empilement et débordement', () => {
  const inv = new Inventory();
  assert.equal(inv.add({ id: B.DIRT, count: 100 }), 0);
  assert.equal(inv.slots[0].count, 64);
  assert.equal(inv.slots[1].count, 36);
  assert.equal(inv.add({ id: toolId('iron', 'pickaxe'), count: 1 }), 0);
  assert.equal(inv.count(B.DIRT), 100);
  for (let i = 0; i < 40; i++) inv.add({ id: B.STONE, count: 64 });
  assert.equal(inv.add({ id: B.GLASS, count: 5 }), 5, 'inventaire plein');
});

test('temps de minage et outils requis', () => {
  const hand = breakTime(B.STONE, null);
  const pick = breakTime(B.STONE, toolId('wooden', 'pickaxe'));
  const diamond = breakTime(B.STONE, toolId('diamond', 'pickaxe'));
  assert.ok(hand > pick && pick > diamond);
  assert.equal(canHarvest(B.STONE, null), false);
  assert.equal(canHarvest(B.IRON_ORE, toolId('wooden', 'pickaxe')), false);
  assert.equal(canHarvest(B.IRON_ORE, toolId('stone', 'pickaxe')), true);
  assert.equal(canHarvest(B.DIAMOND_ORE, toolId('iron', 'pickaxe')), true);
  assert.equal(breakTime(B.TORCH, null), 0);
  assert.equal(breakTime(B.BEDROCK, null), Infinity);
});

test('une entité qui tombe s’arrête sur le sol', () => {
  const w = new World(21);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.loadChunk(dx, dz);
  // Colonne dont le sommet est un bloc plein (pas de l'eau)
  let x = 0, top = -1;
  for (; x < 16; x++) {
    top = w.topSolidY(x, 8);
    if (w.getBlock(x, top, 8) !== B.WATER) break;
  }
  const e = { x: x + 0.5, y: top + 10, z: 8.5, w: 0.3, h: 1.8, vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 200; i++) {
    e.vy -= 28 / 60;
    moveEntity(w, e, 0, e.vy / 60, 0);
  }
  assert.ok(Math.abs(e.y - (top + 1)) < 1e-6, `y=${e.y}, sol=${top + 1}`);
  assert.equal(e.onGround, true);
});

test('les textures et le maillage se construisent', () => {
  const data = buildTiles();
  assert.equal(data.length, TILE_NAMES.length * 16 * 16 * 4);
  const w = new World(seedFromString('maillage'));
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.loadChunk(dx, dz);
  const mesh = buildChunkMesh(w, w.getChunk(0, 0));
  assert.ok(mesh.opaqueQuads > 100);
  assert.equal(mesh.opaque.byteLength, mesh.opaqueQuads * 4 * 16);
});

test('le lit se fabrique et on se tient dessus à 9/16 de bloc', () => {
  const W = B.WOOL + 3, p = B.OAK_PLANKS;
  assert.equal(findRecipe([W, B.WOOL, W, p, p, B.BIRCH_PLANKS, _, _, _], 3, 3).id, B.BED);
  const w = new World(22);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.loadChunk(dx, dz);
  for (let y = 100; y < 104; y++) w.setBlock(4, y, 4, B.AIR, 0, false);
  w.setBlock(4, 99, 4, B.STONE, 0, false);
  w.setBlock(4, 100, 4, B.BED, 4, false);
  const e = { x: 4.5, y: 102, z: 4.5, w: 0.3, h: 1.8, vx: 0, vy: 0, vz: 0 };
  for (let i = 0; i < 120; i++) { e.vy -= 28 / 60; moveEntity(w, e, 0, e.vy / 60, 0); }
  assert.ok(Math.abs(e.y - (100 + 9 / 16)) < 1e-6, `y=${e.y}`);
});
