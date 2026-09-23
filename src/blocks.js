// Registre des blocs : apparence, physique, lumière, minage et objets lâchés.
import { T, WOOL_NAMES } from './textures.js';

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLESTONE: 4, OAK_PLANKS: 5, BEDROCK: 6, WATER: 7, LAVA: 8,
  SAND: 9, GRAVEL: 10, OAK_LOG: 11, OAK_LEAVES: 12, GLASS: 13, COAL_ORE: 14, IRON_ORE: 15, GOLD_ORE: 16,
  DIAMOND_ORE: 17, CRAFTING_TABLE: 18, FURNACE: 19, LIT_FURNACE: 20, TORCH: 21, SNOW_BLOCK: 22,
  SNOWY_GRASS: 23, ICE: 24, CACTUS: 25, SANDSTONE: 26, BIRCH_LOG: 27, BIRCH_LEAVES: 28, BIRCH_PLANKS: 29,
  SPRUCE_LOG: 30, SPRUCE_LEAVES: 31, SPRUCE_PLANKS: 32, TALL_GRASS: 33, DANDELION: 34, POPPY: 35,
  DEAD_BUSH: 36, BRICKS: 37, STONE_BRICKS: 38, GLOWSTONE: 39, OBSIDIAN: 40, BOOKSHELF: 41, CLAY: 42,
  TNT: 43, CHEST: 44, COAL_BLOCK: 45, IRON_BLOCK: 46, GOLD_BLOCK: 47, DIAMOND_BLOCK: 48,
  MOSSY_COBBLESTONE: 49, OAK_SAPLING: 50, BIRCH_SAPLING: 51, SPRUCE_SAPLING: 52, WOOL: 53, // 53..68
};

export const SHAPE = { NONE: 0, CUBE: 1, CROSS: 2, TORCH: 3, LIQUID: 4, CACTUS: 5 };
export const ANIM = { NONE: 0, WATER: 1, LAVA: 2, LEAVES: 3, PLANT: 4 };

// Ids d'objets (non-blocs) utilisés dans les tables de butin.
const IT = { STICK: 256, COAL: 257, DIAMOND: 260, FLINT: 261, APPLE: 263 };

export const blocks = new Array(256).fill(null);

const all = (t) => [t, t, t, t, t, t];
const tsb = (top, side, bottom = top) => [side, side, top, bottom, side, side];

function def(id, key, name, props) {
  const b = {
    id, key, name,
    tex: all(T.stone),
    shape: SHAPE.CUBE,
    solid: true,
    opaque: true,
    translucent: false,
    lightEmit: 0,
    lightOpacity: 15,
    hardness: 1,
    tool: null,
    tier: 0,
    drops: null,
    replaceable: false,
    sound: 'stone',
    gravity: false,
    support: null,
    cullSame: false,
    anim: ANIM.NONE,
    item: true,
    facing: false,
    axis: false,
    interact: null,
    ...props,
  };
  if (!b.opaque && props.lightOpacity === undefined) b.lightOpacity = 0;
  blocks[id] = b;
  return b;
}

const drop = (id, n = 1) => () => [[id, n]];

