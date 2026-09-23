// Gestion des écrans (menus), du HUD, de la discussion et des options.
import { itemIcon, getHudIcons, menuBackground, textureURL } from './icons.js';
import { getItem, itemName } from '../items.js';
import { ContainerUI } from './containers.js';
import { saveSettings } from '../storage.js';

const SPLASHES = [
  'Aussi en français !', '100 % procédural !', 'Sans aucune image !', 'Ne creusez jamais tout droit vers le bas !',
  'Maintenant avec des creepers !', 'WebGL2 !', 'Fait avec des cubes !', 'Attention à la lave !', 'Le charbon, c’est la vie !',
  'Des torches, vite !', 'Ssssss…', 'Cuit à point !', 'Infini (ou presque) !', 'Sauvegarde automatique !',
];

const OPTIONS = [
  { key: 'renderDistance', label: 'Distance d’affichage', min: 2, max: 16, step: 1, fmt: (v) => `${v} chunks` },
  { key: 'fov', label: 'Champ de vision', min: 50, max: 110, step: 1, fmt: (v) => `${v}°` },
  { key: 'sensitivity', label: 'Sensibilité de la souris', min: 10, max: 300, step: 5, fmt: (v) => `${v} %` },
  { key: 'brightness', label: 'Luminosité', min: 0, max: 100, step: 5, fmt: (v) => (v === 0 ? 'Sombre' : v === 100 ? 'Lumineux' : `${v} %`) },
  { key: 'volume', label: 'Volume', min: 0, max: 100, step: 5, fmt: (v) => (v === 0 ? 'Muet' : `${v} %`) },
  { key: 'resolution', label: 'Résolution du rendu', min: 40, max: 100, step: 10, fmt: (v) => `${v} %` },
  { key: 'music', label: 'Musique', toggle: true },
  { key: 'clouds', label: 'Nuages', toggle: true },
  { key: 'viewBobbing', label: 'Balancement de la vue', toggle: true },
  { key: 'invertY', label: 'Inverser la souris', toggle: true },
  { key: 'autoJump', label: 'Saut automatique', toggle: true },
  { key: 'showFps', label: 'Afficher les images/s', toggle: true },
];

