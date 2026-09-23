// Écrans d'inventaire : sac, table d'artisanat, four, coffre et palette créative.
import { itemIcon } from './icons.js';
import { getItem, itemName, maxStack, creativeItems } from '../items.js';
import { findRecipe, smeltResult } from '../crafting.js';
import { sameItem, cloneStack } from '../inventory.js';

const LONG_PRESS = 420;

export class ContainerUI {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.panel = document.getElementById('container-panel');
    this.cursorEl = document.getElementById('cursor-stack');
    this.tooltip = document.getElementById('tooltip');
    this.cursor = null;
    this.entries = [];
    this.kind = null;
    this.craft = null;
    this.mx = 0;
    this.my = 0;
    this.hover = null;
    window.addEventListener('pointermove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.positionFloating();
    });
  }

  get inv() { return this.game.player.inventory; }

  // ------------------------------------------------------------------ ouverture
  open(kind, data = null) {
    this.kind = kind;
    this.data = data;
    this.cursor = null;
    this.entries = [];
    this.craft = null;
    this.panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'creative-top';
    const title = document.createElement('h3');
    title.style.flex = '1';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn small';
    close.textContent = 'Fermer';
    close.addEventListener('click', () => this.game.closeScreen());
    head.append(title, close);
    this.panel.append(head);

    if (kind === 'inventory' || kind === 'crafting') {
      const size = kind === 'crafting' ? 3 : 2;
      title.textContent = kind === 'crafting' ? 'Table d’artisanat' : 'Artisanat';
      this.craft = { grid: new Array(size * size).fill(null), w: size, h: size, result: null };
      const row = document.createElement('div');
      row.className = 'craft-row';
      const defs = [];
      for (let i = 0; i < size * size; i++) defs.push(this.craftDef(i));
      row.append(this.grid(size, defs));
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      row.append(arrow);
      row.append(this.grid(1, [{ type: 'output', get: () => this.craft.result }], 'output'));
      this.panel.append(row);
    } else if (kind === 'chest') {
      title.textContent = 'Coffre';
      const be = data.be;
      const defs = [];
      for (let i = 0; i < 27; i++) {
        defs.push({ group: 'container', get: () => be.slots[i], set: (s) => { be.slots[i] = s; this.touchChunk(); } });
      }
      this.containerDefs = defs;
      this.panel.append(this.grid(9, defs));
    } else if (kind === 'furnace') {
      title.textContent = 'Four';
      const be = data.be;
      const mk = (key, accept) => ({
        group: 'furnace', key, accept,
        get: () => be[key], set: (s) => { be[key] = s; this.touchChunk(); },
      });
      this.fIn = mk('input', null);
      this.fFuel = mk('fuel', (s) => (getItem(s.id)?.fuel || 0) > 0);
      this.fOut = { ...mk('output', () => false), type: 'take' };
      const row = document.createElement('div');
      row.className = 'craft-row';
      const col = document.createElement('div');
      col.className = 'furnace-col';
      col.append(this.grid(1, [this.fIn]));
      this.flameEl = document.createElement('div');
      this.flameEl.className = 'flame';
      this.flameEl.innerHTML = '<i></i>';
      col.append(this.flameEl);
      col.append(this.grid(1, [this.fFuel]));
      row.append(col);
      this.arrowEl = document.createElement('div');
      this.arrowEl.className = 'arrow';
      this.arrowEl.innerHTML = '<i></i>';
      row.append(this.arrowEl);
      row.append(this.grid(1, [this.fOut], 'output'));
      this.panel.append(row);
    } else if (kind === 'creative') {
      title.textContent = 'Inventaire créatif';
      const search = document.createElement('input');
      search.type = 'search';
      search.id = 'creative-search';
      search.placeholder = 'Rechercher un objet…';
      search.setAttribute('aria-label', 'Rechercher un objet');
      const paletteWrap = document.createElement('div');
      paletteWrap.className = 'palette';
      const renderPalette = () => {
        const q = search.value.trim().toLowerCase();
        const ids = creativeItems().filter((id) => {
          if (!q) return true;
          const it = getItem(id);
          return it.name.toLowerCase().includes(q) || it.key.includes(q);
        });
        paletteWrap.innerHTML = '';
        this.entries = this.entries.filter((e) => e.def.type !== 'palette');
        paletteWrap.append(this.grid(9, ids.map((id) => ({ type: 'palette', id }))));
        this.render();
      };
      search.addEventListener('input', renderPalette);
      const top = document.createElement('div');
      top.className = 'creative-top';
      top.append(search);
      this.panel.append(top, paletteWrap);
      renderPalette();
    }

    // Inventaire du joueur
    const sep = document.createElement('div');
    sep.className = 'panel-sep';
    this.panel.append(sep);
    this.playerDefs = [];
    if (kind !== 'creative') {
      const label = document.createElement('h3');
      label.textContent = 'Inventaire';
      this.panel.append(label);
      const main = [];
      for (let i = 9; i < 36; i++) main.push(this.invDef(i));
      this.panel.append(this.grid(9, main));
      this.playerDefs.push(...main);
      const gap = document.createElement('div');
      gap.style.height = '6px';
      this.panel.append(gap);
    }
    const hot = [];
    for (let i = 0; i < 9; i++) hot.push(this.invDef(i));
    this.hotDefs = hot;
    this.playerDefs.push(...hot);
    if (kind === 'creative') {
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.append(this.grid(9, hot), this.grid(1, [{ type: 'trash' }]));
      this.panel.append(row);
    } else this.panel.append(this.grid(9, hot));

    this.render();
  }

  invDef(i) {
    return { group: i < 9 ? 'hotbar' : 'main', index: i, get: () => this.inv.slots[i], set: (s) => { this.inv.slots[i] = s; } };
  }

  craftDef(i) {
    return { group: 'craft', get: () => this.craft.grid[i], set: (s) => { this.craft.grid[i] = s; this.updateCraft(); } };
  }

  touchChunk() {
    const d = this.data;
    if (!d) return;
    const c = this.game.world.getChunk(d.x >> 4, d.z >> 4);
    if (c) c.modified = true;
  }

  grid(cols, defs, extraClass = '') {
    const g = document.createElement('div');
    g.className = 'grid';
    g.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    for (const def of defs) {
      const el = document.createElement('div');
      el.className = 'slot' + (extraClass ? ' ' + extraClass : '') + (def.type === 'trash' ? ' trash' : '');
      el.innerHTML = '<img alt=""><span class="count"></span>';
      const entry = { el, def, sig: null };
      this.entries.push(entry);
      this.bindSlot(el, def);
      g.append(el);
    }
    return g;
  }

  bindSlot(el, def) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'mouse') {
        this.click(def, e.button === 2 ? 'right' : 'left', e.shiftKey);
        return;
      }
      let handled = false;
      const timer = setTimeout(() => { handled = true; this.click(def, 'right', false); }, LONG_PRESS);
      const up = () => {
        clearTimeout(timer);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (!handled) this.click(def, 'left', false);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('pointerenter', () => { this.hover = def; this.showTooltip(); });
    el.addEventListener('pointerleave', () => { if (this.hover === def) { this.hover = null; this.showTooltip(); } });
  }

  // ------------------------------------------------------------------ logique des clics
  click(def, button, shift) {
    const game = this.game;
    if (def.type === 'trash') { this.cursor = null; this.render(); return; }
    if (def.type === 'palette') {
      if (this.cursor) this.cursor = null;
      else {
        const n = button === 'right' ? 1 : maxStack(def.id);
        if (shift) this.inv.add({ id: def.id, count: maxStack(def.id), dmg: 0 });
        else this.cursor = { id: def.id, count: n, dmg: 0 };
      }
      this.render();
      return;
    }
    if (def.type === 'output') { this.takeCraft(shift); this.render(); return; }
    if (def.type === 'take') {
      const s = def.get();
      if (!s) return;
      if (shift) {
        const left = this.insertInto(this.playerDefs, s);
        def.set(left ? { ...s, count: left } : null);
      } else if (!this.cursor) { this.cursor = s; def.set(null); }
      else if (sameItem(this.cursor, s) && this.cursor.count + s.count <= maxStack(s.id)) { this.cursor.count += s.count; def.set(null); }
      this.render();
      return;
    }
    if (shift) { this.quickMove(def); this.render(); return; }

    const s = def.get();
    const cur = this.cursor;
    const accept = (st) => !def.accept || def.accept(st);
    if (button === 'left') {
      if (!cur) { if (s) { this.cursor = s; def.set(null); } }
      else if (!s) { if (accept(cur)) { def.set(cur); this.cursor = null; } }
      else if (sameItem(s, cur)) {
        const n = Math.min(maxStack(s.id) - s.count, cur.count);
        s.count += n;
        cur.count -= n;
        def.set(s);
        if (cur.count <= 0) this.cursor = null;
      } else if (accept(cur)) { def.set(cur); this.cursor = s; }
    } else {
      if (!cur) {
        if (s) {
          const half = Math.ceil(s.count / 2);
          this.cursor = { ...s, count: half };
          s.count -= half;
          def.set(s.count > 0 ? s : null);
        }
      } else if (!s) {
        if (accept(cur)) {
          def.set({ ...cur, count: 1 });
          cur.count--;
          if (cur.count <= 0) this.cursor = null;
        }
      } else if (sameItem(s, cur) && s.count < maxStack(s.id)) {
        s.count++;
        cur.count--;
        def.set(s);
        if (cur.count <= 0) this.cursor = null;
      } else if (accept(cur)) { def.set(cur); this.cursor = s; }
    }
    game.playSound('click', 0.15);
    this.render();
  }

  // Touche 1-9 au-dessus d'une case : échange avec la barre rapide.
  hotkey(i) {
    const def = this.hover;
    if (!def || !def.get || def.type) return;
    const a = def.get();
    const b = this.inv.slots[i];
    if (def.accept && b && !def.accept(b)) return;
    def.set(b || null);
    this.inv.slots[i] = a || null;
    this.render();
  }

  insertInto(defs, stack) {
    let left = stack.count;
    const max = maxStack(stack.id);
    for (const d of defs) {
      if (left <= 0) break;
      const s = d.get();
      if (s && sameItem(s, stack) && s.count < max && (!d.accept || d.accept(stack))) {
        const n = Math.min(max - s.count, left);
        s.count += n;
        left -= n;
        d.set(s);
      }
    }
    for (const d of defs) {
      if (left <= 0) break;
      if (!d.get() && (!d.accept || d.accept(stack))) {
        const n = Math.min(max, left);
        d.set({ id: stack.id, count: n, dmg: stack.dmg || 0 });
        left -= n;
      }
    }
    return left;
  }

  quickMove(def) {
    const s = def.get();
    if (!s) return;
    let targets;
    if (def.group === 'container' || def.group === 'craft' || def.group === 'furnace') {
      targets = [...this.hotDefs, ...this.playerDefs.filter((d) => d.group === 'main')];
    } else if (this.kind === 'chest') {
      targets = this.containerDefs;
    } else if (this.kind === 'furnace' && smeltResult(s.id) !== null && !(getItem(s.id)?.fuel && this.fIn.get() && !sameItem(this.fIn.get(), s))) {
      targets = [this.fIn];
    } else if (this.kind === 'furnace' && (getItem(s.id)?.fuel || 0) > 0) {
      targets = [this.fFuel];
    } else if (def.group === 'hotbar') {
      targets = this.playerDefs.filter((d) => d.group === 'main');
    } else {
      targets = this.hotDefs;
    }
    if (!targets || !targets.length) return;
    const left = this.insertInto(targets, s);
    def.set(left > 0 ? { ...s, count: left } : null);
  }

  updateCraft() {
    const c = this.craft;
    if (!c) return;
    const ids = c.grid.map((s) => (s ? s.id : null));
    const r = findRecipe(ids, c.w, c.h);
    c.result = r ? { id: r.id, count: r.count, dmg: 0 } : null;
  }

  consumeCraft() {
    const c = this.craft;
    for (let i = 0; i < c.grid.length; i++) {
      const s = c.grid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) c.grid[i] = null;
    }
    this.updateCraft();
  }

  canFit(stack) {
    let free = 0;
    const max = maxStack(stack.id);
    for (const s of this.inv.slots) {
      if (!s) free += max;
      else if (sameItem(s, stack)) free += max - s.count;
    }
    return free >= stack.count;
  }

  takeCraft(shift) {
    const c = this.craft;
    if (!c || !c.result) return;
    if (shift) {
      let guard = 0;
      while (c.result && guard++ < 64) {
        const r = c.result;
        if (!this.canFit(r)) break;
        this.inv.add(r);
        this.consumeCraft();
      }
    } else {
      const r = c.result;
      if (!this.cursor) this.cursor = cloneStack(r);
      else if (sameItem(this.cursor, r) && this.cursor.count + r.count <= maxStack(r.id)) this.cursor.count += r.count;
      else return;
      this.consumeCraft();
    }
    this.game.playSound('place_wood', 0.3);
  }

  clickOutside() {
    if (!this.cursor) return;
    if (!this.game.isCreative()) {
      const p = this.game.player;
      const e = this.game.dropItem(p.x, p.eyeY - 0.3, p.z, this.cursor, 1.5);
      if (e) {
        const d = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
        e.vx = d[0] * 4; e.vz = d[1] * 4;
      }
    }
    this.cursor = null;
    this.render();
  }

  close() {
    const giveBack = (s) => {
      if (!s) return;
      const left = this.inv.add(s);
      if (left > 0) {
        const p = this.game.player;
        this.game.dropItem(p.x, p.y + 1, p.z, { ...s, count: left }, 1);
      }
    };
    if (this.craft) for (const s of this.craft.grid) giveBack(s);
    giveBack(this.cursor);
    this.cursor = null;
    this.craft = null;
    this.kind = null;
    this.entries = [];
    this.hover = null;
    this.panel.innerHTML = '';
    this.cursorEl.innerHTML = '';
    this.tooltip.style.display = 'none';
  }

  // ------------------------------------------------------------------ affichage
  render() {
    for (const e of this.entries) {
      const d = e.def;
      let s = null;
      if (d.type === 'palette') s = { id: d.id, count: 1 };
      else if (d.get) s = d.get();
      const sig = s ? `${s.id}|${s.count}|${s.dmg || 0}` : '';
      if (sig !== e.sig) { e.sig = sig; this.ui.setSlot(e.el, s); }
    }
    const c = this.cursor;
    const sig = c ? `${c.id}|${c.count}` : '';
    if (this.cursorSig !== sig) {
      this.cursorSig = sig;
      this.cursorEl.innerHTML = c ? `<img alt="" src="${itemIcon(c.id)}"><span class="count">${c.count > 1 ? c.count : ''}</span>` : '';
    }
    this.showTooltip();
    this.positionFloating();
  }

  update() {
    // Rafraîchit les cases (le four avance tout seul) et les jauges.
    if (this.kind === 'furnace' && this.data) {
      const be = this.data.be;
      if (this.arrowEl) this.arrowEl.firstChild.style.width = `${(be.cook / 200) * 100}%`;
      if (this.flameEl) this.flameEl.firstChild.style.height = `${be.burnMax ? (be.burn / be.burnMax) * 100 : 0}%`;
    }
    this.render();
  }

  showTooltip() {
    const d = this.hover;
    let s = null;
    if (d && !this.cursor) s = d.type === 'palette' ? { id: d.id, count: 1 } : d.get ? d.get() : null;
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const it = getItem(s.id);
    this.tooltip.textContent = itemName(s.id);
    if (it && it.durability) {
      const small = document.createElement('small');
      small.textContent = `Durabilité : ${it.durability - (s.dmg || 0)} / ${it.durability}`;
      this.tooltip.append(small);
    } else if (it && it.food) {
      const small = document.createElement('small');
      small.textContent = `Nourriture : +${it.food}`;
      this.tooltip.append(small);
    }
    this.tooltip.style.display = 'block';
    this.positionFloating();
  }

  positionFloating() {
    this.cursorEl.style.left = this.mx + 'px';
    this.cursorEl.style.top = this.my + 'px';
    if (this.tooltip.style.display === 'block') {
      const w = this.tooltip.offsetWidth;
      const x = this.mx + 16 + w > window.innerWidth ? this.mx - w - 12 : this.mx + 16;
      this.tooltip.style.left = Math.max(4, x) + 'px';
      this.tooltip.style.top = Math.max(4, this.my - 30) + 'px';
    }
  }
}
