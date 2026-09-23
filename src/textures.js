// Génération procédurale de toutes les textures 16x16 du jeu (blocs, objets, créatures).
// Aucune image externe : chaque tuile est peinte pixel par pixel avec un hasard déterministe.
import { mulberry32 } from './noise.js';

export const TILE = 16;

const WOOL_COLORS = {
  white: [233, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217],
  yellow: [248, 197, 39], lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71],
  light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
  brown: [114, 71, 40], green: [84, 109, 27], red: [160, 39, 34], black: [20, 21, 25],
};
export const WOOL_NAMES = Object.keys(WOOL_COLORS);

const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'sword'];
const TOOL_MATERIALS = ['wooden', 'stone', 'iron', 'golden', 'diamond'];

export const TILE_NAMES = [
  'stone', 'cobblestone', 'mossy_cobblestone', 'dirt', 'grass_top', 'grass_side', 'snowy_grass_side', 'snow',
  'sand', 'gravel', 'bedrock', 'water', 'lava', 'clay', 'ice', 'obsidian', 'glowstone',
  'oak_log', 'oak_log_top', 'birch_log', 'birch_log_top', 'spruce_log', 'spruce_log_top',
  'oak_planks', 'birch_planks', 'spruce_planks', 'oak_leaves', 'birch_leaves', 'spruce_leaves',
  'glass', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
  'coal_block', 'iron_block', 'gold_block', 'diamond_block',
  'crafting_table_top', 'crafting_table_side', 'crafting_table_front',
  'furnace_side', 'furnace_top', 'furnace_front', 'furnace_front_lit',
  'chest_top', 'chest_side', 'chest_front',
  'torch', 'tall_grass', 'dandelion', 'poppy', 'dead_bush',
  'oak_sapling', 'birch_sapling', 'spruce_sapling',
  'cactus_side', 'cactus_top', 'sandstone_top', 'sandstone_side', 'sandstone_bottom',
  'bricks', 'stone_bricks', 'bookshelf', 'tnt_side', 'tnt_top', 'tnt_bottom', 'bed_top', 'bed_side',
  ...WOOL_NAMES.map((n) => n + '_wool'),
  'destroy_0', 'destroy_1', 'destroy_2', 'destroy_3', 'destroy_4',
  'destroy_5', 'destroy_6', 'destroy_7', 'destroy_8', 'destroy_9',
  // Créatures
  'pig_skin', 'pig_face', 'pig_snout', 'cow_skin', 'cow_face', 'cow_horn',
  'sheep_wool', 'sheep_face', 'sheep_skin', 'chicken_body', 'chicken_face', 'chicken_beak', 'chicken_wattle',
  'zombie_skin', 'zombie_face', 'zombie_shirt', 'zombie_pants', 'creeper_skin', 'creeper_face', 'player_skin',
  // Objets
  'stick', 'coal', 'iron_ingot', 'gold_ingot', 'diamond', 'flint', 'flint_and_steel', 'apple',
  'porkchop', 'cooked_porkchop', 'beef', 'steak', 'mutton', 'cooked_mutton', 'chicken', 'cooked_chicken',
  'rotten_flesh', 'gunpowder', 'feather', 'bread',
  ...TOOL_MATERIALS.flatMap((m) => TOOL_TYPES.map((t) => `${m}_${t}`)),
];

export const T = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));

// ---------------------------------------------------------------------------
// Outils de peinture

class Img {
  constructor() {
    this.d = new Uint8ClampedArray(TILE * TILE * 4);
  }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c.length > 3 ? c[3] : a;
  }
  get(x, y) {
    const i = (((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return 0;
    return this.d[(y * TILE + x) * 4 + 3];
  }
  clear() { this.d.fill(0); }
}

const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function noiseFill(img, r, base, amount = 0.12, alpha = 255) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) img.set(x, y, mul(base, 1 + (r() - 0.5) * 2 * amount), alpha);
}

function speckle(img, r, color, prob, amount = 0.08) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) if (r() < prob) img.set(x, y, mul(color, 1 + (r() - 0.5) * 2 * amount));
}

function blob(img, r, cx, cy, size, color, amount = 0.1) {
  const pts = [[cx, cy]];
  img.set(cx, cy, mul(color, 1 + (r() - 0.5) * amount));
  for (let i = 1; i < size; i++) {
    const p = pts[Math.floor(r() * pts.length)];
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
    const q = [p[0] + d[0], p[1] + d[1]];
    pts.push(q);
    img.set(q[0], q[1], mul(color, 1 + (r() - 0.5) * 2 * amount));
  }
  return pts;
}

function border(img, color, width = 1) {
  for (let i = 0; i < TILE; i++)
    for (let w = 0; w < width; w++) {
      img.set(i, w, color); img.set(i, TILE - 1 - w, color);
      img.set(w, i, color); img.set(TILE - 1 - w, i, color);
    }
}

// Dessine un motif texte (lignes de caractères) avec une palette.
function pattern(img, rows, palette, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      const c = palette[ch];
      if (c) img.set(ox + x, oy + y, c);
    }
}

// Pierre de base réutilisée par les minerais, le four, etc.
function paintStone(img, r) {
  noiseFill(img, r, [128, 128, 128], 0.08);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16), len = 1 + Math.floor(r() * 3);
    const c = r() < 0.5 ? [108, 108, 108] : [142, 142, 142];
    for (let k = 0; k < len; k++) img.set((x + k) % 16, y, mul(c, 1 + (r() - 0.5) * 0.1));
  }
}

