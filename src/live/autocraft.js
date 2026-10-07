// Artisanat et cuisson « à la voix » pour le chat : « fabrique pioche », « cuis ».
// Les ingrédients sont pris directement dans l'inventaire (sans passer par la grille).
import { RECIPES, SMELTING } from '../crafting.js';
import { WOOL_INDEX, B } from '../blocks.js';
import { getItem, maxStack } from '../items.js';
import { normalizeText } from './commands.js';

const TAGS = {
  planks: [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS],
  log: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG],
  cobble: [B.COBBLESTONE, B.MOSSY_COBBLESTONE],
  wool: Object.values(WOOL_INDEX),
};

const idsFor = (spec) => (typeof spec === 'string' ? TAGS[spec] : [spec]);

// Ingrédients d'une recette : [{ spec, n }]
export function recipeNeeds(r) {
  const counts = new Map();
  const list = r.type === 'shapeless' ? r.ingredients : r.pattern.join('').split('').filter((c) => c !== ' ').map((c) => r.key[c]);
  for (const spec of list) counts.set(spec, (counts.get(spec) || 0) + 1);
  return [...counts].map(([spec, n]) => ({ spec, n }));
}

// Une recette plus grande que 2×2 demande une table d'artisanat.
export function needsTable(r) {
  if (r.type === 'shapeless') return r.ingredients.length > 4;
  return r.pattern.length > 2 || Math.max(...r.pattern.map((s) => s.length)) > 2;
}

function counts(inv) {
  const m = new Map();
  for (const s of inv.slots) if (s) m.set(s.id, (m.get(s.id) || 0) + s.count);
  return m;
}

// Choisit les objets précis à consommer, ou null s'il en manque.
function plan(r, have) {
  const left = new Map(have);
  const take = [];
  for (const { spec, n } of recipeNeeds(r)) {
    let need = n;
    const ids = idsFor(spec).slice().sort((a, b) => (left.get(b) || 0) - (left.get(a) || 0));
    for (const id of ids) {
      const k = Math.min(need, left.get(id) || 0);
      if (k > 0) { take.push([id, k]); left.set(id, left.get(id) - k); need -= k; }
      if (!need) break;
    }
    if (need) return null;
  }
  return take;
}

export function removeItems(inv, id, n) {
  for (let i = inv.slots.length - 1; i >= 0 && n > 0; i--) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(n, s.count);
    s.count -= k;
    n -= k;
    if (s.count <= 0) inv.slots[i] = null;
  }
  return n === 0;
}

const stem = (w) => w.replace(/(es|s|x)$/, '');
const words = (s) => normalizeText(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w && !['de', 'en', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'd', 'l'].includes(w)).map(stem);

// Le nom demandé correspond-il à l'objet ? (chaque mot demandé doit commencer un mot du nom)
export function nameMatches(query, id) {
  const it = getItem(id);
  if (!it) return false;
  const q = words(query);
  if (!q.length) return false;
  const names = [words(it.name), words(it.key.replace(/_/g, ' '))];
  return names.some((n) => q.every((w) => n.some((x) => x.startsWith(w))));
}

// Recettes correspondant à la demande, les meilleures d'abord (diamant avant fer avant pierre…).
export function findRecipes(query) {
  return RECIPES.filter((r) => nameMatches(query, r.out.id)).reverse();
}

// Fabrique `times` fois l'objet demandé si possible.
// Renvoie { ok, id, count } ou { ok: false, reason: 'unknown' | 'missing' | 'table', recipe }.
export function craftByName(inv, query, { table = false, times = 1 } = {}) {
  const candidates = findRecipes(query);
  if (!candidates.length) return { ok: false, reason: 'unknown' };
  let blockedByTable = null;
  for (const r of candidates) {
    if (needsTable(r) && !table) { if (!blockedByTable && plan(r, counts(inv))) blockedByTable = r; continue; }
    let made = 0;
    for (let t = 0; t < times; t++) {
      const take = plan(r, counts(inv));
      if (!take) break;
      for (const [id, k] of take) removeItems(inv, id, k);
      const rest = inv.add({ id: r.out.id, count: r.out.count, dmg: 0 });
      made++;
      if (rest > 0) return { ok: true, id: r.out.id, count: made * r.out.count - rest, overflow: rest };
    }
    if (made) return { ok: true, id: r.out.id, count: made * r.out.count, overflow: 0 };
  }
  if (blockedByTable) return { ok: false, reason: 'table', recipe: blockedByTable };
  return { ok: false, reason: 'missing', recipe: candidates[0] };
}

// Cuisson instantanée : jusqu'à `max` objets cuisables de l'inventaire, avec le combustible de l'inventaire.
// Renvoie { ok, results: [[id, n]] } ou { ok: false, reason: 'nothing' | 'fuel' }.
export function smeltInventory(inv, max = 8) {
  // Ce qui peut cuire : la nourriture d'abord, les bûches en dernier (elles servent aussi de combustible).
  const have = counts(inv);
  const priority = (id) => (getItem(SMELTING.get(id))?.food ? 0 : TAGS.log.includes(id) ? 2 : 1);
  const wanted = [];
  let budget = max;
  for (const id of [...have.keys()].filter((id) => SMELTING.has(id)).sort((a, b) => priority(a) - priority(b))) {
    if (budget <= 0) break;
    const n = Math.min(budget, have.get(id));
    wanted.push([id, n]);
    budget -= n;
  }
  if (!wanted.length) return { ok: false, reason: 'nothing' };

  // Combustible : 200 ticks par objet cuit (charbon = 8 objets, planche = 1,5).
  const smeltingIds = new Set(wanted.map((w) => w[0]));
  const fuelIds = [...have.keys()].filter((id) => getItem(id)?.fuel > 0 && !getItem(id).tool)
    .sort((a, b) => Number(smeltingIds.has(a)) - Number(smeltingIds.has(b)) || getItem(b).fuel - getItem(a).fuel);
  let ticksNeeded = wanted.reduce((t, w) => t + w[1], 0) * 200;
  const burn = [];
  const reserved = new Map(wanted);
  for (const id of fuelIds) {
    if (ticksNeeded <= 0) break;
    const per = getItem(id).fuel;
    const n = Math.min(have.get(id) - (reserved.get(id) || 0), Math.ceil(ticksNeeded / per));
    if (n <= 0) continue;
    burn.push([id, n]);
    reserved.set(id, (reserved.get(id) || 0) + n);
    ticksNeeded -= n * per;
  }
  // Pas assez de combustible : on cuit ce qu'on peut.
  if (ticksNeeded > 0) {
    let cut = Math.ceil(ticksNeeded / 200);
    for (let i = wanted.length - 1; i >= 0 && cut > 0; i--) {
      const k = Math.min(cut, wanted[i][1]);
      wanted[i][1] -= k;
      cut -= k;
      if (!wanted[i][1]) wanted.splice(i, 1);
    }
    if (!wanted.length) return { ok: false, reason: 'fuel' };
  }
  for (const [id, n] of burn) removeItems(inv, id, n);
  const results = [];
  for (const [id, n] of wanted) {
    removeItems(inv, id, n);
    const out = SMELTING.get(id);
    let left = n;
    while (left > 0) {
      const k = Math.min(left, maxStack(out));
      inv.add({ id: out, count: k, dmg: 0 });
      left -= k;
    }
    results.push([out, n]);
  }
  return { ok: true, results };
}
