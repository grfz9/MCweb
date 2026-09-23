// Inventaire : piles d'objets { id, count, dmg } et opérations de base.
import { maxStack, getItem } from './items.js';

export function stack(id, count = 1, dmg = 0) {
  return { id, count, dmg };
}

export function sameItem(a, b) {
  return !!a && !!b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0);
}

export function cloneStack(s) {
  return s ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null;
}

export class Inventory {
  constructor(size = 36) {
    this.slots = new Array(size).fill(null); // 0-8 : barre rapide, 9-35 : sac
    this.selected = 0;
  }

  get held() {
    return this.slots[this.selected];
  }

  // Ajoute une pile ; renvoie le nombre d'objets qui n'ont pas pu entrer.
  add(s) {
    let left = s.count;
    const max = maxStack(s.id);
    const order = [];
    for (let i = 0; i < this.slots.length; i++) order.push(i);
    // D'abord compléter les piles existantes, puis les cases vides (barre rapide en premier).
    for (const i of order) {
      const cur = this.slots[i];
      if (left <= 0) break;
      if (cur && sameItem(cur, s) && cur.count < max) {
        const n = Math.min(max - cur.count, left);
        cur.count += n;
        left -= n;
      }
    }
    for (const i of order) {
      if (left <= 0) break;
      if (!this.slots[i]) {
        const n = Math.min(max, left);
        this.slots[i] = { id: s.id, count: n, dmg: s.dmg || 0 };
        left -= n;
      }
    }
    return left;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  // Retire un objet de la case sélectionnée.
  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  // Use l'outil tenu ; renvoie true s'il se casse.
  damageHeld(amount = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    const it = getItem(s.id);
    if (!it || !it.durability) return false;
    s.dmg = (s.dmg || 0) + amount;
    if (s.dmg >= it.durability) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  clear() {
    this.slots.fill(null);
  }

  toJSON() {
    return { slots: this.slots.map(cloneStack), selected: this.selected };
  }

  load(data) {
    if (!data) return;
    this.slots = new Array(this.slots.length).fill(null);
    (data.slots || []).forEach((s, i) => {
      if (s && getItem(s.id) && i < this.slots.length) this.slots[i] = cloneStack(s);
    });
    this.selected = data.selected || 0;
  }
}
