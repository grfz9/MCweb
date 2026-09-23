// Registre des objets : blocs posables, matériaux, nourriture et outils.
import { blocks, B, SHAPE } from './blocks.js';
import { T } from './textures.js';

export const I = {
  STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, FLINT: 261, FLINT_AND_STEEL: 262,
  APPLE: 263, PORKCHOP: 264, COOKED_PORKCHOP: 265, BEEF: 266, STEAK: 267, MUTTON: 268, COOKED_MUTTON: 269,
  CHICKEN: 270, COOKED_CHICKEN: 271, ROTTEN_FLESH: 272, GUNPOWDER: 273, FEATHER: 274, BREAD: 275,
  TOOLS: 280,
};

export const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'sword'];
export const TOOL_MATERIALS = ['wooden', 'stone', 'iron', 'golden', 'diamond'];
const MATERIAL_FR = { wooden: 'en bois', stone: 'en pierre', iron: 'en fer', golden: 'en or', diamond: 'en diamant' };
const TYPE_FR = { pickaxe: 'Pioche', axe: 'Hache', shovel: 'Pelle', sword: 'Épée' };
const MATERIAL_STATS = {
  wooden: { tier: 1, speed: 2, durability: 59, damage: 0 },
  stone: { tier: 2, speed: 4, durability: 131, damage: 1 },
  iron: { tier: 3, speed: 6, durability: 250, damage: 2 },
  golden: { tier: 1, speed: 12, durability: 32, damage: 0 },
  diamond: { tier: 4, speed: 8, durability: 1561, damage: 3 },
};
const BASE_DAMAGE = { pickaxe: 2, axe: 3, shovel: 1.5, sword: 4 };

export const toolId = (material, type) => I.TOOLS + TOOL_MATERIALS.indexOf(material) * 4 + TOOL_TYPES.indexOf(type);

export const items = new Map();

function defItem(id, key, name, props) {
  const it = { id, key, name, icon: T[key], maxStack: 64, block: null, tool: null, food: 0, fuel: 0, flat: true, ...props };
  items.set(id, it);
  return it;
}

// Les blocs obtenables deviennent automatiquement des objets.
for (const b of blocks) {
  if (!b || !b.item) continue;
  const flat = b.shape === SHAPE.CROSS || b.shape === SHAPE.TORCH;
  defItem(b.id, b.key, b.name, { icon: b.tex[4], block: b.id, flat, blockTex: b.tex });
}
// Carburants
for (const id of [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.CRAFTING_TABLE, B.CHEST, B.BOOKSHELF])
  items.get(id).fuel = 300;
for (const id of [B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING]) items.get(id).fuel = 100;
items.get(B.COAL_BLOCK).fuel = 16000;

defItem(I.STICK, 'stick', 'Bâton', { fuel: 100 });
defItem(I.COAL, 'coal', 'Charbon', { fuel: 1600 });
defItem(I.IRON_INGOT, 'iron_ingot', 'Lingot de fer');
defItem(I.GOLD_INGOT, 'gold_ingot', "Lingot d'or");
defItem(I.DIAMOND, 'diamond', 'Diamant');
defItem(I.FLINT, 'flint', 'Silex');
defItem(I.FLINT_AND_STEEL, 'flint_and_steel', 'Briquet', { maxStack: 1, durability: 64 });
defItem(I.APPLE, 'apple', 'Pomme', { food: 4 });
defItem(I.PORKCHOP, 'porkchop', 'Côtelette de porc crue', { food: 3 });
defItem(I.COOKED_PORKCHOP, 'cooked_porkchop', 'Côtelette de porc cuite', { food: 8 });
defItem(I.BEEF, 'beef', 'Bœuf cru', { food: 3 });
defItem(I.STEAK, 'steak', 'Steak', { food: 8 });
defItem(I.MUTTON, 'mutton', 'Mouton cru', { food: 2 });
defItem(I.COOKED_MUTTON, 'cooked_mutton', 'Mouton cuit', { food: 6 });
defItem(I.CHICKEN, 'chicken', 'Poulet cru', { food: 2 });
defItem(I.COOKED_CHICKEN, 'cooked_chicken', 'Poulet cuit', { food: 6 });
defItem(I.ROTTEN_FLESH, 'rotten_flesh', 'Chair putréfiée', { food: 4 });
defItem(I.GUNPOWDER, 'gunpowder', 'Poudre à canon');
defItem(I.FEATHER, 'feather', 'Plume');
defItem(I.BREAD, 'bread', 'Pain', { food: 5 });

for (const m of TOOL_MATERIALS)
  for (const t of TOOL_TYPES) {
    const s = MATERIAL_STATS[m];
    defItem(toolId(m, t), `${m}_${t}`, `${TYPE_FR[t]} ${MATERIAL_FR[m]}`, {
      maxStack: 1,
      durability: s.durability,
      fuel: m === 'wooden' ? 200 : 0,
      tool: {
        type: t, material: m, tier: s.tier, speed: s.speed,
        damage: BASE_DAMAGE[t] + s.damage + (t === 'sword' && m === 'golden' ? 0 : 0),
      },
    });
  }

export function getItem(id) {
  return items.get(id) || null;
}

export function itemName(id) {
  const it = items.get(id);
  return it ? it.name : '?';
}

export function maxStack(id) {
  const it = items.get(id);
  return it ? it.maxStack : 64;
}

export function findItemByKey(key) {
  key = String(key).toLowerCase().replace(/^minecraft:/, '');
  for (const it of items.values()) if (it.key === key) return it;
  return null;
}

// Temps de minage en secondes (formule inspirée de Minecraft).
export function breakTime(blockId, heldId, inWater = false) {
  const b = blocks[blockId];
  if (!b || b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  const tool = heldId ? items.get(heldId)?.tool : null;
  const right = tool && b.tool === tool.type;
  let speed = right ? tool.speed : 1;
  if (tool && tool.type === 'sword' && (b.id === B.OAK_LEAVES || b.id === B.BIRCH_LEAVES || b.id === B.SPRUCE_LEAVES)) speed = 1.5;
  const harvest = canHarvest(blockId, heldId);
  let perTick = speed / b.hardness / (harvest ? 30 : 100);
  if (inWater) perTick /= 5;
  if (perTick >= 1) return 0;
  return Math.ceil(1 / perTick) / 20;
}

export function canHarvest(blockId, heldId) {
  const b = blocks[blockId];
  if (!b) return false;
  if (b.tier === 0) return true;
  const tool = heldId ? items.get(heldId)?.tool : null;
  return !!tool && tool.type === b.tool && tool.tier >= b.tier;
}

export function attackDamage(heldId) {
  const tool = heldId ? items.get(heldId)?.tool : null;
  return tool ? tool.damage : 1;
}

// Liste des objets proposés dans l'inventaire créatif.
export function creativeItems() {
  const list = [];
  for (const it of items.values()) list.push(it.id);
  return list;
}