// Motif de pierres arrondies (cellules de Voronoï qui se répètent).
function paintCobble(img, r, base = [122, 122, 122], mortar = [72, 72, 72]) {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push([r() * 16, r() * 16, 0.8 + r() * 0.4]);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let i = 0; i < pts.length; i++)
        for (let oy = -16; oy <= 16; oy += 16)
          for (let ox = -16; ox <= 16; ox += 16) {
            const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
          }
      if (d2 - d1 < 1.1) img.set(x, y, mul(mortar, 1 + (r() - 0.5) * 0.2));
      else {
        const hl = d1 < 2 ? 1.1 : 1;
        img.set(x, y, mul(base, pts[best][2] * hl * (1 + (r() - 0.5) * 0.12)));
      }
    }
}

function paintDirt(img, r) {
  noiseFill(img, r, [134, 96, 67], 0.1);
  speckle(img, r, [100, 72, 50], 0.12);
  speckle(img, r, [160, 118, 84], 0.06);
}

function paintPlanks(img, r, base) {
  for (let board = 0; board < 4; board++) {
    const seam = Math.floor(r() * 16);
    const tone = 0.92 + r() * 0.16;
    for (let row = 0; row < 4; row++) {
      const y = board * 4 + row;
      const rowTone = tone * (1 + (r() - 0.5) * 0.08);
      for (let x = 0; x < 16; x++) {
        let c = mul(base, rowTone * (1 + (r() - 0.5) * 0.08));
        if (row === 3) c = mul(base, 0.62);
        else if (x === seam) c = mul(base, 0.7);
        img.set(x, y, c);
      }
    }
  }
}

function paintLogSide(img, r, base, dark, stripes = true) {
  for (let x = 0; x < 16; x++) {
    const colTone = r() < 0.3 ? 0.78 : 1 + (r() - 0.5) * 0.12;
    for (let y = 0; y < 16; y++) {
      let c = mul(base, colTone * (1 + (r() - 0.5) * 0.1));
      if (stripes && r() < 0.08) c = dark;
      img.set(x, y, c);
    }
  }
}

function paintLogTop(img, r, bark, inner, ring) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c;
      if (d > 6.9) c = mul(bark, 1 + (r() - 0.5) * 0.15);
      else c = Math.floor(d + 0.3) % 2 === 0 ? inner : ring;
      img.set(x, y, mul(c, 1 + (r() - 0.5) * 0.06));
    }
}

function paintLeaves(img, r, base) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (r() < 0.2) { img.set(x, y, [0, 0, 0], 0); continue; }
      const t = r();
      const c = t < 0.2 ? mul(base, 0.7) : t > 0.85 ? mul(base, 1.25) : mul(base, 1 + (r() - 0.5) * 0.2);
      img.set(x, y, c);
    }
}

function paintOre(img, r, color, light) {
  paintStone(img, r);
  const clusters = 4 + Math.floor(r() * 2);
  for (let i = 0; i < clusters; i++) {
    const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
    const pts = blob(img, r, cx, cy, 3 + Math.floor(r() * 3), color, 0.15);
    const p = pts[Math.floor(r() * pts.length)];
    img.set(p[0], p[1], light);
  }
}

function paintMetalBlock(img, r, base) {
  noiseFill(img, r, base, 0.04);
  for (let i = 0; i < 16; i++) {
    img.set(i, 0, mul(base, 1.2)); img.set(0, i, mul(base, 1.2));
    img.set(i, 15, mul(base, 0.7)); img.set(15, i, mul(base, 0.7));
  }
  for (let i = 2; i < 14; i++) {
    img.set(i, 2, mul(base, 0.85)); img.set(2, i, mul(base, 0.85));
    img.set(i, 13, mul(base, 1.1)); img.set(13, i, mul(base, 1.1));
  }
}

function paintWool(img, r, base) {
  noiseFill(img, r, base, 0.06);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x + y * 3) % 7 === 0 && r() < 0.6) img.set(x, y, mul(base, 0.88));
}

function paintPlant(img, r, kind) {
  img.clear();
  if (kind === 'tall_grass') {
    for (let b = 0; b < 8; b++) {
      let x = 1 + Math.floor(r() * 14);
      const h = 5 + Math.floor(r() * 9);
      const lean = r() < 0.5 ? -1 : 1;
      const col = mix([60, 125, 40], [110, 175, 60], r());
      for (let k = 0; k < h; k++) {
        if (k > h * 0.6 && r() < 0.35) x += lean;
        img.set(x, 15 - k, mul(col, 0.85 + (k / h) * 0.3));
      }
    }
  } else if (kind === 'dead_bush') {
    const stem = [120, 80, 40];
    for (let y = 9; y < 16; y++) img.set(7 + (y > 12 ? 0 : (y % 2)), y, stem);
    const branch = (x, y, dx, n) => {
      for (let i = 0; i < n; i++) { x += dx; y -= 1; img.set(x, y, mul(stem, 0.9 + r() * 0.3)); if (r() < 0.3) img.set(x + dx, y, stem); }
    };
    branch(7, 12, -1, 5); branch(8, 11, 1, 6); branch(7, 9, -1, 4); branch(8, 8, 1, 5); branch(7, 7, 0, 3);
  } else if (kind.endsWith('sapling')) {
    const stem = kind === 'birch_sapling' ? [210, 210, 200] : [110, 80, 45];
    const leaf = kind === 'oak_sapling' ? [70, 140, 45] : kind === 'birch_sapling' ? [110, 160, 70] : [50, 95, 60];
    for (let y = 8; y < 16; y++) img.set(7, y, stem);
    for (let y = 1; y < 11; y++)
      for (let x = 2; x < 14; x++) {
        const dx = x - 7.5, dy = y - 5.5;
        const rr = kind === 'spruce_sapling' ? Math.abs(dx) * 1.4 + (y - 1) * -0.55 : Math.hypot(dx, dy * 1.1);
        if ((kind === 'spruce_sapling' ? rr < 0.5 : rr < 5) && r() < 0.85) img.set(x, y, mul(leaf, 0.8 + r() * 0.4));
      }
  } else {
    const stem = [60, 120, 30];
    for (let y = 8; y < 16; y++) img.set(7, y, stem);
    img.set(6, 12, stem); img.set(5, 11, stem); img.set(8, 13, stem); img.set(9, 12, stem);
    if (kind === 'dandelion') {
      const yel = [250, 220, 40];
      for (let y = 4; y < 9; y++) for (let x = 5; x < 10; x++) if (!((x === 5 || x === 9) && (y === 4 || y === 8))) img.set(x, y, mul(yel, 0.9 + r() * 0.2));
      img.set(7, 6, [240, 170, 20]);
    } else {
      const red = [215, 30, 25];
      for (let y = 3; y < 9; y++) for (let x = 4; x < 11; x++) if (Math.hypot(x - 7, y - 5.5) < 3.4) img.set(x, y, mul(red, 0.85 + r() * 0.25));
      img.set(7, 5, [30, 20, 20]); img.set(7, 6, [60, 40, 20]);
    }
  }
}

