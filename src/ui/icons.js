// Icônes des objets (cubes isométriques pour les blocs) et des barres de vie/faim, en data URL.
import { tilePixels, T } from '../textures.js';
import { getItem } from '../items.js';
import { blocks, SHAPE } from '../blocks.js';

const tileCanvases = new Map();
const iconCache = new Map();

function tileCanvas(index) {
  let c = tileCanvases.get(index);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(16, 16);
  img.data.set(tilePixels(index));
  ctx.putImageData(img, 0, 0);
  tileCanvases.set(index, c);
  return c;
}

export function tileDataURL(index, size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas(index), 0, 0, size, size);
  return c.toDataURL();
}

// Cube isométrique à partir des textures du dessus, de gauche et de droite.
function cubeIcon(top, left, right, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = size / 32; // l'icône est dessinée sur une grille de 32
  const face = (tile, a, b, cc, d, e, f, shade) => {
    ctx.setTransform(a * s, b * s, cc * s, d * s, e * s, f * s);
    ctx.drawImage(tileCanvas(tile), 0, 0);
    if (shade > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, 16, 16);
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  // Dessus : losange
  face(top, 1, -0.5, 1, 0.5, 0, 8, 0);
  // Gauche
  face(left, 1, 0.5, 0, 1, 0, 8, 0.22);
  // Droite
  face(right, 1, -0.5, 0, 1, 16, 16, 0.42);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c.toDataURL();
}

export function itemIcon(id) {
  let url = iconCache.get(id);
  if (url) return url;
  const it = getItem(id);
  if (!it) return '';
  if (it.block !== null && !it.flat && blocks[it.block].shape !== SHAPE.CROSS) {
    const b = blocks[it.block];
    const front = b.facing ? b.tex[4] : b.tex[4];
    url = cubeIcon(b.tex[2], front, b.facing ? b.tex[0] : b.tex[0]);
  } else {
    url = tileDataURL(it.icon, 32);
  }
  iconCache.set(id, url);
  return url;
}

// Petites icônes de la barre de vie, de faim et d'air (9x9 pixels).
const HEART = [
  '.##...##.',
  '#oo#.#oo#',
  '#ohh#hhh#',
  '#hhhhhhh#',
  '#hhhhhhh#',
  '.#hhhhh#.',
  '..#hhh#..',
  '...#h#...',
  '....#....',
];
const FOOD = [
  '.....##..',
  '....#bb#.',
  '...#bmbb#',
  '..#mmmb#.',
  '.#mmmm#..',
  '.#mmm#...',
  '#w##.....',
  '#ww#.....',
  '.##......',
];
const BUBBLE = [
  '..###....',
  '.#ooo#...',
  '#o.oo#...',
  '#oooo#...',
  '.####....',
  '.........',
  '.........',
  '.........',
  '.........',
];

function pixelIcon(rows, palette, half = null, size = 27) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const p = size / 9;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      let col = palette[ch];
      if (half && x >= half.from && palette.empty[ch]) col = palette.empty[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * p, y * p, p, p);
    }
  return c.toDataURL();
}

let hudIcons = null;
export function getHudIcons() {
  if (hudIcons) return hudIcons;
  const heartFull = { '#': '#1a0505', h: '#e0242b', o: '#ff9a9a', empty: { h: '#3a2626', o: '#3a2626' } };
  const heartEmpty = { '#': '#1a0505', h: '#3a2626', o: '#3a2626' };
  const foodFull = { '#': '#2b1705', b: '#e9e2cf', m: '#b5652a', w: '#f2efe6', empty: { m: '#3b2a1c', b: '#3b2a1c', w: '#3b2a1c' } };
  const foodEmpty = { '#': '#2b1705', b: '#3b2a1c', m: '#3b2a1c', w: '#3b2a1c' };
  hudIcons = {
    heart: pixelIcon(HEART, heartFull),
    heartHalf: pixelIcon(HEART, heartFull, { from: 5 }),
    heartEmpty: pixelIcon(HEART, heartEmpty),
    food: pixelIcon(FOOD, foodFull),
    foodHalf: pixelIcon(FOOD, foodFull, { from: 4 }),
    foodEmpty: pixelIcon(FOOD, foodEmpty),
    bubble: pixelIcon(BUBBLE, { '#': '#1d3f8f', o: '#9fd0ff', '.': null }),
  };
  return hudIcons;
}

// Motif de fond (terre assombrie) pour les menus.
export function menuBackground() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas(T.dirt), 0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, 64, 64);
  return c.toDataURL();
}

export function textureURL(name, size = 64) {
  return tileDataURL(T[name], size);
}
