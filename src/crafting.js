// Recettes d'artisanat (avec ou sans forme) et de cuisson.
import { B, WOOL_INDEX } from './blocks.js';
import { I, toolId, TOOL_MATERIALS } from './items.js';

const PLANKS = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const TAGS = {
  planks: PLANKS,
  log: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG],
  cobble: [B.COBBLESTONE, B.MOSSY_COBBLESTONE],
  wool: Object.values(WOOL_INDEX),
};

export const RECIPES = [];

// shaped(['##', '##'], { '#': id | tag }, [résultat, quantité])
function shaped(pattern, key, id, count = 1) {
  RECIPES.push({ type: 'shaped', pattern, key, out: { id, count } });
}
function shapeless(ingredients, id, count = 1) {
  RECIPES.push({ type: 'shapeless', ingredients, out: { id, count } });
}

shapeless([B.OAK_LOG], B.OAK_PLANKS, 4);
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['#', '#'], { '#': 'planks' }, I.STICK, 4);
shaped(['##', '##'], { '#': 'planks' }, B.CRAFTING_TABLE);
shaped(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
shaped(['###', '# #', '###'], { '#': 'cobble' }, B.FURNACE);
shaped(['###', '# #', '###'], { '#': 'planks' }, B.CHEST);
shaped(['##', '##'], { '#': B.SAND }, B.SANDSTONE);
shaped(['##', '##'], { '#': B.STONE }, B.STONE_BRICKS, 4);
shaped(['WWW', 'PPP'], { W: 'wool', P: 'planks' }, B.BED);
shaped(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
shaped(['###', '###', '###'], { '#': I.COAL }, B.COAL_BLOCK);
shaped(['###', '###', '###'], { '#': I.IRON_INGOT }, B.IRON_BLOCK);
shaped(['###', '###', '###'], { '#': I.GOLD_INGOT }, B.GOLD_BLOCK);
shaped(['###', '###', '###'], { '#': I.DIAMOND }, B.DIAMOND_BLOCK);
shapeless([B.COAL_BLOCK], I.COAL, 9);
shapeless([B.IRON_BLOCK], I.IRON_INGOT, 9);
shapeless([B.GOLD_BLOCK], I.GOLD_INGOT, 9);
shapeless([B.DIAMOND_BLOCK], I.DIAMOND, 9);
shapeless([B.WOOL, B.DANDELION], WOOL_INDEX.yellow);
shapeless([B.WOOL, B.POPPY], WOOL_INDEX.red);
shapeless([B.WOOL, I.COAL], WOOL_INDEX.black);

// Outils
const HEADS = { wooden: 'planks', stone: 'cobble', iron: I.IRON_INGOT, golden: I.GOLD_INGOT, diamond: I.DIAMOND };
for (const m of TOOL_MATERIALS) {
  const k = { '#': HEADS[m], S: I.STICK };
  shaped(['###', ' S ', ' S '], k, toolId(m, 'pickaxe'));
  shaped(['##', '#S', ' S'], k, toolId(m, 'axe'));
  shaped(['#', 'S', 'S'], k, toolId(m, 'shovel'));
  shaped(['#', '#', 'S'], k, toolId(m, 'sword'));
}

function matches(spec, id) {
  if (spec === undefined || spec === ' ') return id === null;
  if (typeof spec === 'string') return id !== null && TAGS[spec].includes(id);
  return id === spec;
}

// grid : tableau de w*h ids (ou null). Renvoie { id, count } ou null.
export function findRecipe(grid, w, h) {
  // Rognage de la zone utilisée
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const items = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const id = grid[y * w + x];
      if (id === null || id === undefined) continue;
      items.push(id);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  if (!items.length) return null;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const at = (x, y) => {
    const id = grid[(minY + y) * w + minX + x];
    return id === undefined ? null : id;
  };

  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ingredients.length !== items.length) continue;
      const pool = items.slice();
      let ok = true;
      for (const ing of r.ingredients) {
        const i = pool.findIndex((id) => matches(ing, id));
        if (i < 0) { ok = false; break; }
        pool.splice(i, 1);
      }
      if (ok) return { ...r.out };
    } else {
      const ph = r.pattern.length, pw = Math.max(...r.pattern.map((s) => s.length));
      if (ph !== th || pw !== tw) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < ph && ok; y++)
          for (let x = 0; x < pw && ok; x++) {
            const ch = r.pattern[y][mirror ? pw - 1 - x : x] ?? ' ';
            const spec = ch === ' ' ? ' ' : r.key[ch];
            if (!matches(spec, at(x, y))) ok = false;
          }
        if (ok) return { ...r.out };
      }
    }
  }
  return null;
}

// Cuisson au four
export const SMELTING = new Map([
  [B.IRON_ORE, I.IRON_INGOT],
  [B.GOLD_ORE, I.GOLD_INGOT],
  [B.COBBLESTONE, B.STONE],
  [B.SAND, B.GLASS],
  [B.CLAY, B.BRICKS],
  [B.OAK_LOG, I.COAL],
  [B.BIRCH_LOG, I.COAL],
  [B.SPRUCE_LOG, I.COAL],
  [I.PORKCHOP, I.COOKED_PORKCHOP],
  [I.BEEF, I.STEAK],
  [I.MUTTON, I.COOKED_MUTTON],
  [I.CHICKEN, I.COOKED_CHICKEN],
]);

export function smeltResult(id) {
  return SMELTING.get(id) ?? null;
}
