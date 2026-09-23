import { CHUNK_VOLUME } from '../constants.js';

// Une colonne de 16 x 128 x 16 blocs.
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    this.meta = new Uint8Array(CHUNK_VOLUME);
    // 4 bits bas : lumière du ciel, 4 bits hauts : lumière des blocs.
    this.light = new Uint8Array(CHUNK_VOLUME);
    this.generated = false;
    this.lit = false;
    this.dirty = true; // à remailler
    this.modified = false; // à sauvegarder
    this.maxY = 0; // plus haut bloc non vide
    this.blockEntities = new Map(); // index -> données (coffres, fours)
    this.mesh = null; // données GPU gérées par le moteur de rendu
    this.meshVersion = 0;
  }

  computeMaxY() {
    const b = this.blocks;
    for (let y = 127; y >= 0; y--) {
      const base = y << 8;
      for (let i = 0; i < 256; i++) if (b[base + i] !== 0) { this.maxY = y; return y; }
    }
    this.maxY = 0;
    return 0;
  }
}

// Compression RLE simple pour la sauvegarde (paires [valeur, longueur ≤ 255]).
export function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return new Uint8Array(out);
}

export function rleDecode(data, length) {
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < data.length && o < length; i += 2) {
    const v = data[i];
    const n = data[i + 1];
    out.fill(v, o, Math.min(length, o + n));
    o += n;
  }
  return out;
}