const SCREENS = ['screen-title', 'screen-worlds', 'screen-create', 'screen-options', 'screen-help', 'screen-pause',
  'screen-death', 'screen-loading', 'screen-click', 'screen-container', 'screen-chat', 'screen-error'];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.intentionalUnlock = false;
    this.hudVisible = true;
    this.chatLines = [];
    this.chatHistory = [];
    this.historyIndex = -1;
    this.optionsReturn = 'title';
    this.helpReturn = 'title';
    this.lastSelected = -1;
    this.lastHeldId = undefined;
    this.itemNameTimer = 0;
    this.debugTimer = 0;
    this.sig = {};
    this.containers = new ContainerUI(this, game);

    document.documentElement.style.setProperty('--dirt-bg', `url(${menuBackground()})`);
    document.documentElement.style.setProperty('--stone-bg', `url(${textureURL('cobblestone', 48)})`);

    this.buildHud();
    this.buildOptions();

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) this.onAction(btn.dataset.action, btn);
    });
    $('create-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.querySelector('input[name="mode"]:checked').value;
      this.game.audio.unlock();
      this.game.newWorld($('world-name').value, $('world-seed').value, mode);
    });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('chat-input').value;
      if (v.trim()) { this.chatHistory.push(v); this.game.runCommand(v); }
      this.historyIndex = -1;
      this.game.closeChat();
    });
    $('screen-container').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'screen-container') this.containers.clickOutside();
    });
    game.input.onKey = (code, e) => this.onKey(code, e);
  }

  // ------------------------------------------------------------------ écrans
  show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
  }

  showTitle() {
    this.show('screen-title');
    $('hud').hidden = true;
    $('touch-controls').hidden = true;
    $('splash').textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    $('overlay-fluid').className = '';
    this.clearChat();
  }

  async showWorlds() {
    this.show('screen-worlds');
    const list = $('world-list');
    list.innerHTML = '';
    let worlds = [];
    try { worlds = await this.game.storage.listWorlds(); } catch (e) { console.error(e); }
    if (!this.game.storage.persistent) {
      const warn = document.createElement('p');
      warn.className = 'world-empty';
      warn.textContent = 'La sauvegarde n’est pas disponible dans ce navigateur : les mondes seront perdus en fermant la page.';
      list.append(warn);
    }
    if (!worlds.length) {
      const p = document.createElement('p');
      p.className = 'world-empty';
      p.textContent = 'Aucun monde pour l’instant. Créez-en un pour commencer !';
      list.append(p);
      return;
    }
    for (const w of worlds) list.append(this.worldCard(w));
  }

  worldCard(w) {
    const el = document.createElement('div');
    el.className = 'world';
    const name = document.createElement('div');
    name.className = 'world-name';
    name.textContent = w.name;
    const meta = document.createElement('div');
    meta.className = 'world-meta';
    const date = new Date(w.lastPlayed).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    meta.textContent = `${w.gamemode === 'creative' ? 'Créatif' : 'Survie'} · joué le ${date} · graine ${w.seedText || w.seed}`;
    const actions = document.createElement('div');
    actions.className = 'world-actions';
    const play = document.createElement('button');
    play.className = 'btn small';
    play.type = 'button';
    play.textContent = 'Jouer';
    play.addEventListener('click', () => { this.game.audio.unlock(); this.game.playWorld(w); });
    const del = document.createElement('button');
    del.className = 'btn small danger';
    del.type = 'button';
    del.textContent = 'Supprimer';
    del.addEventListener('click', () => {
      actions.innerHTML = '';
      const yes = document.createElement('button');
      yes.className = 'btn small danger';
      yes.type = 'button';
      yes.textContent = 'Confirmer';
      yes.addEventListener('click', async () => { await this.game.storage.deleteWorld(w.id); this.showWorlds(); });
      const no = document.createElement('button');
      no.className = 'btn small';
      no.type = 'button';
      no.textContent = 'Annuler';
      no.addEventListener('click', () => this.showWorlds());
      actions.append(yes, no);
    });
    actions.append(play, del);
    el.append(name, actions, meta);
    return el;
  }

  showCreate() {
    this.show('screen-create');
    $('world-name').value = 'Mon monde';
    $('world-seed').value = '';
    setTimeout(() => $('world-name').focus(), 0);
  }

  showOptions() {
    this.show('screen-options');
  }

  showHelp() {
    this.show('screen-help');
  }

  showPause() {
    this.show('screen-pause');
  }

  showDeath(msg) {
    $('death-message').textContent = msg;
    this.show('screen-death');
  }

  showLoading(text, p) {
    if ($('screen-loading').hidden) this.show('screen-loading');
    $('loading-text').textContent = text;
    $('loading-bar').style.width = `${Math.round(p * 100)}%`;
  }

  hideLoading() {
    $('screen-loading').hidden = true;
  }

  showGame() {
    this.show(null);
    $('hud').hidden = !this.hudVisible;
    $('touch-controls').hidden = !this.game.touch;
    this.sig = {};
  }

  showClickToPlay() {
    this.show('screen-click');
  }

  hideOverlays() {
    for (const s of ['screen-pause', 'screen-click', 'screen-death', 'screen-options', 'screen-help']) $(s).hidden = true;
  }

  showError(e) {
    if (!$('screen-error').hidden) return;
    $('error-text').textContent = String(e && e.message ? e.message : e);
    this.show('screen-error');
  }

  toggleHud() {
    this.hudVisible = !this.hudVisible;
    $('hud').hidden = !this.hudVisible;
  }

  openContainer(kind, data) {
    this.containers.open(kind, data);
    $('screen-container').hidden = false;
  }

  closeContainer() {
    this.containers.close();
    $('screen-container').hidden = true;
  }

  openChat(prefix) {
    $('screen-chat').hidden = false;
    $('chat-log').classList.add('open');
    const input = $('chat-input');
    input.value = prefix;
    setTimeout(() => { input.focus(); input.setSelectionRange(prefix.length, prefix.length); }, 0);
  }

  closeChat() {
    $('screen-chat').hidden = true;
    $('chat-log').classList.remove('open');
    $('chat-input').blur();
  }

  onAction(action) {
    const game = this.game;
    game.audio.unlock();
    game.playSound('click', 0.4);
    switch (action) {
      case 'worlds': this.showWorlds(); break;
      case 'create': this.showCreate(); break;
      case 'title': this.showTitle(); break;
      case 'options':
        this.optionsReturn = game.state === 'paused' ? 'pause' : 'title';
        this.showOptions();
        break;
      case 'options-done':
        if (this.optionsReturn === 'pause') this.showPause(); else this.showTitle();
        break;
      case 'help':
        this.helpReturn = game.state === 'paused' ? 'pause' : 'title';
        this.showHelp();
        break;
      case 'help-done':
        if (this.helpReturn === 'pause') this.showPause(); else this.showTitle();
        break;
      case 'resume': game.resume(); break;
      case 'quit': game.quitToTitle(); break;
      case 'respawn': game.respawn(); break;
      case 'lock':
        $('screen-click').hidden = true;
        game.input.requestLock();
        break;
    }
  }

  onKey(code, e) {
    const game = this.game;
    const st = game.state;
    if (st === 'chat') {
      if (code === 'Escape') { game.closeChat(); e.preventDefault(); }
      else if (code === 'ArrowUp' || code === 'ArrowDown') {
        const h = this.chatHistory;
        if (!h.length) return true;
        if (this.historyIndex < 0) this.historyIndex = h.length;
        this.historyIndex = Math.max(0, Math.min(h.length, this.historyIndex + (code === 'ArrowUp' ? -1 : 1)));
        $('chat-input').value = h[this.historyIndex] || '';
        e.preventDefault();
      }
      return true;
    }
    if (st === 'inventory') {
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (code === 'Escape' || (code === 'KeyE' && !typing)) { game.closeScreen(); e.preventDefault(); return true; }
      if (!typing && code.startsWith('Digit')) { this.containers.hotkey(parseInt(code.slice(5), 10) - 1); return true; }
      return true;
    }
    if (st === 'paused' && code === 'Escape') {
      if (!$('screen-options').hidden || !$('screen-help').hidden) this.showPause();
      else game.resume();
      return true;
    }
    if (st === 'playing' && code === 'Escape') {
      if (!$('screen-click').hidden || game.touch || game.input.lockFailed) { game.pause(); return true; }
    }
    if (st === 'title' && code === 'Escape') {
      if ($('screen-title').hidden && $('screen-create').hidden) { this.showTitle(); return true; }
      if (!$('screen-create').hidden) { this.showWorlds(); return true; }
    }
    return false;
  }

  // ------------------------------------------------------------------ options
  buildOptions() {
    const root = $('options-list');
    const s = this.game.settings;
    for (const o of OPTIONS) {
      const wrap = document.createElement(o.toggle ? 'label' : 'div');
      wrap.className = 'opt' + (o.toggle ? ' toggle' : '');
      const id = 'opt-' + o.key;
      if (o.toggle) {
        wrap.htmlFor = id;
        const span = document.createElement('span');
        span.textContent = o.label;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = !!s[o.key];
        input.addEventListener('change', () => this.setOption(o.key, input.checked));
        wrap.append(span, input);
      } else {
        const label = document.createElement('label');
        label.htmlFor = id;
        const name = document.createElement('span');
        name.textContent = o.label;
        const out = document.createElement('output');
        out.textContent = o.fmt(s[o.key]);
        label.append(name, out);
        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.min = o.min; input.max = o.max; input.step = o.step;
        input.value = s[o.key];
        input.addEventListener('input', () => {
          const v = Number(input.value);
          out.textContent = o.fmt(v);
          this.setOption(o.key, v);
        });
        wrap.append(label, input);
      }
      root.append(wrap);
    }
  }

  setOption(key, value) {
    const s = this.game.settings;
    s[key] = value;
    saveSettings(s);
    this.game.applySettings();
    if (key === 'showFps') $('fps').hidden = !value;
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    const hotbar = $('hotbar');
    this.hotSlots = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'hslot';
      el.innerHTML = '<img alt=""><span class="count"></span>';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.game.player.inventory.selected = i;
      });
      hotbar.append(el);
      this.hotSlots.push(el);
    }
    const icons = getHudIcons();
    const row = (id) => {
      const imgs = [];
      for (let i = 0; i < 10; i++) {
        const img = document.createElement('img');
        img.alt = '';
        $(id).append(img);
        imgs.push(img);
      }
      return imgs;
    };
    this.heartImgs = row('hearts');
    this.foodImgs = row('hunger');
    this.airImgs = row('air');
    this.icons = icons;
    $('fps').hidden = !this.game.settings.showFps;
  }

  setSlot(el, s) {
    const img = el.querySelector('img');
    const count = el.querySelector('.count');
    let dur = el.querySelector('.dur');
    if (!s) {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
      count.textContent = '';
      if (dur) dur.remove();
      return;
    }
    img.src = itemIcon(s.id);
    img.style.visibility = 'visible';
    count.textContent = s.count > 1 ? s.count : '';
    const it = getItem(s.id);
    if (it && it.durability && s.dmg > 0) {
      if (!dur) {
        dur = document.createElement('div');
        dur.className = 'dur';
        dur.innerHTML = '<i></i>';
        el.append(dur);
      }
      const f = Math.max(0, 1 - s.dmg / it.durability);
      const bar = dur.firstChild;
      bar.style.width = `${f * 100}%`;
      bar.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
    } else if (dur) dur.remove();
  }

  update(dt) {
    const game = this.game;
    if (!$('screen-container').hidden) this.containers.update();
    if (game.state === 'title' || game.state === 'loading' || !game.world) return;
    const p = game.player;
    const inv = p.inventory;

    // Barre d'objets
    for (let i = 0; i < 9; i++) {
      const s = inv.slots[i];
      const sig = s ? `${s.id}|${s.count}|${s.dmg}` : '';
      if (this.sig['h' + i] !== sig) { this.sig['h' + i] = sig; this.setSlot(this.hotSlots[i], s); }
    }
    if (this.lastSelected !== inv.selected) {
      this.hotSlots.forEach((el, i) => el.classList.toggle('sel', i === inv.selected));
      this.lastSelected = inv.selected;
    }
    const held = inv.held;
    const heldId = held ? held.id : null;
    if (heldId !== this.lastHeldId) {
      this.lastHeldId = heldId;
      $('item-name').textContent = heldId !== null ? itemName(heldId) : '';
      $('item-name').style.opacity = 1;
      this.itemNameTimer = 2;
    }
    if (this.itemNameTimer > 0) {
      this.itemNameTimer -= dt;
      if (this.itemNameTimer <= 0) $('item-name').style.opacity = 0;
    }

    // Santé, faim, air
    const creative = game.isCreative();
    const sig = creative ? 'c' : `${Math.ceil(p.health)}|${p.food}|${Math.ceil(p.air / 30)}|${p.headInWater}`;
    if (this.sig.status !== sig) {
      this.sig.status = sig;
      $('status').style.opacity = creative ? 0 : 1;
      if (!creative) {
        const ic = this.icons;
        const h = Math.ceil(p.health);
        this.heartImgs.forEach((img, i) => { img.src = h >= (i + 1) * 2 ? ic.heart : h === i * 2 + 1 ? ic.heartHalf : ic.heartEmpty; });
        const f = p.food;
        this.foodImgs.forEach((img, i) => { img.src = f >= (i + 1) * 2 ? ic.food : f === i * 2 + 1 ? ic.foodHalf : ic.foodEmpty; });
        $('hearts').classList.toggle('low', h <= 4);
        const bubbles = Math.ceil(Math.max(0, p.air) / 30);
        const showAir = p.headInWater || p.air < 300;
        $('air').style.opacity = showAir ? 1 : 0;
        this.airImgs.forEach((img, i) => { img.src = ic.bubble; img.style.opacity = i < bubbles ? 1 : 0; });
      } else {
        $('air').style.opacity = 0;
      }
    }

    // Débogage et images/s
    this.debugTimer -= dt;
    if (this.debugTimer <= 0) {
      this.debugTimer = 0.25;
      const dbg = $('debug');
      dbg.hidden = !game.showDebug;
      if (game.showDebug) {
        dbg.innerHTML = '';
        for (const line of game.debugInfo()) {
          const span = document.createElement('span');
          span.textContent = line;
          dbg.append(span, document.createElement('br'));
        }
      }
      if (game.settings.showFps) $('fps').textContent = `${game.fps} i/s`;
    }

    // Discussion : estompe les vieux messages
    const now = performance.now();
    for (const l of this.chatLines) if (!l.faded && now - l.t > 10000) { l.faded = true; l.el.classList.add('faded'); }

    // Voile d'eau / de lave
    const fluid = game.cameraFluid || '';
    const ov = $('overlay-fluid');
    if (ov.className !== fluid) ov.className = fluid;
  }

  setSleep(v) {
    $('overlay-sleep').style.opacity = v;
  }

  flashHurt() {
    const el = $('overlay-hurt');
    el.classList.add('on');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => el.classList.remove('on'), 120);
  }

  addChat(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    $('chat-log').append(el);
    this.chatLines.push({ el, t: performance.now(), faded: false });
    while (this.chatLines.length > 12) this.chatLines.shift().el.remove();
  }

  clearChat() {
    for (const l of this.chatLines) l.el.remove();
    this.chatLines = [];
  }
}