function paintDestroy(img, stage) {
  img.clear();
  const r = mulberry32(1337);
  // Segments de fissure générés une fois, révélés progressivement.
  const segs = [];
  // Des fissures partent du centre vers l'extérieur, avec quelques embranchements.
  const walkers = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r() * 0.6;
    walkers.push({ x: 7.5, y: 7.5, dx: Math.cos(a), dy: Math.sin(a) });
  }
  for (let step = 0; step < 16; step++) {
    for (let k = 0; k < walkers.length; k++) {
      const w = walkers[k];
      const a = Math.atan2(w.dy, w.dx) + (r() - 0.5) * 1.1;
      w.dx = Math.cos(a); w.dy = Math.sin(a);
      w.x += w.dx; w.y += w.dy;
      if (w.x >= 0 && w.y >= 0 && w.x < 16 && w.y < 16) segs.push([Math.floor(w.x), Math.floor(w.y)]);
      if (r() < 0.06 && walkers.length < 14) walkers.push({ x: w.x, y: w.y, dx: -w.dy, dy: w.dx });
    }
  }
  const n = Math.floor(((stage + 1) / 10) * segs.length);
  for (let i = 0; i < n; i++) img.set(segs[i][0], segs[i][1], [20, 20, 20], 200);
}

function paintTool(img, type, material) {
  img.clear();
  const M = {
    wooden: [[150, 116, 65], [188, 152, 98], [96, 70, 30]],
    stone: [[128, 128, 128], [165, 165, 165], [78, 78, 78]],
    iron: [[216, 216, 216], [255, 255, 255], [130, 130, 130]],
    golden: [[240, 220, 70], [255, 255, 160], [170, 140, 20]],
    diamond: [[60, 230, 200], [170, 255, 240], [20, 140, 125]],
  }[material];
  const stick = [137, 103, 39], stickDark = [80, 58, 22], outline = [40, 30, 20];
  const kind = new Array(256).fill(0); // 0 vide, 1 manche, 2 tête
  const shade = new Float32Array(256);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      // repère le long de la diagonale : v vers le haut-droite, u perpendiculaire
      const px = x + 0.5 - 1, py = 15 - (y + 0.5);
      const v = (px + py) / Math.SQRT2, u = (px - py) / Math.SQRT2;
      let k = 0, s = 0;
      if (type === 'sword') {
        if (v > 5.2 && v < 19.2 && Math.abs(u) < Math.min(1.25, (19.4 - v) * 0.9)) { k = 2; s = u; }
        else if (v > 4 && v <= 5.2 && Math.abs(u) < 3.4) { k = 2; s = -1; }
        else if (v > 1.2 && v <= 4 && Math.abs(u) < 0.8) { k = 1; s = u; }
        else if (v > 0 && v <= 1.2 && Math.abs(u) < 1.2) { k = 2; s = 0; }
      } else {
        const handleEnd = type === 'shovel' ? 13 : 15;
        if (v > 0.4 && v < handleEnd && Math.abs(u) < 0.75) { k = 1; s = u; }
        if (type === 'pickaxe') {
          const c = 14.2 - 0.09 * u * u;
          if (Math.abs(v - c) < 1.1 && Math.abs(u) < 7) { k = 2; s = v - c; }
        } else if (type === 'axe') {
          if (v > 10.5 && v < 16.2 && u < -0.6 && u > -4.8 + (v - 13.3) * (v - 13.3) * 0.18) { k = 2; s = -u - 2.5; }
        } else if (type === 'shovel') {
          if (v > 12 && v < 18.5 && Math.abs(u) < 2.1 - Math.max(0, v - 17) * 0.8) { k = 2; s = u; }
        }
      }
      kind[y * 16 + x] = k;
      shade[y * 16 + x] = s;
    }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const k = kind[y * 16 + x], s = shade[y * 16 + x];
      if (k === 1) img.set(x, y, s > 0 ? stickDark : stick);
      else if (k === 2) img.set(x, y, s > 0.35 ? M[2] : s < -0.35 ? M[1] : M[0]);
    }
  // Contour sombre autour des pixels dessinés
  const copy = kind.slice();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (copy[y * 16 + x]) continue;
      let n = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && copy[ny * 16 + nx] === 2) n = true;
      }
      if (n) img.set(x, y, outline);
    }
}

