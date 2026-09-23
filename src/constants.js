// Constantes globales du monde et du jeu.
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const SEA_LEVEL = 62;

export const TICKS_PER_SECOND = 20;
export const TICK_TIME = 1 / TICKS_PER_SECOND;
// Un jour complet dure 24000 ticks (20 minutes), comme dans Minecraft.
export const DAY_LENGTH = 24000;

export const GAMEMODE = { SURVIVAL: 'survival', CREATIVE: 'creative' };

// Index d'un bloc dans les tableaux d'un chunk : x | z << 4 | y << 8
export function blockIndex(x, y, z) {
  return x | (z << 4) | (y << 8);
}

// Clé numérique unique pour un chunk (valable pour |cx|, |cz| < 32768).
export function chunkKey(cx, cz) {
  return (cx & 0xffff) * 65536 + (cz & 0xffff);
}

// Ordre des faces utilisé partout : +X, -X, +Y, -Y, +Z, -Z
export const FACE = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 };
export const FACE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
export const OPPOSITE_FACE = [1, 0, 3, 2, 5, 4];