def(B.AIR, 'air', 'Air', { shape: SHAPE.NONE, solid: false, opaque: false, hardness: 0, replaceable: true, item: false });
def(B.STONE, 'stone', 'Pierre', { tex: all(T.stone), hardness: 1.5, tool: 'pickaxe', tier: 1, drops: drop(B.COBBLESTONE) });
def(B.GRASS, 'grass_block', "Bloc d'herbe", { tex: tsb(T.grass_top, T.grass_side, T.dirt), hardness: 0.6, tool: 'shovel', sound: 'grass', drops: drop(B.DIRT) });
def(B.DIRT, 'dirt', 'Terre', { tex: all(T.dirt), hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(B.COBBLESTONE, 'cobblestone', 'Pierre taillée', { tex: all(T.cobblestone), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.OAK_PLANKS, 'oak_planks', 'Planches de chêne', { tex: all(T.oak_planks), hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BEDROCK, 'bedrock', 'Bedrock', { tex: all(T.bedrock), hardness: -1 });
def(B.WATER, 'water', 'Eau', {
  tex: all(T.water), shape: SHAPE.LIQUID, solid: false, opaque: false, translucent: true, lightOpacity: 2,
  hardness: -1, replaceable: true, cullSame: true, anim: ANIM.WATER, item: false,
});
def(B.LAVA, 'lava', 'Lave', {
  tex: all(T.lava), shape: SHAPE.LIQUID, solid: false, opaque: false, lightOpacity: 15, lightEmit: 15,
  hardness: -1, replaceable: true, cullSame: true, anim: ANIM.LAVA, item: false,
});
def(B.SAND, 'sand', 'Sable', { tex: all(T.sand), hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
def(B.GRAVEL, 'gravel', 'Gravier', {
  tex: all(T.gravel), hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true,
  drops: (r) => [[r() < 0.1 ? IT.FLINT : B.GRAVEL, 1]],
});
def(B.OAK_LOG, 'oak_log', 'Bûche de chêne', { tex: tsb(T.oak_log_top, T.oak_log), hardness: 2, tool: 'axe', sound: 'wood', axis: true });
function leaves(id, key, name, tile, sapling, apple) {
  def(id, key, name, {
    tex: all(tile), opaque: false, lightOpacity: 1, hardness: 0.2, sound: 'grass', anim: ANIM.LEAVES,
    drops: (r) => {
      const out = [];
      if (r() < 0.06) out.push([sapling, 1]);
      if (apple && r() < 0.02) out.push([IT.APPLE, 1]);
      return out;
    },
  });
}
leaves(B.OAK_LEAVES, 'oak_leaves', 'Feuilles de chêne', T.oak_leaves, B.OAK_SAPLING, true);
def(B.GLASS, 'glass', 'Verre', { tex: all(T.glass), opaque: false, hardness: 0.3, sound: 'glass', cullSame: true, drops: () => [] });
def(B.COAL_ORE, 'coal_ore', 'Minerai de charbon', { tex: all(T.coal_ore), hardness: 3, tool: 'pickaxe', tier: 1, drops: drop(IT.COAL) });
def(B.IRON_ORE, 'iron_ore', 'Minerai de fer', { tex: all(T.iron_ore), hardness: 3, tool: 'pickaxe', tier: 2 });
def(B.GOLD_ORE, 'gold_ore', "Minerai d'or", { tex: all(T.gold_ore), hardness: 3, tool: 'pickaxe', tier: 3 });
def(B.DIAMOND_ORE, 'diamond_ore', 'Minerai de diamant', { tex: all(T.diamond_ore), hardness: 3, tool: 'pickaxe', tier: 3, drops: drop(IT.DIAMOND) });
def(B.CRAFTING_TABLE, 'crafting_table', "Table d'artisanat", {
  tex: [T.crafting_table_side, T.crafting_table_front, T.crafting_table_top, T.oak_planks, T.crafting_table_front, T.crafting_table_side],
  hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting',
});
const furnaceTex = (front) => [T.furnace_side, T.furnace_side, T.furnace_top, T.furnace_top, front, T.furnace_side];
def(B.FURNACE, 'furnace', 'Four', { tex: furnaceTex(T.furnace_front), hardness: 3.5, tool: 'pickaxe', tier: 1, facing: true, interact: 'furnace' });
def(B.LIT_FURNACE, 'lit_furnace', 'Four allumé', {
  tex: furnaceTex(T.furnace_front_lit), hardness: 3.5, tool: 'pickaxe', tier: 1, facing: true, interact: 'furnace',
  lightEmit: 13, item: false, drops: drop(B.FURNACE),
});
def(B.TORCH, 'torch', 'Torche', {
  tex: all(T.torch), shape: SHAPE.TORCH, solid: false, opaque: false, hardness: 0, lightEmit: 14,
  sound: 'wood', support: 'torch',
});
def(B.SNOW_BLOCK, 'snow_block', 'Bloc de neige', { tex: all(T.snow), hardness: 0.2, tool: 'shovel', sound: 'snow' });
def(B.SNOWY_GRASS, 'snowy_grass', "Herbe enneigée", { tex: tsb(T.snow, T.snowy_grass_side, T.dirt), hardness: 0.6, tool: 'shovel', sound: 'snow', drops: drop(B.DIRT) });
def(B.ICE, 'ice', 'Glace', { tex: all(T.ice), opaque: false, translucent: true, lightOpacity: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', cullSame: true, drops: () => [] });
def(B.CACTUS, 'cactus', 'Cactus', {
  tex: tsb(T.cactus_top, T.cactus_side), shape: SHAPE.CACTUS, opaque: false, lightOpacity: 0, hardness: 0.4,
  sound: 'wool', support: 'cactus',
});
def(B.SANDSTONE, 'sandstone', 'Grès', { tex: tsb(T.sandstone_top, T.sandstone_side, T.sandstone_bottom), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(B.BIRCH_LOG, 'birch_log', 'Bûche de bouleau', { tex: tsb(T.birch_log_top, T.birch_log), hardness: 2, tool: 'axe', sound: 'wood', axis: true });
leaves(B.BIRCH_LEAVES, 'birch_leaves', 'Feuilles de bouleau', T.birch_leaves, B.BIRCH_SAPLING, false);
def(B.BIRCH_PLANKS, 'birch_planks', 'Planches de bouleau', { tex: all(T.birch_planks), hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_LOG, 'spruce_log', 'Bûche de sapin', { tex: tsb(T.spruce_log_top, T.spruce_log), hardness: 2, tool: 'axe', sound: 'wood', axis: true });
leaves(B.SPRUCE_LEAVES, 'spruce_leaves', 'Feuilles de sapin', T.spruce_leaves, B.SPRUCE_SAPLING, false);
def(B.SPRUCE_PLANKS, 'spruce_planks', 'Planches de sapin', { tex: all(T.spruce_planks), hardness: 2, tool: 'axe', sound: 'wood' });
function plant(id, key, name, tile, support = 'plant', props = {}) {
  def(id, key, name, {
    tex: all(tile), shape: SHAPE.CROSS, solid: false, opaque: false, hardness: 0, sound: 'grass',
    replaceable: false, support, anim: ANIM.PLANT, ...props,
  });
}
plant(B.TALL_GRASS, 'tall_grass', 'Hautes herbes', T.tall_grass, 'plant', { replaceable: true, drops: () => [] });
plant(B.DANDELION, 'dandelion', 'Pissenlit', T.dandelion);
plant(B.POPPY, 'poppy', 'Coquelicot', T.poppy);
plant(B.DEAD_BUSH, 'dead_bush', 'Buisson mort', T.dead_bush, 'sand', { replaceable: true, drops: (r) => [[IT.STICK, Math.floor(r() * 3)]] });
def(B.BRICKS, 'bricks', 'Briques', { tex: all(T.bricks), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.STONE_BRICKS, 'stone_bricks', 'Briques de pierre', { tex: all(T.stone_bricks), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(B.GLOWSTONE, 'glowstone', 'Pierre lumineuse', { tex: all(T.glowstone), opaque: true, lightEmit: 15, hardness: 0.3, sound: 'glass' });
def(B.OBSIDIAN, 'obsidian', 'Obsidienne', { tex: all(T.obsidian), hardness: 50, tool: 'pickaxe', tier: 4 });
def(B.BOOKSHELF, 'bookshelf', 'Bibliothèque', { tex: tsb(T.oak_planks, T.bookshelf), hardness: 1.5, tool: 'axe', sound: 'wood' });
def(B.CLAY, 'clay', 'Argile', { tex: all(T.clay), hardness: 0.6, tool: 'shovel', sound: 'gravel' });
def(B.TNT, 'tnt', 'TNT', { tex: tsb(T.tnt_top, T.tnt_side, T.tnt_bottom), hardness: 0, sound: 'grass', interact: 'tnt' });
def(B.CHEST, 'chest', 'Coffre', {
  tex: [T.chest_side, T.chest_side, T.chest_top, T.chest_top, T.chest_front, T.chest_side],
  hardness: 2.5, tool: 'axe', sound: 'wood', facing: true, interact: 'chest',
});
def(B.COAL_BLOCK, 'coal_block', 'Bloc de charbon', { tex: all(T.coal_block), hardness: 5, tool: 'pickaxe', tier: 1 });
def(B.IRON_BLOCK, 'iron_block', 'Bloc de fer', { tex: all(T.iron_block), hardness: 5, tool: 'pickaxe', tier: 2 });
def(B.GOLD_BLOCK, 'gold_block', "Bloc d'or", { tex: all(T.gold_block), hardness: 3, tool: 'pickaxe', tier: 3 });
def(B.DIAMOND_BLOCK, 'diamond_block', 'Bloc de diamant', { tex: all(T.diamond_block), hardness: 5, tool: 'pickaxe', tier: 3 });
def(B.MOSSY_COBBLESTONE, 'mossy_cobblestone', 'Pierre moussue', { tex: all(T.mossy_cobblestone), hardness: 2, tool: 'pickaxe', tier: 1 });
plant(B.OAK_SAPLING, 'oak_sapling', 'Pousse de chêne', T.oak_sapling);
plant(B.BIRCH_SAPLING, 'birch_sapling', 'Pousse de bouleau', T.birch_sapling);
plant(B.SPRUCE_SAPLING, 'spruce_sapling', 'Pousse de sapin', T.spruce_sapling);

const WOOL_FR = {
  white: 'blanche', orange: 'orange', magenta: 'magenta', light_blue: 'bleu clair', yellow: 'jaune', lime: 'vert clair',
  pink: 'rose', gray: 'grise', light_gray: 'gris clair', cyan: 'cyan', purple: 'violette', blue: 'bleue',
  brown: 'marron', green: 'verte', red: 'rouge', black: 'noire',
};
WOOL_NAMES.forEach((n, i) => {
  def(B.WOOL + i, n + '_wool', 'Laine ' + WOOL_FR[n], { tex: all(T[n + '_wool']), hardness: 0.8, sound: 'wool' });
});
export const WOOL_INDEX = Object.fromEntries(WOOL_NAMES.map((n, i) => [n, B.WOOL + i]));

// Tables compactes pour les boucles chaudes (maillage, lumière, physique).
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIGHT_OPACITY = new Uint8Array(256);
export const LIGHT_EMIT = new Uint8Array(256);
export const SHAPES = new Uint8Array(256);
export const TRANSLUCENT = new Uint8Array(256);
export const REPLACEABLE = new Uint8Array(256);
export const IS_LIQUID = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const b = blocks[i];
  if (!b) { OPAQUE[i] = 1; SOLID[i] = 1; LIGHT_OPACITY[i] = 15; SHAPES[i] = SHAPE.CUBE; continue; }
  OPAQUE[i] = b.opaque ? 1 : 0;
  SOLID[i] = b.solid ? 1 : 0;
  LIGHT_OPACITY[i] = b.lightOpacity;
  LIGHT_EMIT[i] = b.lightEmit;
  SHAPES[i] = b.shape;
  TRANSLUCENT[i] = b.translucent ? 1 : 0;
  REPLACEABLE[i] = b.replaceable ? 1 : 0;
  IS_LIQUID[i] = b.shape === SHAPE.LIQUID ? 1 : 0;
}

export const isLiquid = (id) => IS_LIQUID[id] === 1;
export const isSolid = (id) => SOLID[id] === 1;

// Un bloc peut-il porter une torche, une plante... ?
export function isSupporting(id) {
  const b = blocks[id];
  return !!b && b.solid && b.shape === SHAPE.CUBE;
}

export function blockName(id) {
  return blocks[id] ? blocks[id].name : '?';
}
