// Géométrie des modèles : créatures (boîtes), objets en 3D (cubes et sprites extrudés).
import { T, tilePixels } from '../textures.js';
import { getItem } from '../items.js';
import { blocks, SHAPE } from '../blocks.js';

// Sommet : x, y, z, u, v, couche, ombrage (7 flottants)
export const MODEL_FLOATS = 7;

const BOX_FACES = [
  { c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.65, key: 'right' },
  { c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.65, key: 'left' },
  { c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, key: 'top' },
  { c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, key: 'bottom' },
  { c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8, key: 'back' },
  { c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, key: 'front' },
];
const QUAD_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];

function pushQuad(out, pts, uvs, layer, shade) {
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const p = pts[k], uv = uvs[k];
    out.push(p[0], p[1], p[2], uv[0], uv[1], layer, shade);
  }
}

// Boîte de from à to (en unités quelconques) ; tex(faceKey, faceIndex) renvoie la couche de texture.
export function pushBox(out, from, to, tex, uvRect = null) {
  BOX_FACES.forEach((f, fi) => {
    const pts = f.c.map((c) => [
      c[0] ? to[0] : from[0],
      c[1] ? to[1] : from[1],
      c[2] ? to[2] : from[2],
    ]);
    const r = uvRect ? uvRect(f.key) : [0, 0, 1, 1];
    const uvs = QUAD_UV.map(([u, v]) => [r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v]);
    pushQuad(out, pts, uvs, tex(f.key, fi), f.shade);
  });
}

// Cube de bloc centré sur l'origine (taille 1) avec les textures du bloc.
export function blockCubeMesh(blockId) {
  const b = blocks[blockId];
  const out = [];
  pushBox(out, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], (key, fi) => (b.facing && fi === 5 ? b.tex[4] : b.facing && fi === 4 ? b.tex[0] : b.tex[fi]));
  return new Float32Array(out);
}

// Sprite extrudé (épaisseur d'un pixel) à partir d'une tuile, centré sur l'origine, taille 1.
export function spriteMesh(layer) {
  const px = tilePixels(layer);
  const out = [];
  const t = 1 / 32;
  const A = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : px[(y * 16 + x) * 4 + 3]);
  // Faces avant et arrière
  pushQuad(out, [[-0.5, -0.5, t], [0.5, -0.5, t], [0.5, 0.5, t], [-0.5, 0.5, t]], QUAD_UV, layer, 1.0);
  pushQuad(out, [[0.5, -0.5, -t], [-0.5, -0.5, -t], [-0.5, 0.5, -t], [0.5, 0.5, -t]], [[1, 1], [0, 1], [0, 0], [1, 0]], layer, 0.75);
  // Tranches
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (A(x, y) < 128) continue;
      const x0 = -0.5 + x / 16, x1 = x0 + 1 / 16;
      const y1 = 0.5 - y / 16, y0 = y1 - 1 / 16;
      const u = (x + 0.5) / 16, v = (y + 0.5) / 16;
      const uv = [[u, v], [u, v], [u, v], [u, v]];
      if (A(x + 1, y) < 128) pushQuad(out, [[x1, y0, t], [x1, y0, -t], [x1, y1, -t], [x1, y1, t]], uv, layer, 0.6);
      if (A(x - 1, y) < 128) pushQuad(out, [[x0, y0, -t], [x0, y0, t], [x0, y1, t], [x0, y1, -t]], uv, layer, 0.6);
      if (A(x, y - 1) < 128) pushQuad(out, [[x0, y1, t], [x1, y1, t], [x1, y1, -t], [x0, y1, -t]], uv, layer, 0.9);
      if (A(x, y + 1) < 128) pushQuad(out, [[x0, y0, -t], [x1, y0, -t], [x1, y0, t], [x0, y0, t]], uv, layer, 0.5);
    }
  return new Float32Array(out);
}

