// Sauvegarde des mondes dans IndexedDB (repli en mémoire si indisponible) et réglages dans localStorage.

const DB_NAME = 'mcweb';
const DB_VERSION = 1;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

class MemoryStore {
  constructor() {
    this.worlds = new Map();
    this.chunks = new Map();
    this.persistent = false;
  }
  async listWorlds() { return [...this.worlds.values()].sort((a, b) => b.lastPlayed - a.lastPlayed); }
  async getWorld(id) { return this.worlds.get(id) || null; }
  async putWorld(meta) { this.worlds.set(meta.id, JSON.parse(JSON.stringify(meta))); }
  async deleteWorld(id) {
    this.worlds.delete(id);
    for (const k of [...this.chunks.keys()]) if (k.startsWith(id + ':')) this.chunks.delete(k);
  }
  async loadChunks(id) {
    const out = new Map();
    for (const [k, v] of this.chunks) if (k.startsWith(id + ':')) out.set(v.ck, v);
    return out;
  }
  async putChunks(id, list) {
    for (const c of list) this.chunks.set(id + ':' + c.key, { ...c, ck: c.key });
  }
}

class IDBStore {
  constructor(db) {
    this.db = db;
    this.persistent = true;
  }
  static open() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) {
          const s = db.createObjectStore('chunks', { keyPath: 'id' });
          s.createIndex('world', 'world');
        }
      };
      r.onsuccess = () => resolve(new IDBStore(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('IndexedDB bloquée'));
    });
  }
  tx(stores, mode = 'readonly') {
    return this.db.transaction(stores, mode);
  }
  async listWorlds() {
    const all = await req(this.tx('worlds').objectStore('worlds').getAll());
    return all.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }
  async getWorld(id) {
    return (await req(this.tx('worlds').objectStore('worlds').get(id))) || null;
  }
  async putWorld(meta) {
    const t = this.tx('worlds', 'readwrite');
    t.objectStore('worlds').put(meta);
    await txDone(t);
  }
  async deleteWorld(id) {
    const t = this.tx(['worlds', 'chunks'], 'readwrite');
    t.objectStore('worlds').delete(id);
    const idx = t.objectStore('chunks').index('world');
    const cur = idx.openKeyCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { t.objectStore('chunks').delete(c.primaryKey); c.continue(); }
    };
    await txDone(t);
  }
  async loadChunks(id) {
    const all = await req(this.tx('chunks').objectStore('chunks').index('world').getAll(IDBKeyRange.only(id)));
    const out = new Map();
    for (const c of all) out.set(c.ck, c);
    return out;
  }
  async putChunks(id, list) {
    if (!list.length) return;
    const t = this.tx('chunks', 'readwrite');
    const s = t.objectStore('chunks');
    for (const c of list) s.put({ id: id + ':' + c.key, world: id, ck: c.key, cx: c.cx, cz: c.cz, b: c.b, m: c.m, e: c.e });
    await txDone(t);
  }
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function openStorage() {
  try {
    if (!('indexedDB' in window)) throw new Error('pas d’IndexedDB');
    return await IDBStore.open();
  } catch (e) {
    console.warn('Sauvegarde en mémoire uniquement :', e);
    return new MemoryStore();
  }
}

// ------------------------------------------------------------------ réglages
export const DEFAULT_SETTINGS = {
  renderDistance: 6,
  fov: 75,
  sensitivity: 100,
  brightness: 50,
  volume: 70,
  music: true,
  invertY: false,
  viewBobbing: true,
  autoJump: false,
  resolution: 100,
  showFps: false,
  clouds: true,
};

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem('mcweb-settings');
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch { /* stockage indisponible */ }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem('mcweb-settings', JSON.stringify(s));
  } catch { /* stockage indisponible */ }
}
