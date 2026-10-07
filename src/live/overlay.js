// Habillage du LIVE (format vertical 9:16) : consignes, objectif, jauge de likes, fil des actions,
// barème des cadeaux, annonces et pseudos au-dessus des créatures offertes.
import { COMMAND_HELP, GIFT_TIERS, commandLabel } from './commands.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export class LiveOverlay {
  constructor(live) {
    this.live = live;
    const root = el('div', 'live');
    root.id = 'live';
    root.setAttribute('aria-live', 'polite');

    const top = el('header', 'live-top');
    top.append(
      el('div', 'live-badge', '<i></i>LIVE'),
      el('div', 'live-title', 'TikTok joue à <b>MCweb</b>'),
      (this.viewersEl = el('div', 'live-viewers', '👁 —')),
    );
    this.statusEl = el('div', 'live-status');
    this.statusEl.hidden = true;

    const help = el('section', 'live-help');
    const control = live.opts.control === 'streamer';
    help.append(el('p', 'live-help-title', control
      ? 'Le streamer joue — <b>vos cadeaux et vos likes</b> changent la partie !'
      : live.opts.vote ? 'Votez dans le chat ! Toutes les 3 s, la commande la plus écrite gagne :' : 'Écrivez une commande dans le chat pour jouer :'));
    if (!control) {
      const chips = el('div', 'live-chips');
      for (const [word, what] of COMMAND_HELP) chips.append(el('span', 'live-chip', `<b>${word}</b> ${what}`));
      help.append(chips);
    }

    this.goalEl = el('section', 'live-goal');
    this.likesEl = el('section', 'live-likes', '<div class="live-bar"><i></i></div><span></span>');

    const gifts = el('aside', 'live-gifts');
    gifts.append(el('h4', null, 'Cadeaux'));
    const ul = el('ul');
    for (const t of GIFT_TIERS) ul.append(el('li', null, `<span class="coin">${t.min}</span> ${t.icon} ${t.label}`));
    const more = el('ul', 'live-more');
    more.append(el('li', null, '➕ Abonnement → ton animal'), el('li', null, '📣 Partage → pain'), el('li', null, `❤️ ${live.likes.goal} likes → soin`));
    this.topEl = el('ol', 'live-topgifters');
    gifts.append(ul, more, el('h4', null, 'Top cadeaux'), this.topEl);

    this.feedEl = el('section', 'live-feed');
    this.nowEl = el('div', 'live-now');
    this.votesEl = el('div', 'live-votes');
    this.nowEl.hidden = this.votesEl.hidden = true;
    this.bannerEl = el('div', 'live-banner');
    this.tagsEl = el('div', 'live-tags');

    // Emplacement de hauteur fixe pour l'action en cours / le vote : le reste de l'écran ne bouge pas.
    const activity = el('div', 'live-activity' + (live.opts.vote ? ' vote' : ''));
    activity.append(this.nowEl, this.votesEl);
    const mid = el('div', 'live-mid');
    mid.append(this.feedEl, gifts);
    root.append(this.tagsEl, top, this.statusEl, help, this.goalEl, this.likesEl, activity, mid, this.bannerEl);
    document.getElementById('app').append(root);
    document.body.classList.add('live-mode');
    this.root = root;
    this.tags = new Map();
    this.feedLines = [];
    this.bannerQueue = [];
    this.bannerTimer = null;
    this.setLikes(live.likes);
    this.setGifters([]);
  }

  setStatus(state, message) {
    this.statusEl.className = 'live-status ' + state;
    this.statusEl.textContent = message;
    clearTimeout(this.statusTimer);
    this.statusEl.hidden = !message;
    // Une fois connecté, le message s'efface : l'écran reste lisible pour les spectateurs.
    if (state === 'live') this.statusTimer = setTimeout(() => { this.statusEl.hidden = true; }, 6000);
  }

  setViewers(n) {
    this.viewersEl.textContent = `👁 ${Number(n).toLocaleString('fr-FR')}`;
  }

  setGoal(g) {
    const sig = JSON.stringify(g);
    if (sig === this.goalSig) return;
    this.goalSig = sig;
    if (g.creative) { this.goalEl.hidden = true; return; }
    this.goalEl.hidden = false;
    const done = g.index >= g.total;
    this.goalEl.innerHTML = `<div class="live-goal-step">${done ? '🏆 Terminé' : `Objectif ${g.index + 1}/${g.total}`}</div>`
      + `<div class="live-goal-text">${escText(g.label)}</div><div class="live-goal-deaths">💀 ${g.deaths}</div>`;
  }

  setLikes(meter) {
    this.likesEl.querySelector('i').style.width = `${Math.round(meter.progress * 100)}%`;
    this.likesEl.querySelector('span').textContent = `❤️ ${meter.value}/${meter.goal} likes → soin ou bonus`;
  }

  setGifters(list) {
    this.topEl.innerHTML = '';
    if (!list.length) { this.topEl.append(el('li', 'empty', 'Premier cadeau = premier du classement')); return; }
    for (const g of list) this.topEl.append(el('li', null, `<b>${escText(g.name)}</b> <span class="coin">${g.coins}</span>`));
  }

  feed(html, kind = '') {
    const line = el('div', 'live-line ' + kind, html);
    this.feedEl.append(line);
    this.feedLines.push(line);
    while (this.feedLines.length > 7) this.feedLines.shift().remove();
    setTimeout(() => line.classList.add('old'), 25000);
  }

  feedText(text, kind = '') {
    this.feed(escText(text), kind);
  }

  setNow(cur, queued) {
    const html = cur
      ? `▶ <b>${escText(cur.user.name)}</b> ${escText(commandLabel(cur.cmd))}${queued ? ` <small>· ${queued} en attente</small>` : ''}`
      : '';
    if (html !== this.nowHTML) { this.nowHTML = html; this.nowEl.innerHTML = html; this.nowEl.hidden = !html; }
  }

  setVotes(ranking, timeLeft) {
    if (!ranking.length) { this.votesEl.hidden = true; return; }
    this.votesEl.hidden = false;
    const total = ranking.reduce((s, r) => s + r.n, 0);
    this.votesEl.innerHTML = `<div class="live-votes-time">Vote : ${Math.max(0, timeLeft).toFixed(1)} s</div>`
      + ranking.slice(0, 3).map((r) => `<div class="live-vote"><i style="width:${Math.round((r.n / total) * 100)}%"></i><span>${escText(commandLabel(r.cmd))}</span><b>${r.n}</b></div>`).join('');
  }

  // Annonces centrales, une à la fois.
  banner(title, sub = '', kind = '') {
    this.bannerQueue.push({ title, sub, kind });
    if (this.bannerQueue.length > 4) this.bannerQueue.splice(1, 1);
    if (!this.bannerTimer) this.nextBanner();
  }

  nextBanner() {
    const b = this.bannerQueue.shift();
    if (!b) { this.bannerTimer = null; this.bannerEl.classList.remove('show'); return; }
    this.bannerEl.className = 'live-banner ' + b.kind;
    this.bannerEl.innerHTML = `<div class="t">${escText(b.title)}</div>${b.sub ? `<div class="s">${escText(b.sub)}</div>` : ''}`;
    void this.bannerEl.offsetWidth; // relance l'animation
    this.bannerEl.classList.add('show');
    this.bannerTimer = setTimeout(() => this.nextBanner(), 2600);
  }

  // Pseudos au-dessus des créatures offertes (projection 3D → écran), appelé à chaque image.
  drawTags() {
    const game = this.live.game;
    const r = game.renderer;
    const cam = r.cam;
    const seen = new Set();
    if (cam && game.world && game.state !== 'title') {
      const m = r.viewProj;
      const W = r.canvas.clientWidth, H = r.canvas.clientHeight;
      for (const e of game.entities) {
        if (!e.name || e.dead) continue;
        const x = e.x - cam.x, y = e.y + (e.h || 1) + 0.45 - cam.y, z = e.z - cam.z;
        const dist = Math.hypot(x, y, z);
        if (dist > 40) continue;
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (w < 0.2) continue;
        const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * W;
        const sy = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * H;
        if (sx < -200 || sx > W + 200 || sy < -50 || sy > H + 50) continue;
        let tag = this.tags.get(e);
        if (!tag) {
          tag = el('div', 'live-tag ' + (e.hostile ? 'hostile' : 'friendly'));
          tag.textContent = e.name;
          this.tagsEl.append(tag);
          this.tags.set(e, tag);
        }
        tag.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${Math.max(0.55, Math.min(1, 9 / dist)).toFixed(2)})`;
        tag.style.opacity = e.deathTime > 0 ? 0.3 : dist > 28 ? 0.6 : 1;
        seen.add(e);
      }
    }
    for (const [e, tag] of this.tags) if (!seen.has(e)) { tag.remove(); this.tags.delete(e); }
  }
}
