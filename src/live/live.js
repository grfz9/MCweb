// Mode LIVE TikTok : les spectateurs jouent ensemble. Les commentaires pilotent le joueur
// (« avance », « mine », « fabrique pioche »…), les cadeaux font apparaître des créatures à leur nom,
// de la TNT ou des kits, et les likes remplissent une jauge de soin.
import { parseCommand, commandLabel, VoteBox, giftTier, giftRepeats, LikeMeter } from './commands.js';
import { craftByName, smeltInventory, nameMatches, removeItems } from './autocraft.js';
import { startDemoFeed } from './demo.js';
import { LiveOverlay } from './overlay.js';
import { Mob, PrimedTnt, PASSIVE_MOBS } from '../entity/entities.js';
import { B, blocks, SOLID, REPLACEABLE, IS_LIQUID } from '../blocks.js';
import { I, getItem, itemName, toolId } from '../items.js';
import { clamp } from '../math.js';

const DEG = Math.PI / 180;
const QUEUE_MAX = 8;
const VOTE_WINDOW = 3; // secondes
const USER_COOLDOWN = 1.2;
const GIFTED_MAX = 30;
const LOGS = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG];

// Fil rouge du LIVE : de la première bûche au diamant.
export const GOALS = [
  { label: 'Couper 4 bûches', done: (n) => LOGS.reduce((s, id) => s + n(id), 0) >= 4 },
  { label: 'Fabriquer une table d’artisanat', done: (n) => n(B.CRAFTING_TABLE) > 0 },
  { label: 'Fabriquer une pioche en bois', done: (n) => n(toolId('wooden', 'pickaxe')) > 0 },
  { label: 'Fabriquer une pioche en pierre', done: (n) => n(toolId('stone', 'pickaxe')) > 0 },
  { label: 'Trouver du charbon', done: (n) => n(I.COAL) > 0 },
  { label: 'Fabriquer un four', done: (n) => n(B.FURNACE) > 0 },
  { label: 'Miner du fer', done: (n) => n(B.IRON_ORE) > 0 || n(I.IRON_INGOT) > 0 },
  { label: 'Cuire un lingot de fer', done: (n) => n(I.IRON_INGOT) > 0 },
  { label: 'Fabriquer une pioche en fer', done: (n) => n(toolId('iron', 'pickaxe')) > 0 },
  { label: 'Trouver un DIAMANT', done: (n) => n(I.DIAMOND) > 0 },
];