function roundShape(img, r, cx, cy, rad, base, light, dark) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < rad) {
        const hl = (x + 0.5 - cx) + (y + 0.5 - cy) < -rad * 0.6 ? light : d > rad - 1.1 ? dark : base;
        img.set(x, y, mul(hl, 0.95 + r() * 0.1));
      }
    }
}

function meat(img, r, raw, fat, cooked) {
  const base = cooked ? raw : raw;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = (x + 0.5 - 8) / 6.5, dy = (y + 0.5 - 8.5) / 4.6;
      const rot = dx * 0.8 + dy * 0.6, rot2 = -dx * 0.6 + dy * 0.8;
      const d = rot * rot + rot2 * rot2 * 1.6;
      if (d < 1) {
        let c = mul(base, 0.9 + r() * 0.2);
        if (d > 0.72) c = fat;
        img.set(x, y, c);
      }
    }
}

const PAINTERS = {
  stone: paintStone,
  cobblestone: (img, r) => paintCobble(img, r),
  mossy_cobblestone: (img, r) => {
    paintCobble(img, r);
    for (let i = 0; i < 7; i++) blob(img, r, Math.floor(r() * 16), Math.floor(r() * 16), 4 + Math.floor(r() * 6), [75, 115, 50], 0.2);
  },
  dirt: paintDirt,
  grass_top: (img, r) => {
    noiseFill(img, r, [104, 165, 62], 0.1);
    speckle(img, r, [84, 140, 48], 0.15);
    speckle(img, r, [124, 185, 76], 0.08);
  },
  grass_side: (img, r) => {
    paintDirt(img, r);
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      for (let y = 0; y < depth; y++) img.set(x, y, mul([104, 165, 62], 0.9 + r() * 0.2));
    }
  },
  snowy_grass_side: (img, r) => {
    paintDirt(img, r);
    for (let x = 0; x < 16; x++) {
      const depth = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < depth; y++) img.set(x, y, mul([242, 250, 252], 0.95 + r() * 0.05));
    }
  },
  snow: (img, r) => noiseFill(img, r, [240, 250, 252], 0.03),
  sand: (img, r) => { noiseFill(img, r, [219, 207, 163], 0.05); speckle(img, r, [200, 186, 140], 0.08); },
  gravel: (img, r) => {
    noiseFill(img, r, [130, 124, 122], 0.08);
    for (let i = 0; i < 14; i++) {
      const c = [[100, 95, 93], [160, 155, 150], [115, 104, 95], [85, 82, 80]][Math.floor(r() * 4)];
      blob(img, r, Math.floor(r() * 16), Math.floor(r() * 16), 2 + Math.floor(r() * 4), c, 0.1);
    }
  },
  bedrock: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = [40, 70, 90, 110, 55][Math.floor(r() * 5)];
      img.set(x, y, [v, v, v]);
    }
  },
  water: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const w = Math.sin((x + y * 0.5) * 0.9 + Math.sin(y * 1.3) * 2) * 0.5 + 0.5;
      img.set(x, y, mix([38, 82, 196], [70, 125, 230], w * 0.7 + r() * 0.15), 175);
    }
  },
  lava: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const w = Math.sin(x * 0.8 + Math.cos(y * 0.7) * 2.5) * Math.cos(y * 0.6 + x * 0.3);
      img.set(x, y, w > 0.4 ? [250, 200, 60] : w > -0.2 ? mul([225, 100, 15], 0.9 + r() * 0.2) : [175, 45, 10]);
    }
  },
  clay: (img, r) => { noiseFill(img, r, [160, 166, 179], 0.05); speckle(img, r, [145, 150, 165], 0.1); },
  ice: (img, r) => {
    noiseFill(img, r, [145, 185, 250], 0.05, 185);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      for (let k = 0; k < 4; k++) img.set(x + k, y - k, [200, 225, 255], 200);
    }
  },
  obsidian: (img, r) => { noiseFill(img, r, [22, 16, 32], 0.2); speckle(img, r, [65, 45, 95], 0.08); speckle(img, r, [40, 30, 60], 0.15); },
  glowstone: (img, r) => {
    noiseFill(img, r, [150, 105, 55], 0.1);
    for (let i = 0; i < 12; i++) blob(img, r, Math.floor(r() * 16), Math.floor(r() * 16), 3 + Math.floor(r() * 4), [252, 222, 140], 0.08);
    speckle(img, r, [255, 245, 200], 0.05);
  },
  oak_log: (img, r) => paintLogSide(img, r, [106, 84, 52], [72, 56, 34]),
  oak_log_top: (img, r) => paintLogTop(img, r, [106, 84, 52], [176, 142, 88], [150, 118, 70]),
  birch_log: (img, r) => {
    noiseFill(img, r, [216, 215, 206], 0.04);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(r() * 14), y = Math.floor(r() * 16), len = 2 + Math.floor(r() * 3);
      for (let k = 0; k < len; k++) img.set(x + k, y, [45, 45, 40]);
    }
  },
  birch_log_top: (img, r) => paintLogTop(img, r, [216, 215, 206], [205, 185, 135], [185, 165, 115]),
  spruce_log: (img, r) => paintLogSide(img, r, [60, 42, 24], [40, 28, 16]),
  spruce_log_top: (img, r) => paintLogTop(img, r, [60, 42, 24], [135, 100, 60], [110, 80, 45]),
  oak_planks: (img, r) => paintPlanks(img, r, [162, 130, 78]),
  birch_planks: (img, r) => paintPlanks(img, r, [196, 178, 123]),
  spruce_planks: (img, r) => paintPlanks(img, r, [115, 85, 50]),
  oak_leaves: (img, r) => paintLeaves(img, r, [58, 128, 38]),
  birch_leaves: (img, r) => paintLeaves(img, r, [98, 146, 62]),
  spruce_leaves: (img, r) => paintLeaves(img, r, [48, 92, 56]),
  glass: (img, r) => {
    img.clear();
    const edge = [218, 238, 245];
    border(img, edge);
    for (let k = 0; k < 4; k++) img.set(3 + k, 6 - k, [240, 250, 255], 200);
    for (let k = 0; k < 3; k++) img.set(9 + k, 12 - k, [240, 250, 255], 200);
    for (let i = 0; i < 16; i++) { img.set(i, 1, [190, 215, 225], 90); img.set(1, i, [190, 215, 225], 90); }
  },
  coal_ore: (img, r) => paintOre(img, r, [38, 38, 38], [70, 70, 70]),
  iron_ore: (img, r) => paintOre(img, r, [214, 170, 140], [235, 205, 180]),
  gold_ore: (img, r) => paintOre(img, r, [245, 215, 55], [255, 250, 160]),
  diamond_ore: (img, r) => paintOre(img, r, [80, 225, 215], [200, 255, 250]),
  coal_block: (img, r) => paintMetalBlock(img, r, [30, 30, 32]),
  iron_block: (img, r) => paintMetalBlock(img, r, [222, 222, 222]),
  gold_block: (img, r) => paintMetalBlock(img, r, [248, 214, 58]),
  diamond_block: (img, r) => paintMetalBlock(img, r, [98, 230, 222]),
  crafting_table_top: (img, r) => {
    paintPlanks(img, r, [150, 105, 60]);
    border(img, [95, 62, 32]);
    for (let i = 1; i < 15; i++) { img.set(i, 5, [95, 62, 32]); img.set(i, 10, [95, 62, 32]); img.set(5, i, [95, 62, 32]); img.set(10, i, [95, 62, 32]); }
  },
  crafting_table_side: (img, r) => {
    paintPlanks(img, r, [162, 130, 78]);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) img.set(x, y, mul([150, 105, 60], 0.9 + r() * 0.15));
    for (let x = 0; x < 16; x++) img.set(x, 3, [95, 62, 32]);
    // scie
    for (let x = 3; x < 12; x++) img.set(x, 7, [170, 170, 170]);
    for (let x = 3; x < 12; x += 2) img.set(x, 8, [120, 120, 120]);
    for (let y = 6; y < 9; y++) img.set(12, y, [90, 60, 30]);
  },
  crafting_table_front: (img, r) => {
    paintPlanks(img, r, [162, 130, 78]);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) img.set(x, y, mul([150, 105, 60], 0.9 + r() * 0.15));
    for (let x = 0; x < 16; x++) img.set(x, 3, [95, 62, 32]);
    // marteau
    for (let y = 7; y < 14; y++) img.set(8, y, [110, 75, 40]);
    for (let x = 5; x < 11; x++) { img.set(x, 6, [150, 150, 150]); img.set(x, 7, [120, 120, 120]); }
  },
  furnace_side: (img, r) => { noiseFill(img, r, [118, 118, 118], 0.08); border(img, [90, 90, 90]); },
  furnace_top: (img, r) => { noiseFill(img, r, [128, 128, 128], 0.06); border(img, [95, 95, 95]); },
  furnace_front: (img, r) => {
    noiseFill(img, r, [118, 118, 118], 0.08); border(img, [90, 90, 90]);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) img.set(x, y, [25, 25, 25]);
    for (let x = 3; x < 13; x++) img.set(x, 7, [80, 80, 80]);
    for (let x = 4; x < 12; x += 2) img.set(x, 4, [70, 70, 70]);
  },
  furnace_front_lit: (img, r) => {
    noiseFill(img, r, [118, 118, 118], 0.08); border(img, [90, 90, 90]);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) {
      const f = (y - 8) / 6 + r() * 0.3;
      img.set(x, y, f > 0.9 ? [255, 230, 120] : f > 0.5 ? [250, 150, 30] : [120, 40, 10]);
    }
    for (let x = 3; x < 13; x++) img.set(x, 7, [80, 80, 80]);
    for (let x = 4; x < 12; x += 2) img.set(x, 4, [70, 70, 70]);
  },
  chest_top: (img, r) => { paintPlanks(img, r, [160, 112, 52]); border(img, [72, 46, 20]); },
  chest_side: (img, r) => {
    paintPlanks(img, r, [160, 112, 52]); border(img, [72, 46, 20]);
    for (let x = 0; x < 16; x++) img.set(x, 5, [72, 46, 20]);
  },
  chest_front: (img, r) => {
    paintPlanks(img, r, [160, 112, 52]); border(img, [72, 46, 20]);
    for (let x = 0; x < 16; x++) img.set(x, 5, [72, 46, 20]);
    for (let y = 3; y < 8; y++) for (let x = 7; x < 9; x++) img.set(x, y, y === 3 ? [220, 220, 220] : [170, 170, 170]);
    img.set(7, 6, [50, 50, 50]); img.set(8, 6, [50, 50, 50]);
  },
  torch: (img) => {
    img.clear();
    for (let y = 8; y < 16; y++) { img.set(7, y, [150, 110, 55]); img.set(8, y, [110, 80, 40]); }
    img.set(7, 6, [255, 250, 200]); img.set(8, 6, [255, 220, 90]);
    img.set(7, 7, [255, 200, 60]); img.set(8, 7, [240, 150, 30]);
  },
  tall_grass: (img, r) => paintPlant(img, r, 'tall_grass'),
  dandelion: (img, r) => paintPlant(img, r, 'dandelion'),
  poppy: (img, r) => paintPlant(img, r, 'poppy'),
  dead_bush: (img, r) => paintPlant(img, r, 'dead_bush'),
  oak_sapling: (img, r) => paintPlant(img, r, 'oak_sapling'),
  birch_sapling: (img, r) => paintPlant(img, r, 'birch_sapling'),
  spruce_sapling: (img, r) => paintPlant(img, r, 'spruce_sapling'),
  cactus_side: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = mul([78, 140, 50], 0.92 + r() * 0.12);
      if (x % 4 === 1) c = mul([60, 112, 38], 0.95 + r() * 0.1);
      img.set(x, y, c);
    }
    for (let i = 0; i < 10; i++) img.set(Math.floor(r() * 16), Math.floor(r() * 16), [225, 225, 170]);
  },
  cactus_top: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      img.set(x, y, mul(d > 6.5 ? [60, 112, 38] : Math.floor(d) % 3 === 0 ? [95, 160, 60] : [78, 140, 50], 0.93 + r() * 0.1));
    }
  },
  sandstone_top: (img, r) => noiseFill(img, r, [220, 208, 166], 0.03),
  sandstone_side: (img, r) => {
    noiseFill(img, r, [216, 203, 158], 0.04);
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 3; y++) img.set(x, y, mul([226, 214, 172], 0.98 + r() * 0.04));
      img.set(x, 3, [190, 176, 130]);
      if (r() < 0.5) img.set(x, 8, [200, 187, 142]);
      for (let y = 12; y < 16; y++) img.set(x, y, mul([205, 190, 145], 0.96 + r() * 0.06));
      img.set(x, 12, [185, 170, 125]);
    }
  },
  sandstone_bottom: (img, r) => { noiseFill(img, r, [212, 198, 152], 0.05); speckle(img, r, [190, 176, 130], 0.1); },
  bricks: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      img.set(x, y, mortar ? mul([175, 165, 155], 0.95 + r() * 0.08) : mul([150, 72, 58], 0.88 + r() * 0.2));
    }
  },
  stone_bricks: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 8), off = row % 2 ? 8 : 0;
      const bx = (x + off) % 16;
      let c = mul([122, 122, 122], 0.92 + r() * 0.12);
      if (y % 8 === 7 || bx === 15) c = [78, 78, 78];
      else if (y % 8 === 0 || bx === 0) c = [150, 150, 150];
      img.set(x, y, c);
    }
  },
  bookshelf: (img, r) => {
    paintPlanks(img, r, [162, 130, 78]);
    const colors = [[150, 40, 40], [45, 70, 150], [40, 120, 55], [120, 80, 40], [140, 120, 50], [100, 40, 110]];
    for (const [y0, y1] of [[1, 7], [9, 15]]) {
      for (let x = 1; x < 15;) {
        const w = 1 + (r() < 0.4 ? 1 : 0);
        const c = colors[Math.floor(r() * colors.length)];
        const top = y0 + Math.floor(r() * 2);
        for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = top; y < y1; y++) img.set(xx, y, mul(c, y === top ? 1.2 : 0.9 + r() * 0.15));
        x += w;
      }
      for (let x = 0; x < 16; x++) img.set(x, y1, [95, 70, 40]);
    }
  },
  tnt_side: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      img.set(x, y, x % 4 === 3 ? [150, 30, 25] : mul([205, 55, 40], 0.92 + r() * 0.12));
    for (let y = 5; y < 11; y++) for (let x = 0; x < 16; x++) img.set(x, y, [230, 230, 225]);
    const K = [0, 0, 0];
    pattern(img, ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.'], { '#': K }, 2, 6);
  },
  tnt_top: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, mul([205, 55, 40], 0.92 + r() * 0.12));
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) img.set(x, y, [60, 60, 60]);
    img.set(7, 7, [30, 30, 30]); img.set(8, 8, [30, 30, 30]);
  },
  tnt_bottom: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) img.set(x, y, mul([190, 50, 36], 0.92 + r() * 0.12));
  },
  bed_top: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (x === 0 || x === 15) c = mul([150, 110, 60], 0.9 + r() * 0.15);
      else if (y < 5) c = mul([232, 232, 228], 0.95 + r() * 0.06);
      else if (y === 5) c = [190, 190, 186];
      else c = mul((x + y) % 5 === 0 ? [140, 30, 30] : [168, 38, 36], 0.93 + r() * 0.1);
      img.set(x, y, c);
    }
  },
  bed_side: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = [0, 0, 0, 0];
      if (y >= 7 && y < 12) c = mul([168, 38, 36], 0.9 + r() * 0.12);
      else if (y >= 12 && y < 14) c = mul([150, 110, 60], 0.9 + r() * 0.12);
      else if (y >= 14 && (x < 3 || x > 12)) c = mul([120, 85, 45], 0.9 + r() * 0.1);
      if (c.length === 4) img.set(x, y, [0, 0, 0], 0); else img.set(x, y, c);
    }
  },
  // --- Créatures ---
  pig_skin: (img, r) => noiseFill(img, r, [240, 162, 160], 0.05),
  pig_face: (img, r) => {
    noiseFill(img, r, [240, 162, 160], 0.05);
    for (const x of [2, 12]) { img.set(x, 6, [255, 255, 255]); img.set(x + 1, 6, [30, 20, 20]); img.set(x, 7, [255, 255, 255]); img.set(x + 1, 7, [30, 20, 20]); }
  },
  pig_snout: (img, r) => {
    noiseFill(img, r, [230, 130, 135], 0.04);
    for (const x of [3, 11]) for (let y = 6; y < 10; y++) { img.set(x, y, [120, 60, 60]); img.set(x + 1, y, [120, 60, 60]); }
  },
  cow_skin: (img, r) => {
    noiseFill(img, r, [72, 50, 36], 0.08);
    for (let i = 0; i < 3; i++) blob(img, r, Math.floor(r() * 16), Math.floor(r() * 16), 18, [228, 228, 224], 0.04);
  },
  cow_face: (img, r) => {
    noiseFill(img, r, [72, 50, 36], 0.08);
    for (let y = 2; y < 10; y++) for (let x = 6; x < 10; x++) img.set(x, y, [228, 228, 224]);
    for (let y = 10; y < 16; y++) for (let x = 3; x < 13; x++) img.set(x, y, mul([220, 170, 160], 0.95 + r() * 0.08));
    img.set(5, 12, [60, 30, 30]); img.set(10, 12, [60, 30, 30]);
    for (const x of [2, 12]) { img.set(x, 6, [20, 20, 20]); img.set(x + 1, 6, [240, 240, 240]); }
  },
  cow_horn: (img, r) => noiseFill(img, r, [222, 214, 190], 0.05),
  sheep_wool: (img, r) => { noiseFill(img, r, [236, 236, 232], 0.05); speckle(img, r, [212, 212, 206], 0.2); },
  sheep_face: (img, r) => {
    noiseFill(img, r, [218, 180, 160], 0.05);
    for (const x of [3, 11]) { img.set(x, 7, [255, 255, 255]); img.set(x + 1, 7, [30, 20, 20]); }
    for (let x = 6; x < 10; x++) img.set(x, 12, [180, 120, 110]);
  },
  sheep_skin: (img, r) => noiseFill(img, r, [218, 180, 160], 0.05),
  chicken_body: (img, r) => noiseFill(img, r, [245, 245, 242], 0.03),
  chicken_face: (img, r) => {
    noiseFill(img, r, [245, 245, 242], 0.03);
    for (const x of [2, 12]) { img.set(x, 5, [20, 20, 20]); img.set(x + 1, 5, [20, 20, 20]); img.set(x, 6, [20, 20, 20]); img.set(x + 1, 6, [20, 20, 20]); }
  },
  chicken_beak: (img, r) => noiseFill(img, r, [240, 170, 40], 0.05),
  chicken_wattle: (img, r) => noiseFill(img, r, [210, 30, 30], 0.05),
  zombie_skin: (img, r) => noiseFill(img, r, [82, 138, 70], 0.08),
  zombie_face: (img, r) => {
    noiseFill(img, r, [82, 138, 70], 0.08);
    for (let y = 6; y < 9; y++) { img.set(3, y, [20, 30, 20]); img.set(4, y, [20, 30, 20]); img.set(11, y, [20, 30, 20]); img.set(12, y, [20, 30, 20]); }
    for (let x = 5; x < 11; x++) img.set(x, 12, [50, 80, 45]);
    for (let y = 9; y < 11; y++) { img.set(7, y, [60, 100, 55]); img.set(8, y, [60, 100, 55]); }
  },
  zombie_shirt: (img, r) => noiseFill(img, r, [40, 158, 160], 0.08),
  zombie_pants: (img, r) => noiseFill(img, r, [62, 60, 150], 0.08),
  creeper_skin: (img, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const t = r();
      img.set(x, y, t < 0.15 ? [40, 120, 40] : t < 0.35 ? [120, 210, 110] : t < 0.5 ? [180, 230, 170] : [80, 175, 70]);
    }
  },
  creeper_face: (img, r) => {
    PAINTERS.creeper_skin(img, r);
    const K = [15, 20, 15];
    pattern(img, ['###....###', '###....###', '###....###', '....##....', '..######..', '..######..', '..##..##..', '..##..##..'], { '#': K }, 3, 4);
  },
  player_skin: (img, r) => noiseFill(img, r, [196, 144, 108], 0.04),
  // --- Objets ---
  stick: (img) => {
    img.clear();
    for (let i = 0; i < 11; i++) { img.set(3 + i, 12 - i, [137, 103, 39]); img.set(3 + i, 13 - i, [80, 58, 22]); }
  },
  coal: (img, r) => { img.clear(); roundShape(img, r, 8, 8.5, 5.5, [45, 45, 45], [95, 95, 95], [20, 20, 20]); },
  iron_ingot: (img) => ingot(img, [216, 216, 216], [255, 255, 255], [140, 140, 140]),
  gold_ingot: (img) => ingot(img, [245, 220, 70], [255, 255, 170], [180, 140, 20]),
  diamond: (img) => {
    img.clear();
    pattern(img, [
      '...dddddd...',
      '..dhhLLhhd..',
      '.dhLLhhLLhd.',
      'dhhhhhhhhhhd',
      '.dHHhhhhHHd.',
      '..dHHhhHHd..',
      '...dHHHHd...',
      '....dHHd....',
      '.....dd.....',
    ], { d: [15, 110, 100], h: [75, 235, 215], L: [220, 255, 250], H: [40, 190, 175] }, 2, 3);
  },
  flint: (img) => {
    img.clear();
    pattern(img, [
      '....dd....',
      '...dhHd...',
      '..dhHHHd..',
      '.dhHHHHHd.',
      '.dHHHHHHd.',
      'dhHHHHHHd.',
      'dHHHHHHd..',
      '.dHHHHd...',
      '..dddd....',
    ], { d: [30, 30, 32], h: [120, 120, 125], H: [72, 72, 78] }, 3, 3);
  },
  flint_and_steel: (img) => {
    img.clear();
    const S = [200, 200, 205], D = [110, 110, 115];
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 1.6 + 0.9;
      img.set(Math.round(5 + Math.cos(t) * 3.2), Math.round(6 + Math.sin(t) * 3.2), a % 5 === 0 ? D : S);
    }
    pattern(img, ['.dd.', 'dhHd', 'dHHd', 'dHHd', '.dd.'], { d: [30, 30, 32], h: [120, 120, 125], H: [72, 72, 78] }, 9, 8);
  },
  apple: (img, r) => {
    img.clear();
    roundShape(img, r, 8, 9.5, 5.5, [215, 30, 35], [255, 120, 120], [140, 15, 20]);
    img.set(8, 3, [90, 60, 30]); img.set(8, 4, [90, 60, 30]); img.set(9, 3, [60, 150, 40]); img.set(10, 2, [60, 150, 40]);
  },
  porkchop: (img, r) => { img.clear(); meat(img, r, [235, 140, 140], [250, 225, 220]); },
  cooked_porkchop: (img, r) => { img.clear(); meat(img, r, [190, 130, 80], [235, 210, 160]); },
  beef: (img, r) => { img.clear(); meat(img, r, [200, 50, 45], [240, 210, 205]); },
  steak: (img, r) => { img.clear(); meat(img, r, [130, 80, 45], [180, 140, 100]); },
  mutton: (img, r) => { img.clear(); meat(img, r, [215, 75, 70], [245, 220, 210]); },
  cooked_mutton: (img, r) => { img.clear(); meat(img, r, [150, 95, 60], [200, 160, 120]); },
  chicken: (img, r) => {
    img.clear(); roundShape(img, r, 7, 7, 5, [240, 200, 185], [255, 230, 220], [200, 150, 140]);
    for (let i = 0; i < 4; i++) { img.set(10 + i, 10 + i, [240, 235, 225]); img.set(11 + i, 10 + i, [210, 205, 195]); }
  },
  cooked_chicken: (img, r) => {
    img.clear(); roundShape(img, r, 7, 7, 5, [200, 140, 70], [235, 185, 110], [150, 95, 40]);
    for (let i = 0; i < 4; i++) { img.set(10 + i, 10 + i, [240, 235, 225]); img.set(11 + i, 10 + i, [210, 205, 195]); }
  },
  rotten_flesh: (img, r) => { img.clear(); meat(img, r, [125, 110, 60], [95, 120, 60]); },
  gunpowder: (img, r) => {
    img.clear();
    for (let y = 6; y < 15; y++) for (let x = 2; x < 14; x++) {
      const d = Math.hypot((x - 7.5) / 6, (y - 14) / 8);
      if (d < 1 && r() < 0.8) img.set(x, y, [60 + r() * 80, 60 + r() * 80, 60 + r() * 80].map(Math.round));
    }
  },
  feather: (img) => {
    img.clear();
    for (let i = 0; i < 12; i++) {
      img.set(2 + i, 13 - i, [200, 200, 200]);
      if (i > 2) { img.set(2 + i, 12 - i, [245, 245, 245]); img.set(3 + i, 13 - i, [230, 230, 230]); }
      if (i > 3 && i < 11) { img.set(1 + i, 12 - i, [250, 250, 250]); img.set(4 + i, 14 - i, [220, 220, 220]); }
    }
  },
  bread: (img, r) => {
    img.clear();
    for (let y = 5; y < 12; y++) for (let x = 1; x < 15; x++) {
      const d = Math.hypot((x - 7.5) / 7, (y - 8.5) / 3.6);
      if (d < 1) img.set(x, y, mul(d < 0.6 && (x % 4 === 1) ? [230, 180, 100] : [190, 130, 60], 0.93 + r() * 0.1));
    }
  },
};