// Maillage d'un objet (cube pour les blocs pleins, sprite sinon).
export function itemMesh(itemId) {
  const it = getItem(itemId);
  if (!it) return { data: spriteMesh(T.stick), cube: false };
  if (it.block !== null && !it.flat && blocks[it.block].shape !== SHAPE.CROSS) {
    return { data: blockCubeMesh(it.block), cube: true };
  }
  return { data: spriteMesh(it.icon), cube: false };
}

// Cube unité (0..1) pour la fissure de minage.
export function unitCubeMesh() {
  const out = [];
  const e = 0.002;
  pushBox(out, [-e, -e, -e], [1 + e, 1 + e, 1 + e], () => 0);
  return new Float32Array(out);
}

// ------------------------------------------------------------------ créatures
// Dimensions en pixels (1/16 de bloc), avant du modèle vers -Z.
const P = 1 / 16;
function part(name, from, to, tex, pivot = null, anim = null) {
  return { name, from, to, tex, pivot, anim };
}
const texOf = (spec) => (key) => T[spec[key] ?? spec.all];

export const MOB_MODELS = {
  pig: {
    parts: [
      part('body', [-5, 6, -8], [5, 14, 8], { all: 'pig_skin' }),
      part('head', [-4, 8, -14], [4, 16, -6], { all: 'pig_skin', front: 'pig_face' }, [0, 12, -8], 'head'),
      part('snout', [-2, 9, -15], [2, 12, -14], { all: 'pig_skin', front: 'pig_snout' }, [0, 12, -8], 'head'),
      part('leg1', [-5, 0, -7], [-1, 6, -3], { all: 'pig_skin' }, [-3, 6, -5], 'legA'),
      part('leg2', [1, 0, -7], [5, 6, -3], { all: 'pig_skin' }, [3, 6, -5], 'legB'),
      part('leg3', [-5, 0, 3], [-1, 6, 7], { all: 'pig_skin' }, [-3, 6, 5], 'legB'),
      part('leg4', [1, 0, 3], [5, 6, 7], { all: 'pig_skin' }, [3, 6, 5], 'legA'),
    ],
  },
  cow: {
    parts: [
      part('body', [-6, 12, -9], [6, 22, 9], { all: 'cow_skin' }),
      part('head', [-4, 16, -15], [4, 24, -9], { all: 'cow_skin', front: 'cow_face' }, [0, 20, -9], 'head'),
      part('horn1', [-5, 22, -13], [-3, 25, -12], { all: 'cow_horn' }, [0, 20, -9], 'head'),
      part('horn2', [3, 22, -13], [5, 25, -12], { all: 'cow_horn' }, [0, 20, -9], 'head'),
      part('leg1', [-6, 0, -8], [-2, 12, -4], { all: 'cow_skin' }, [-4, 12, -6], 'legA'),
      part('leg2', [2, 0, -8], [6, 12, -4], { all: 'cow_skin' }, [4, 12, -6], 'legB'),
      part('leg3', [-6, 0, 4], [-2, 12, 8], { all: 'cow_skin' }, [-4, 12, 6], 'legB'),
      part('leg4', [2, 0, 4], [6, 12, 8], { all: 'cow_skin' }, [4, 12, 6], 'legA'),
    ],
  },
  sheep: {
    parts: [
      part('body', [-5, 11, -8], [5, 21, 8], { all: 'sheep_wool' }),
      part('head', [-3, 15, -14], [3, 22, -6], { all: 'sheep_wool', front: 'sheep_face' }, [0, 18, -7], 'head'),
      part('leg1', [-5, 0, -7], [-1, 12, -3], { all: 'sheep_skin', top: 'sheep_wool' }, [-3, 12, -5], 'legA'),
      part('leg2', [1, 0, -7], [5, 12, -3], { all: 'sheep_skin', top: 'sheep_wool' }, [3, 12, -5], 'legB'),
      part('leg3', [-5, 0, 3], [-1, 12, 7], { all: 'sheep_skin', top: 'sheep_wool' }, [-3, 12, 5], 'legB'),
      part('leg4', [1, 0, 3], [5, 12, 7], { all: 'sheep_skin', top: 'sheep_wool' }, [3, 12, 5], 'legA'),
    ],
  },
  chicken: {
    parts: [
      part('body', [-3, 4, -3], [3, 10, 5], { all: 'chicken_body' }),
      part('head', [-2, 9, -6], [2, 15, -3], { all: 'chicken_body', front: 'chicken_face' }, [0, 10, -4], 'head'),
      part('beak', [-2, 11, -8], [2, 13, -6], { all: 'chicken_beak' }, [0, 10, -4], 'head'),
      part('wattle', [-1, 9, -7], [1, 11, -6], { all: 'chicken_wattle' }, [0, 10, -4], 'head'),
      part('wing1', [-4, 6, -2], [-3, 10, 4], { all: 'chicken_body' }, [-3, 10, 0], 'wingL'),
      part('wing2', [3, 6, -2], [4, 10, 4], { all: 'chicken_body' }, [3, 10, 0], 'wingR'),
      part('leg1', [-2, 0, 0], [-1, 5, 1], { all: 'chicken_beak' }, [-1.5, 5, 0.5], 'legA'),
      part('leg2', [1, 0, 0], [2, 5, 1], { all: 'chicken_beak' }, [1.5, 5, 0.5], 'legB'),
    ],
  },
  zombie: {
    parts: [
      part('head', [-4, 24, -4], [4, 32, 4], { all: 'zombie_skin', front: 'zombie_face' }, [0, 24, 0], 'head'),
      part('body', [-4, 12, -2], [4, 24, 2], { all: 'zombie_shirt' }),
      part('arm1', [-8, 12, -2], [-4, 24, 2], { all: 'zombie_skin', top: 'zombie_shirt' }, [-6, 22, 0], 'armL'),
      part('arm2', [4, 12, -2], [8, 24, 2], { all: 'zombie_skin', top: 'zombie_shirt' }, [6, 22, 0], 'armR'),
      part('leg1', [-4, 0, -2], [0, 12, 2], { all: 'zombie_pants' }, [-2, 12, 0], 'legA'),
      part('leg2', [0, 0, -2], [4, 12, 2], { all: 'zombie_pants' }, [2, 12, 0], 'legB'),
    ],
  },
  creeper: {
    parts: [
      part('head', [-4, 18, -4], [4, 26, 4], { all: 'creeper_skin', front: 'creeper_face' }, [0, 18, 0], 'head'),
      part('body', [-4, 6, -2], [4, 18, 2], { all: 'creeper_skin' }),
      part('leg1', [-4, 0, -6], [0, 6, -2], { all: 'creeper_skin' }, [-2, 6, -4], 'legA'),
      part('leg2', [0, 0, -6], [4, 6, -2], { all: 'creeper_skin' }, [2, 6, -4], 'legB'),
      part('leg3', [-4, 0, 2], [0, 6, 6], { all: 'creeper_skin' }, [-2, 6, 4], 'legB'),
      part('leg4', [0, 0, 2], [4, 6, 6], { all: 'creeper_skin' }, [2, 6, 4], 'legA'),
    ],
  },
};

// Convertit un modèle en maillages par partie (coordonnées en blocs).
export function buildMobMeshes(model) {
  return model.parts.map((p) => {
    const out = [];
    pushBox(out, p.from.map((v) => v * P), p.to.map((v) => v * P), texOf(p.tex));
    return { name: p.name, data: new Float32Array(out), pivot: p.pivot ? p.pivot.map((v) => v * P) : null, anim: p.anim };
  });
}

// Bras du joueur (vue à la première personne).
export function armMesh() {
  const out = [];
  pushBox(out, [-0.125, -0.75, -0.125], [0.125, 0, 0.125], () => T.player_skin);
  return new Float32Array(out);
}