const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class LiveController {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.queue = [];
    this.current = null;
    this.votes = opts.vote ? new VoteBox() : null;
    this.voteTimer = 0;
    this.lastByUser = new Map();
    this.likes = new LikeMeter(100);
    this.gifters = new Map();
    this.viewers = null;
    this.status = { state: 'connecting', message: 'Connexion…' };
    this.move = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    this.mining = false;
    this.driving = false;
    this.goalTimer = 0;
    this.deathTimer = 0;
    this.overlay = new LiveOverlay(this);
  }

  get stats() {
    const meta = this.game.meta;
    if (!meta) return { goal: 0, deaths: 0 };
    if (!meta.live) meta.live = { goal: 0, deaths: 0 };
    return meta.live;
  }

  start() {
    this.game.audio.unlock();
    if (this.opts.source === 'demo') {
      this.stopDemo = startDemoFeed((ev) => this.handle(ev));
      return;
    }
    const es = new EventSource(new URL('live/events', location.href));
    es.onmessage = (e) => {
      try { this.handle(JSON.parse(e.data)); } catch (err) { console.error(err); }
    };
    es.onerror = () => {
      if (this.status.state !== 'error') this.setStatus('error', 'Pont TikTok injoignable : lancez « npm run live -- @pseudo ».');
    };
    this.source = es;
  }

  setStatus(state, message) {
    this.status = { state, message };
    this.overlay.setStatus(state, message);
  }

  // ------------------------------------------------------------------ événements reçus
  handle(ev) {
    if (!ev || !ev.type) return;
    switch (ev.type) {
      case 'status': this.setStatus(ev.state, ev.message || ''); break;
      case 'viewers': this.viewers = ev.viewers; this.overlay.setViewers(ev.viewers); break;
      case 'chat': {
        const cmd = parseCommand(ev.text);
        if (cmd) this.onCommand(ev.user, cmd);
        break;
      }
      case 'like': this.onLikes(ev.user, ev.likes); break;
      case 'gift': this.onGift(ev.user, ev.gift); break;
      case 'follow': this.onFollow(ev.user); break;
      case 'share': this.onShare(ev.user); break;
    }
  }

  onCommand(user, cmd) {
    if (this.opts.control === 'streamer') return;
    const now = performance.now() / 1000;
    if (now - (this.lastByUser.get(user.id) ?? -99) < USER_COOLDOWN) return;
    this.lastByUser.set(user.id, now);
    if (this.lastByUser.size > 2000) this.lastByUser.clear();
    if (this.votes) {
      if (this.votes.add(user.id, cmd)) this.overlay.setVotes(this.votes.ranking(), VOTE_WINDOW - this.voteTimer);
      return;
    }
    if (this.queue.length >= QUEUE_MAX) this.queue.shift();
    this.queue.push({ user, cmd });
    this.overlay.feed(`<b>${esc(user.name)}</b> ${esc(commandLabel(cmd))}`, 'cmd');
  }

  onLikes(user, n) {
    const reached = this.likes.add(n);
    this.overlay.setLikes(this.likes);
    for (let i = 0; i < reached; i++) this.likeReward(user);
  }

  onGift(user, gift) {
    const tier = giftTier(gift.coins);
    const times = giftRepeats(gift.count);
    const g = this.gifters.get(user.id) || { name: user.name, coins: 0 };
    g.coins += gift.coins * gift.count;
    this.gifters.set(user.id, g);
    this.overlay.setGifters([...this.gifters.values()].sort((a, b) => b.coins - a.coins).slice(0, 3));
    const label = `${esc(gift.name)}${gift.count > 1 ? ' ×' + gift.count : ''}`;
    this.overlay.feed(`🎁 <b>${esc(user.name)}</b> ${label} → ${tier.icon} ${esc(tier.label)}`, 'gift');
    if (gift.coins * gift.count >= 10) this.overlay.banner(`${tier.icon} ${tier.label}`, `merci ${user.name} !`);
    this.game.playSound('gift', 0.7);
    if (this.game.world && !this.game.player.dead) this.applyGift(tier.id, user, times);
  }

  onFollow(user) {
    const type = PASSIVE_MOBS[Math.floor(Math.random() * PASSIVE_MOBS.length)];
    const fr = { pig: '🐷 cochon', cow: '🐮 vache', sheep: '🐑 mouton', chicken: '🐔 poulet' };
    this.overlay.feed(`➕ <b>${esc(user.name)}</b> s’abonne → ${fr[type]} à son nom`, 'social');
    if (this.game.world) this.spawnMob(type, user);
  }

  onShare(user) {
    this.overlay.feed(`📣 <b>${esc(user.name)}</b> partage le LIVE → 🍞 pain`, 'social');
    if (this.game.world) this.give(I.BREAD, 2);
  }

  likeReward(user) {
    const p = this.game.player;
    if (!this.game.world || p.dead) return;
    if (this.game.isCreative() || (p.health >= 20 && p.food >= 20)) {
      const gifts = [[B.TORCH, 8], [B.COBBLESTONE, 16], [I.BREAD, 3], [B.OAK_LOG, 6], [I.COAL, 4]];
      const [id, n] = gifts[Math.floor(Math.random() * gifts.length)];
      this.give(id, n);
      this.overlay.banner(`❤️ ${this.likes.goal} likes !`, `+${n} ${itemName(id)}`);
    } else {
      p.health = Math.min(20, p.health + 6);
      p.food = Math.min(20, p.food + 6);
      this.overlay.banner(`❤️ ${this.likes.goal} likes !`, 'Soin et repas pour le joueur');
    }
    this.game.playSound('levelup', 0.6);
    this.overlay.feed(`❤️ Jauge de likes pleine (merci <b>${esc(user.name)}</b> et tous les autres)`, 'like');
  }

  // ------------------------------------------------------------------ effets des cadeaux
  applyGift(id, user, times) {
    const game = this.game;
    const p = game.player;
    switch (id) {
      case 'zombie': case 'creeper':
        for (let i = 0; i < times; i++) this.spawnMob(id, user);
        break;
      case 'tnt':
        this.tntRain(user, Math.min(12, 3 * times), 3, 7);
        break;
      case 'kit':
        for (let i = 0; i < Math.min(3, times); i++) {
          this.give(I.BREAD, 4); this.give(B.TORCH, 8); this.give(B.COBBLESTONE, 16);
          this.give(I.IRON_INGOT, 3); this.give(toolId('stone', 'pickaxe'), 1);
        }
        break;
      case 'horde':
        for (let i = 0; i < Math.min(2, times); i++) {
          for (let k = 0; k < 4; k++) this.spawnMob('zombie', user, 6, 12);
          for (let k = 0; k < 2; k++) this.spawnMob('creeper', user, 7, 12);
        }
        break;
      case 'launch':
        p.vy = 24; p.onGround = false; p.flying = false;
        game.playSound('explode', 0.4);
        game.particles.poof(p.x, p.y, p.z, 30, 0.6, 0.2);
        break;
      case 'diamonds':
        for (let i = 0; i < 8 * Math.min(2, times); i++) {
          const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 3;
          const e = game.dropItem(p.x + Math.cos(a) * d, p.y + 5 + Math.random() * 3, p.z + Math.sin(a) * d, { id: I.DIAMOND, count: 1 }, 0.2);
          if (e) e.vy = -2;
        }
        game.dropItem(p.x, p.y + 6, p.z, { id: toolId('diamond', 'pickaxe'), count: 1 }, 0.2);
        break;
      case 'nuke':
        this.tntRain(user, 16, 4, 9);
        break;
    }
  }

  give(id, count) {
    const p = this.game.player;
    const rest = p.inventory.add({ id, count, dmg: 0 });
    if (rest > 0) this.game.dropItem(p.x, p.y + 1, p.z, { id, count: rest });
    this.checkGoals();
  }

  // Une case libre (sol solide, deux blocs d'air) autour du joueur, à son niveau.
  findSpot(minD, maxD) {
    const world = this.game.world;
    const p = this.game.player;
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!world.isLoadedAt(x, z)) continue;
      const y0 = Math.floor(p.y);
      for (let dy = 4; dy >= -5; dy--) {
        const y = y0 + dy;
        const below = world.getBlock(x, y - 1, z), a0 = world.getBlock(x, y, z), a1 = world.getBlock(x, y + 1, z);
        if (SOLID[below] && !SOLID[a0] && !SOLID[a1] && !IS_LIQUID[a0] && !IS_LIQUID[a1]) return { x: x + 0.5, y, z: z + 0.5 };
      }
    }
    return { x: p.x, y: p.y + 0.2, z: p.z };
  }

  spawnMob(type, user, minD = 4, maxD = 9) {
    const game = this.game;
    const gifted = game.entities.filter((e) => e.gifted && !e.dead);
    if (gifted.length >= GIFTED_MAX) gifted[0].dead = true;
    const s = this.findSpot(minD, maxD);
    const m = new Mob(game, type, s.x, s.y, s.z);
    m.name = user.name;
    m.owner = user.name;
    m.gifted = true;
    game.entities.push(m);
    game.particles.poof(s.x, s.y + m.h / 2, s.z, 18, 0.5, 0.15);
    if (m.def.sound) game.playSoundAt(m.def.sound, s.x, s.y, s.z, 0.8);
    return m;
  }

  tntRain(user, n, minD, maxD) {
    const game = this.game;
    for (let i = 0; i < n; i++) {
      const s = this.findSpot(minD, maxD);
      const t = new PrimedTnt(game, Math.floor(s.x), s.y + 3 + Math.random() * 4, Math.floor(s.z), 2.5 + Math.random() * 2.5);
      t.owner = user.name;
      game.entities.push(t);
    }
    game.playSound('ignite', 0.8);
  }

  // ------------------------------------------------------------------ mort et objectifs
  // attacker : la créature ou la TNT responsable (si elle vient d'un cadeau, elle porte le nom du donateur).
  onPlayerDeath(cause, attacker) {
    this.stats.deaths++;
    this.deathTimer = 5;
    this.cancelAction();
    this.queue = [];
    const owner = (cause === 'mob' || cause === 'explosion') && attacker ? attacker.owner : null;
    const what = attacker instanceof Mob ? { zombie: 'le zombie', creeper: 'le creeper' }[attacker.type] || 'la créature' : 'la TNT';
    this.overlay.banner('💀 Le joueur est mort !', owner ? `tué par ${what} de ${owner}` : 'Réapparition dans 5 s', 'death');
    this.overlay.feed(`💀 Mort n°${this.stats.deaths}${owner ? ` — ${what} de <b>${esc(owner)}</b>` : ''}`, 'death');
    this.overlay.setGoal(this.goalInfo());
  }

  goalInfo() {
    const i = this.stats.goal;
    return { index: i, total: GOALS.length, label: GOALS[i] ? GOALS[i].label : 'Tous les objectifs sont atteints !', deaths: this.stats.deaths, creative: this.game.isCreative() };
  }

  checkGoals() {
    const inv = this.game.player.inventory;
    const st = this.stats;
    const n = (id) => inv.count(id);
    // Un objectif plus avancé valide aussi ceux d'avant (les bûches ont pu servir avant d'être comptées).
    let reached = st.goal;
    for (let i = GOALS.length - 1; i >= st.goal; i--) if (GOALS[i].done(n)) { reached = i + 1; break; }
    if (reached > st.goal) {
      for (let i = st.goal; i < reached; i++) this.overlay.feed(`✅ ${GOALS[i].label}`, 'goal');
      this.overlay.banner('✅ Objectif atteint !', GOALS[reached - 1].label, 'goal');
      st.goal = reached;
      this.game.playSound('levelup', 0.8);
    }
    this.overlay.setGoal(this.goalInfo());
  }

  // ------------------------------------------------------------------ boucle (appelée par Game.update)
  update(dt) {
    const game = this.game;
    if (this.driving) {
      const v = game.input.virtual;
      v.forward = v.strafe = 0;
      v.jump = v.sneak = v.sprint = false;
      game.touchBreak = false;
      this.driving = false;
    }
    if (game.state === 'dead') {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) game.respawn();
      return;
    }
    this.goalTimer -= dt;
    if (this.goalTimer <= 0) { this.goalTimer = 1; this.checkGoals(); }
    if (game.state !== 'playing' || game.sleepTimer > 0) return;

    if (!this.current) {
      if (this.votes) {
        if (this.votes.size) {
          this.voteTimer += dt;
          this.overlay.setVotes(this.votes.ranking(), VOTE_WINDOW - this.voteTimer);
          if (this.voteTimer >= VOTE_WINDOW) {
            const w = this.votes.winner();
            const voters = this.votes.size;
            this.votes.reset();
            this.voteTimer = 0;
            this.overlay.setVotes([], 0);
            this.overlay.feed(`🗳️ ${esc(commandLabel(w.cmd))} <i>(${w.n}/${voters} voix)</i>`, 'cmd');
            this.begin({ user: { id: w.user, name: `${w.n} voix` }, cmd: w.cmd });
          }
        }
      } else if (this.queue.length) this.begin(this.queue.shift());
    }
    if (!this.current) {
      this.overlay.setNow(null, this.queue.length);
      // Sans commande, le joueur remonte à la surface de l'eau comme un joueur qui tient Espace.
      if (game.player.inWater || game.player.inLava) {
        game.input.virtual.jump = true;
        this.driving = true;
      }
      return;
    }

    const m = this.move;
    m.forward = m.strafe = 0;
    m.jump = m.sneak = m.sprint = false;
    this.mining = false;
    const cur = this.current;
    cur.t += dt;
    let r;
    try { r = cur.gen.next(dt); } catch (e) { console.error(e); r = { done: true }; }
    if (r.done || cur.t > 12) {
      if (r.done && typeof r.value === 'string') this.overlay.feed(`✗ ${esc(r.value)}`, 'fail');
      this.current = null;
    } else {
      const v = game.input.virtual;
      v.forward = m.forward; v.strafe = m.strafe; v.jump = m.jump; v.sneak = m.sneak; v.sprint = m.sprint;
      game.touchBreak = this.mining;
      this.driving = true;
    }
    this.overlay.setNow(this.current, this.queue.length);
  }

  begin(item) {
    const gen = this.action(item.cmd);
    const r = gen.next(); // amorce : exécute jusqu'au premier « yield »
    if (r.done) {
      if (typeof r.value === 'string') this.overlay.feed(`✗ ${esc(r.value)}`, 'fail');
      return;
    }
    this.current = { ...item, gen, t: 0 };
  }

  cancelAction() {
    this.current = null;
    this.mining = false;
  }

  // ------------------------------------------------------------------ actions (générateurs : « yield » = image suivante)
  *action(cmd) {
    switch (cmd.action) {
      case 'forward': return yield* this.walk(cmd.arg, 1, false);
      case 'back': return yield* this.walk(cmd.arg, -1, false);
      case 'sprint': return yield* this.walk(cmd.arg, 1, true);
      case 'left': return yield* this.turnBy(cmd.arg * DEG);
      case 'right': return yield* this.turnBy(-cmd.arg * DEG);
      case 'turn': return yield* this.turnBy(Math.PI);
      case 'up': return yield* this.turnTo(this.game.player.yaw, clamp(this.game.player.pitch + 30 * DEG, -89 * DEG, 89 * DEG));
      case 'down': return yield* this.turnTo(this.game.player.yaw, clamp(this.game.player.pitch - 30 * DEG, -89 * DEG, 89 * DEG));
      case 'level': return yield* this.turnTo(this.game.player.yaw, 0);
      case 'jump': return yield* this.jump();
      case 'mine': return yield* this.mineAhead(cmd.arg);
      case 'tunnel': return yield* this.tunnel(cmd.arg);
      case 'place': return yield* this.place();
      case 'pillar': return yield* this.pillar(cmd.arg);
      case 'attack': return yield* this.attack();
      case 'eat': return yield* this.eat();
      case 'slot': this.game.player.inventory.selected = cmd.arg - 1; return;
      case 'take': return this.take(cmd.arg);
      case 'craft': return this.craft(cmd.arg, cmd.count);
      case 'smelt': return this.smelt();
    }
  }

  *wait(seconds) {
    let t = 0;
    while (t < seconds) t += yield;
  }

  *turnTo(yaw, pitch, speed = 7) {
    const p = this.game.player;
    for (;;) {
      const dy = angleDiff(yaw, p.yaw), dp = pitch - p.pitch;
      if (Math.abs(dy) < 0.005 && Math.abs(dp) < 0.005) { p.yaw = p.yaw + dy; p.pitch = pitch; return; }
      const dt = yield;
      const step = speed * dt;
      p.yaw += clamp(dy, -step, step);
      p.pitch += clamp(dp, -step, step);
    }
  }

  *turnBy(delta) {
    yield* this.turnTo(this.game.player.yaw + delta, this.game.player.pitch, 5);
  }

  aimAngles(x, y, z) {
    const p = this.game.player;
    const dx = x - p.x, dy = y - p.eyeY, dz = z - p.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  *walk(blocksToGo, dir, sprint) {
    const p = this.game.player;
    const sx = p.x, sz = p.z;
    let t = 0, stuck = 0, lastD = 0;
    while (t < blocksToGo * 0.45 + 1) {
      const d = Math.hypot(p.x - sx, p.z - sz);
      if (d >= blocksToGo - 0.1) return;
      stuck = d - lastD < 0.004 ? stuck + 1 : 0;
      lastD = d;
      if (stuck > 30) return 'bloqué';
      this.move.forward = dir;
      this.move.sprint = sprint;
      t += yield;
    }
  }

  *jump() {
    let t = 0;
    while (t < 0.55) {
      this.move.jump = t < 0.2;
      this.move.forward = 1;
      t += yield;
    }
  }

  // Prend le meilleur outil de la barre pour ce bloc.
  pickTool(blockId) {
    const b = blocks[blockId];
    const inv = this.game.player.inventory;
    if (!b || !b.tool) return;
    let best = -1, bestTier = 0;
    for (let i = 0; i < 9; i++) {
      const it = inv.slots[i] && getItem(inv.slots[i].id);
      if (it && it.tool && it.tool.type === b.tool && it.tool.tier * 10 + it.tool.speed > bestTier) { best = i; bestTier = it.tool.tier * 10 + it.tool.speed; }
    }
    if (best >= 0) inv.selected = best;
  }

  *breakBlock(x, y, z) {
    const world = this.game.world;
    const id = world.getBlock(x, y, z);
    if (id === B.AIR || IS_LIQUID[id]) return;
    if (blocks[id].hardness < 0) return 'bloc incassable';
    this.pickTool(id);
    const c = [x + 0.5, y + 0.5, z + 0.5];
    const a = this.aimAngles(...c);
    yield* this.turnTo(a.yaw, a.pitch, 9);
    let t = 0;
    while (world.getBlock(x, y, z) === id && t < 9) {
      const a2 = this.aimAngles(...c);
      this.game.player.yaw = a2.yaw;
      this.game.player.pitch = a2.pitch;
      this.mining = true;
      t += yield;
    }
  }

  *mineAhead(n) {
    const p = this.game.player;
    for (let k = 0; k < n; k++) {
      let hit = this.game.target;
      if (!hit) {
        yield* this.turnTo(p.yaw, -40 * DEG);
        yield;
        hit = this.game.target;
      }
      if (!hit) return 'rien à miner ici';
      const r = yield* this.breakBlock(hit.x, hit.y, hit.z);
      if (r) return r;
    }
  }

  // Direction cardinale la plus proche du regard.
  cardinal() {
    const p = this.game.player;
    const q = Math.round(p.yaw / (Math.PI / 2));
    const yaw = q * (Math.PI / 2);
    return { yaw, dx: Math.round(-Math.sin(yaw)), dz: Math.round(-Math.cos(yaw)) };
  }

  *tunnel(n) {
    const p = this.game.player;
    const world = this.game.world;
    const c = this.cardinal();
    yield* this.turnTo(c.yaw, 0);
    for (let k = 0; k < n; k++) {
      const bx = Math.floor(p.x) + c.dx, bz = Math.floor(p.z) + c.dz, by = Math.floor(p.y + 0.01);
      for (const y of [by + 1, by]) {
        const r = yield* this.breakBlock(bx, y, bz);
        if (r) return r;
      }
      if (SOLID[world.getBlock(bx, by, bz)] || SOLID[world.getBlock(bx, by + 1, bz)]) return 'le tunnel est bouché';
      // Avance jusqu'au centre du bloc creusé.
      let t = 0;
      while (t < 1.5) {
        const dx = bx + 0.5 - p.x, dz = bz + 0.5 - p.z;
        if (Math.abs(dx) + Math.abs(dz) < 0.25) break;
        p.yaw = Math.atan2(-dx, -dz);
        this.move.forward = 1;
        t += yield;
      }
      p.yaw = c.yaw;
      p.pitch = 0;
    }
  }

  // Met un bloc posable en main ; renvoie son id ou null.
  holdBlock() {
    const inv = this.game.player.inventory;
    const isBlock = (s) => s && getItem(s.id)?.block !== null && getItem(s.id)?.block !== undefined && SOLID[getItem(s.id).block];
    if (isBlock(inv.held)) return getItem(inv.held.id).block;
    for (let i = 0; i < 9; i++) if (isBlock(inv.slots[i])) { inv.selected = i; return getItem(inv.slots[i].id).block; }
    for (let i = 9; i < inv.slots.length; i++) {
      if (isBlock(inv.slots[i])) {
        [inv.slots[i], inv.slots[inv.selected]] = [inv.slots[inv.selected], inv.slots[i]];
        return getItem(inv.held.id).block;
      }
    }
    return null;
  }

  *place() {
    const game = this.game;
    const p = game.player;
    if (this.holdBlock() === null) return 'aucun bloc à poser';
    let hit = game.target;
    if (!hit) {
      yield* this.turnTo(p.yaw, -55 * DEG);
      yield;
      hit = game.target;
    }
    if (!hit || !p.inventory.held) return 'rien sur quoi poser';
    if (game.placeBlock(hit, p.inventory.held)) game.swing();
    else return 'impossible de poser ici';
    yield;
  }

  *pillar(n) {
    const game = this.game;
    const p = game.player;
    const world = game.world;
    for (let k = 0; k < n; k++) {
      const id = this.holdBlock();
      if (id === null) return 'aucun bloc pour monter';
      let t = 0;
      while (!p.onGround && t < 1.5) t += yield;
      const bx = Math.floor(p.x), bz = Math.floor(p.z), by = Math.floor(p.y + 0.01);
      if (SOLID[world.getBlock(bx, by + 2, bz)]) return 'plafond trop bas';
      t = 0;
      while (p.y < by + 1.05 && t < 0.8) { this.move.jump = true; t += yield; }
      if (p.y < by + 1.05 || !REPLACEABLE[world.getBlock(bx, by, bz)]) return;
      world.setBlock(bx, by, bz, id);
      if (!game.isCreative()) p.inventory.consumeHeld();
      game.playSound('place_' + blocks[id].sound, 0.8);
      game.markUrgent(bx, bz);
      game.swing();
      t = 0;
      while (!p.onGround && t < 1) t += yield;
    }
  }

  *attack() {
    const game = this.game;
    const p = game.player;
    let target = null, best = 7;
    for (const e of game.entities) {
      if (!(e instanceof Mob) || e.deathTime > 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
      if (d < best) { best = d; target = e; }
    }
    if (!target) { game.swing(); return 'personne à frapper'; }
    let t = 0;
    while (t < 3 && target.deathTime === 0 && !target.dead) {
      const a = this.aimAngles(target.x, target.y + target.h * 0.6, target.z);
      p.yaw += clamp(angleDiff(a.yaw, p.yaw), -0.3, 0.3);
      p.pitch = a.pitch;
      const d = Math.hypot(target.x - p.x, target.z - p.z);
      if (d > 2.6) this.move.forward = 1;
      if (game.targetEntity === target && game.attackCooldown <= 0) {
        // Attend que l'arme soit prête, comme un joueur qui tape au bon rythme.
        if (game.swingTime >= 1) game.attack(target);
      }
      t += yield;
    }
  }

  *eat() {
    const game = this.game;
    const p = game.player;
    const inv = p.inventory;
    if (p.food >= 20 && !game.isCreative()) return 'le joueur n’a pas faim';
    let slot = -1, best = 0;
    inv.slots.forEach((s, i) => { const f = s ? getItem(s.id)?.food || 0 : 0; if (f > best) { best = f; slot = i; } });
    if (slot < 0) return 'rien à manger';
    if (slot < 9) inv.selected = slot;
    let t = 0;
    while (t < 1.6) {
      const before = t;
      t += yield;
      if (Math.floor(before / 0.25) !== Math.floor(t / 0.25)) game.playSound('eat', 0.5);
    }
    const s = inv.slots[slot];
    if (!s || getItem(s.id)?.food !== best) return;
    p.eat(best);
    removeItems(inv, s.id, 1);
    game.playSound('burp', 0.5);
  }

  take(query) {
    const inv = this.game.player.inventory;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && nameMatches(query, inv.slots[i].id)) { inv.selected = i; return; }
    for (let i = 9; i < inv.slots.length; i++) {
      if (inv.slots[i] && nameMatches(query, inv.slots[i].id)) {
        [inv.slots[i], inv.slots[inv.selected]] = [inv.slots[inv.selected], inv.slots[i]];
        return;
      }
    }
    return `pas de « ${query} » dans l’inventaire`;
  }

  nearBlock(ids, r = 5) {
    const world = this.game.world;
    const p = this.game.player;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
    for (let y = y0 - 2; y <= y0 + 3; y++)
      for (let z = z0 - r; z <= z0 + r; z++)
        for (let x = x0 - r; x <= x0 + r; x++) if (ids.includes(world.getBlock(x, y, z))) return true;
    return false;
  }

  craft(query, times = 1) {
    const inv = this.game.player.inventory;
    const res = craftByName(inv, query, { table: this.game.isCreative() || this.nearBlock([B.CRAFTING_TABLE]), times });
    if (!res.ok) {
      if (res.reason === 'unknown') return `recette « ${query} » inconnue`;
      if (res.reason === 'table') return `il faut une table d’artisanat à côté pour : ${itemName(res.recipe.out.id)}`;
      return `il manque des ingrédients pour : ${itemName(res.recipe.out.id)}`;
    }
    if (res.overflow) this.game.dropItem(this.game.player.x, this.game.player.y + 1, this.game.player.z, { id: res.id, count: res.overflow });
    this.game.playSound('pop', 0.6);
    this.overlay.feed(`🛠️ Fabriqué : ${res.count} × ${esc(itemName(res.id))}`, 'goal');
    this.checkGoals();
  }

  smelt() {
    if (!this.game.isCreative() && !this.nearBlock([B.FURNACE, B.LIT_FURNACE])) return 'il faut un four à côté';
    const res = smeltInventory(this.game.player.inventory, 8);
    if (!res.ok) return res.reason === 'fuel' ? 'pas de combustible (charbon, bois…)' : 'rien à cuire';
    this.game.playSound('furnace', 0.8);
    this.overlay.feed(`🔥 Cuit : ${res.results.map(([id, n]) => `${n} × ${esc(itemName(id))}`).join(', ')}`, 'goal');
    this.checkGoals();
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