function ingot(img, base, light, dark) {
  img.clear();
  pattern(img, [
    '....dddddddd',
    '...dLLLLLLLd',
    '..dLhhhhhhd.',
    '.dhhhhhhhd..',
    'dHHHHHHHd...',
    'dHHHHHHHd...',
    'ddddddddd...',
  ], { d: dark, L: light, h: mix(base, light, 0.4), H: base }, 2, 5);
}

for (const [name, col] of Object.entries(WOOL_COLORS)) PAINTERS[name + '_wool'] = (img, r) => paintWool(img, r, col);
for (let i = 0; i < 10; i++) PAINTERS['destroy_' + i] = (img) => paintDestroy(img, i);
for (const m of TOOL_MATERIALS) for (const t of TOOL_TYPES) PAINTERS[`${m}_${t}`] = (img) => paintTool(img, t, m);

function nameSeed(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h;
}

// Remplit le RGB des pixels transparents avec la couleur moyenne (évite les franges noires des mipmaps).
function bleedTransparent(img) {
  let r = 0, g = 0, b = 0, n = 0;
  const d = img.d;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) { d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; }
}

let cachedAtlas = null;

// Construit toutes les tuiles : Uint8Array de TILE_NAMES.length * 16 * 16 * 4 octets.
export function buildTiles() {
  if (cachedAtlas) return cachedAtlas;
  const data = new Uint8Array(TILE_NAMES.length * TILE * TILE * 4);
  const img = new Img();
  TILE_NAMES.forEach((name, i) => {
    img.clear();
    const painter = PAINTERS[name];
    if (!painter) throw new Error('Texture manquante : ' + name);
    painter(img, mulberry32(nameSeed(name)));
    bleedTransparent(img);
    data.set(img.d, i * TILE * TILE * 4);
  });
  cachedAtlas = data;
  return data;
}

export function tilePixels(index) {
  const data = buildTiles();
  return data.subarray(index * 1024, index * 1024 + 1024);
}

// Couleur moyenne d'une tuile (utile pour les particules et la carte).
export function tileAverageColor(index) {
  const px = tilePixels(index);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 100) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}
