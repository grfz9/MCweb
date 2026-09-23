// Boucle principale : état du jeu, interactions, entités, temps, sauvegarde et commandes.
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { World } from './world/world.js';
import { BIOME_NAMES } from './world/generator.js';
import { Player } from './entity/player.js';
import { ItemEntity, FallingBlock, PrimedTnt, Mob, Particles, PASSIVE_MOBS, MOB_TYPES } from './entity/entities.js';
import { rayBox } from './entity/physics.js';
import { B, blocks, SOLID, REPLACEABLE, IS_LIQUID, SHAPE } from './blocks.js';
import { I, getItem, breakTime, canHarvest, attackDamage, findItemByKey, maxStack } from './items.js';
import { smeltResult } from './crafting.js';
import { lookVector, clamp } from './math.js';
import { seedFromString } from './noise.js';
import { FACE_DIRS, WORLD_HEIGHT, DAY_LENGTH, GAMEMODE, SEA_LEVEL } from './constants.js';

const REACH = { survival: 4.5, creative: 5 };
const DEG = Math.PI / 180;

export class Game {
  constructor({ canvas, storage, audio, settings, touch }) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.storage = storage;
    this.audio = audio;
    this.settings = settings;
    this.touch = touch; // vrai sur écran tactile
    this.ui = null; // attaché par main.js

    this.state = 'title';
    this.world = null;
    this.meta = null;
    this.player = new Player(this);
    this.entities = [];
    this.particles = new Particles(this);
    this.dayTime = 1000;
    this.tickAcc = 0;
    this.clock = 0;
    this.gamemode = GAMEMODE.SURVIVAL;

    this.target = null;
    this.targetEntity = null;
    this.breaking = null;
    this.useCooldown = 0;
    this.attackCooldown = 0;
    this.swingTime = 1;
    this.equip = 0;
    this.lastHeldId = null;
    this.eatTime = 0;
    this.digSoundTimer = 0;
    this.fov = settings.fov * DEG;
    this.saveTimer = 0;
    this.spawnTimer = 0;
    this.showDebug = false;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.urgentChunks = new Set();
    this.touchBreak = false;
    this.panoYaw = 0;
    this.lastFrame = performance.now();

    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.applySettings();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  isCreative() { return this.gamemode === GAMEMODE.CREATIVE; }

  isDay() {
    const t = this.dayTime % DAY_LENGTH;
    return t < 12300 || t > 23700;
  }

  applySettings() {
    const s = this.settings;
    this.renderer.gamma = s.brightness / 100;
    this.renderer.resolution = s.resolution / 100;
    this.audio.setVolume(s.volume / 100);
    this.audio.music = s.music;
  }

  // ------------------------------------------------------------------ cycle de vie
  startTitle() {
    this.disposeWorld();
    this.state = 'title';
    const world = new World(seedFromString('MCweb'));
    this.world = world;
    world.onUnload = (c) => this.renderer.freeChunk(c);
    const sp = world.gen.findSpawn();
    // Caméra au-dessus du plus haut relief alentour pour une vue dégagée.
    let top = Math.max(sp.h, SEA_LEVEL);
    for (let a = 0; a < 24; a++)
      for (const r of [16, 32, 48]) top = Math.max(top, world.gen.column(Math.round(sp.x + Math.cos(a / 24 * Math.PI * 2) * r), Math.round(sp.z + Math.sin(a / 24 * Math.PI * 2) * r)));
    this.pano = { x: sp.x, z: sp.z, y: Math.min(top + 6, sp.h + 40) };
    this.dayTime = 2500;
    this.input.enabled = false;
  }

  disposeWorld() {
    if (this.world) for (const c of this.world.chunks.values()) this.renderer.freeChunk(c);
    this.world = null;
    this.entities = [];
    this.particles.list = [];
    this.target = null;
    this.breaking = null;
  }

  async newWorld(name, seedText, mode) {
    const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const meta = {
      id, name: name.trim() || 'Nouveau monde', seed: seedFromString(seedText), seedText: seedText.trim(),
      gamemode: mode, created: Date.now(), lastPlayed: Date.now(), time: 1000, player: null,
    };
    await this.storage.putWorld(meta);
    return this.playWorld(meta);
  }

  async playWorld(meta) {
    this.disposeWorld();
    this.state = 'loading';
    this.ui.showLoading('Chargement du monde…', 0);
    const saved = await this.storage.loadChunks(meta.id);
    this.meta = meta;
    this.gamemode = meta.gamemode || GAMEMODE.SURVIVAL;
    this.dayTime = meta.time ?? 1000;
    const world = new World(meta.seed, saved);
    this.world = world;
    world.onUnload = (c) => this.renderer.freeChunk(c);
    world.hooks.dropItems = (x, y, z, stacks) => {
      if (this.isCreative()) return;
      for (const [id, count] of stacks) if (count > 0) this.dropItem(x, y, z, { id, count });
    };
    world.hooks.fallingBlock = (x, y, z, id, m) => this.entities.push(new FallingBlock(this, x, y, z, id, m));

    const player = new Player(this);
    this.player = player;
    if (meta.player) player.load(meta.player);
    else {
      const sp = world.gen.findSpawn();
      player.x = sp.x; player.z = sp.z; player.y = WORLD_HEIGHT;
      player.spawn = { x: sp.x, y: -1, z: sp.z };
      if (this.gamemode === GAMEMODE.CREATIVE) this.giveCreativeStarter();
    }

    // Génère la zone de départ avant de lâcher le joueur.
    const R = this.settings.renderDistance;
    const pre = Math.min(R, 3);
    let total = 0, done = 0;
    for (let dz = -pre - 1; dz <= pre + 1; dz++) for (let dx = -pre - 1; dx <= pre + 1; dx++) total++;
    const pcx = Math.floor(player.x) >> 4, pcz = Math.floor(player.z) >> 4;
    for (let dz = -pre - 1; dz <= pre + 1; dz++) {
      for (let dx = -pre - 1; dx <= pre + 1; dx++) {
        world.loadChunk(pcx + dx, pcz + dz);
        done++;
      }
      this.ui.showLoading('Génération du terrain…', done / total);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (player.spawn.y < 0) {
      const spot = this.findSafeSpot(Math.floor(player.x), Math.floor(player.z));
      player.x = spot.x; player.y = spot.y; player.z = spot.z;
      player.spawn = { ...spot };
    }
    this.renderer.updateMeshes(world, player.x, player.z, R, 400);
    this.spawnInitialAnimals();
    this.state = 'playing';
    this.ui.hideLoading();
    this.ui.showGame();
    this.input.enabled = true;
    if (!this.touch) this.ui.showClickToPlay();
    this.saveTimer = 0;
    this.chat(`Bienvenue dans « ${meta.name} » ! Tapez /help pour la liste des commandes.`);
  }

  // Cherche un sol dégagé (pas sur un arbre ni dans l'eau) autour de (x0, z0).
  findSafeSpot(x0, z0) {
    const world = this.world;
    const TREE = new Set([B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.CACTUS]);
    for (let r = 0; r <= 12; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = x0 + dx, z = z0 + dz;
          if (!world.isLoadedAt(x, z)) continue;
          let y = WORLD_HEIGHT - 1;
          while (y > 0 && !SOLID[world.getBlock(x, y, z)] && !IS_LIQUID[world.getBlock(x, y, z)]) y--;
          const ground = world.getBlock(x, y, z);
          if (IS_LIQUID[ground] || TREE.has(ground) || y <= 0) continue;
          if (SOLID[world.getBlock(x, y + 1, z)] || SOLID[world.getBlock(x, y + 2, z)]) continue;
          return { x: x + 0.5, y: y + 1, z: z + 0.5 };
        }
    return { x: x0 + 0.5, y: world.topSolidY(x0, z0) + 1, z: z0 + 0.5 };
  }

  giveCreativeStarter() {
    const inv = this.player.inventory;
    const start = [B.GRASS, B.DIRT, B.STONE, B.COBBLESTONE, B.OAK_PLANKS, B.OAK_LOG, B.GLASS, B.TORCH, B.BRICKS];
    start.forEach((id, i) => { inv.slots[i] = { id, count: 64, dmg: 0 }; });
  }

  async save() {
    if (!this.world || !this.meta || this.state === 'title') return;
    try {
      this.world.storeAllModified();
      const recs = this.world.takePendingSaves();
      this.meta.player = this.player.toJSON();
      this.meta.time = this.dayTime;
      this.meta.gamemode = this.gamemode;
      this.meta.lastPlayed = Date.now();
      await this.storage.putChunks(this.meta.id, recs);
      await this.storage.putWorld(this.meta);
    } catch (e) {
      console.error('Erreur de sauvegarde', e);
      this.chat('⚠ La sauvegarde a échoué : ' + e.message);
    }
  }

  async quitToTitle() {
    this.ui.showLoading('Sauvegarde…', 1);
    await this.save();
    this.ui.hideLoading();
    this.meta = null;
    this.input.exitLock();
    this.startTitle();
    this.ui.showTitle();
  }

  // ------------------------------------------------------------------ états
  onLockChange(locked) {
    if (locked) {
      if (this.state === 'playing') this.ui.hideOverlays();
      return;
    }
    if (this.state === 'playing' && !this.ui.intentionalUnlock) this.pause();
    this.ui.intentionalUnlock = false;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.input.exitLock();
    this.breaking = null;
    this.ui.showPause();
    this.save();
  }

  resume() {
    if (!this.world || !this.meta) return;
    this.state = 'playing';
    this.ui.hideOverlays();
    if (!this.touch) this.input.requestLock();
  }

  openScreen(kind, data) {
    this.state = 'inventory';
    this.breaking = null;
    this.input.releaseAll();
    this.ui.intentionalUnlock = true;
    this.input.exitLock();
    this.ui.openContainer(kind, data);
  }

  closeScreen() {
    this.ui.closeContainer();
    this.state = 'playing';
    if (!this.touch) this.input.requestLock();
  }

  // ------------------------------------------------------------------ boucle
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.clock += dt;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = 0; this.fpsTime = 0; }

    try {
      if (this.state === 'title') this.updateTitle(dt);
      else if (this.world && this.state !== 'loading') {
        const running = this.state === 'playing' || this.state === 'inventory' || this.state === 'chat' || this.state === 'dead';
        if (running) this.update(dt);
        else this.updateChunks(1);
        this.render();
      }
      this.audio.update(dt);
      if (this.ui) this.ui.update(dt);
    } catch (e) {
      console.error(e);
      if (this.ui) this.ui.showError(e);
    }
    this.input.endFrame();
  }

  updateTitle(dt) {
    if (!this.world) return;
    const world = this.world;
    this.panoYaw += dt * 0.05;
    world.updateLoading(this.pano.x, this.pano.z, 5, 5);
    this.renderer.updateMeshes(world, this.pano.x, this.pano.z, 5, 5);
    this.renderer.render({
      cam: { x: this.pano.x, y: this.pano.y, z: this.pano.z, yaw: this.panoYaw, pitch: -0.18, fov: 70 * DEG },
      world, time: this.clock, dayTime: this.dayTime, renderDistance: 5, fluid: null,
      entities: [], particles: [], clouds: this.settings.clouds,
    });
  }

  updateChunks(scale) {
    const p = this.player;
    const R = this.settings.renderDistance;
    this.world.updateLoading(p.x, p.z, R, 3 * scale);
    this.renderer.updateMeshes(this.world, p.x, p.z, R, 5 * scale, this.urgentChunks);
    this.urgentChunks.clear();
  }

  update(dt) {
    const input = this.input;
    const p = this.player;
    const playing = this.state === 'playing';

    // Regard
    if (playing && (input.locked || this.touch || input.lockFailed)) {
      const sens = (this.settings.sensitivity / 100) * 0.0024;
      p.yaw -= input.dx * sens;
      p.pitch -= input.dy * sens * (this.settings.invertY ? -1 : 1);
      p.pitch = clamp(p.pitch, -89.5 * DEG, 89.5 * DEG);
    }

    if (playing) this.handleKeys();

    // Joueur (sous-pas pour la stabilité)
    const mv = playing ? input.movement() : { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    if (playing && input.doubleSpace && this.isCreative()) p.flying = !p.flying;
    const steps = dt > 1 / 40 ? 2 : 1;
    for (let i = 0; i < steps; i++) p.update(dt / steps, mv);

    if (playing && !p.dead) this.updateInteraction(dt);
    else { this.breaking = null; this.eatTime = 0; }

    // Ticks du monde (20 par seconde)
    this.tickAcc += dt;
    let n = 0;
    while (this.tickAcc >= 0.05 && n < 5) {
      this.tickAcc -= 0.05;
      this.tick();
      n++;
    }
    if (n === 5) this.tickAcc = 0;

    // Entités
    for (const e of this.entities) if (this.world.isLoadedAt(e.x, e.z)) e.update(dt);
    this.pickupItems();
    this.entities = this.entities.filter((e) => !e.dead);
    this.particles.update(dt);

    // Animation de la main
    this.swingTime = Math.min(1, this.swingTime + dt / 0.28);
    const held = p.inventory.held;
    const heldId = held ? held.id : null;
    if (heldId !== this.lastHeldId) { this.equip = 0.6; this.lastHeldId = heldId; }
    this.equip = Math.max(0, this.equip - dt * 4);

    // Champ de vision
    let targetFov = this.settings.fov * DEG;
    if (p.sprinting) targetFov *= 1.12;
    if (p.flying && p.sprinting) targetFov *= 1.05;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);

    this.updateChunks(1);

    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }
  }

  handleKeys() {
    const input = this.input;
    const inv = this.player.inventory;
    for (let i = 1; i <= 9; i++) if (input.wasPressed('Digit' + i) || input.wasPressed('Numpad' + i)) inv.selected = i - 1;
    if (input.wheel) inv.selected = (inv.selected + (input.wheel > 0 ? 1 : -1) + 9) % 9;
    if (input.wasPressed('KeyE')) this.openScreen(this.isCreative() ? 'creative' : 'inventory');
    if (input.wasPressed('KeyQ')) this.dropHeld(input.down('ControlLeft') || input.down('ControlRight'));
    if (input.wasPressed('F3')) this.showDebug = !this.showDebug;
    if (input.wasPressed('KeyT') || input.wasPressed('Enter')) this.openChat('');
    else if (input.wasPressed('Slash') || input.wasPressed('NumpadDivide')) this.openChat('/');
    if (input.wasPressed('F1')) this.ui.toggleHud();
  }

  openChat(prefix) {
    this.state = 'chat';
    this.input.releaseAll();
    this.ui.intentionalUnlock = true;
    this.input.exitLock();
    this.ui.openChat(prefix);
  }

  closeChat() {
    this.ui.closeChat();
    this.state = 'playing';
    if (!this.touch) this.input.requestLock();
  }

  // ------------------------------------------------------------------ interactions
  updateInteraction(dt) {
    const p = this.player;
    const world = this.world;
    const input = this.input;
    const dir = lookVector(p.yaw, p.pitch);
    const ex = p.x, ey = p.eyeY, ez = p.z;
    const reach = REACH[this.gamemode];
    const hit = world.raycast(ex, ey, ez, dir[0], dir[1], dir[2], reach);

    // Créature visée ?
    let bestE = null, bestD = hit ? hit.dist : reach;
    for (const e of this.entities) {
      if (!(e instanceof Mob) || e.deathTime > 0) continue;
      const hw = e.w / 2 + 0.1;
      const d = rayBox(ex, ey, ez, dir[0], dir[1], dir[2], e.x - hw, e.y, e.z - hw, e.x + hw, e.y + e.h + 0.1, e.z + hw);
      if (d >= 0 && d < bestD && d < 3.6) { bestD = d; bestE = e; }
    }
    this.targetEntity = bestE;
    this.target = bestE ? null : hit;

    this.useCooldown = Math.max(0, this.useCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const inv = p.inventory;
    const held = inv.held;
    const heldItem = held ? getItem(held.id) : null;

    const leftDown = input.mouse[0] || this.touchBreak;
    const leftClick = input.clicked[0];
    const rightDown = input.mouse[2];
    const rightClick = input.clicked[2];

    // Attaque
    if (leftClick && bestE) {
      this.attack(bestE);
    } else if (leftDown && this.target && !bestE) {
      this.mine(dt, this.target, leftClick);
    } else {
      this.breaking = null;
    }
    if (leftClick && !bestE && !this.target) this.swing();

    // Pioche du bloc visé (clic molette)
    if (input.clicked[1] && this.target && this.isCreative()) this.pickBlock(this.target.id);

    // Manger
    if (rightDown && heldItem && heldItem.food && (p.food < 20 || this.isCreative())) {
      this.eatTime += dt;
      if (Math.floor((this.eatTime - dt) / 0.25) !== Math.floor(this.eatTime / 0.25)) this.playSound('eat', 0.5);
      if (this.eatTime >= 1.6) {
        p.eat(heldItem.food);
        if (!this.isCreative()) inv.consumeHeld();
        this.playSound('burp', 0.5);
        this.eatTime = 0;
      }
      return;
    }
    this.eatTime = 0;

    if ((rightClick || (rightDown && this.useCooldown <= 0)) && !bestE) {
      if (this.target) this.use(this.target, rightClick);
      this.useCooldown = 0.25;
    }
  }

  // Action « utiliser » (clic droit ou appui court tactile).
  use(hit, fresh = true) {
    const p = this.player;
    const inv = p.inventory;
    const held = inv.held;
    const heldItem = held ? getItem(held.id) : null;
    const b = blocks[hit.id];
    if (b.interact && !p.sneaking && fresh) {
      if (b.interact === 'crafting') { this.openScreen('crafting'); this.swing(); return; }
      if (b.interact === 'furnace' || b.interact === 'chest') {
        let be = this.world.getBlockEntity(hit.x, hit.y, hit.z);
        if (!be) {
          be = b.interact === 'chest' ? newChest() : newFurnace();
          this.world.setBlockEntity(hit.x, hit.y, hit.z, be);
        }
        if (b.interact === 'chest') this.playSound('chest', 0.6);
        this.openScreen(b.interact, { be, x: hit.x, y: hit.y, z: hit.z });
        this.swing();
        return;
      }
      if (b.interact === 'tnt' && held && held.id === I.FLINT_AND_STEEL) {
        this.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
        this.entities.push(new PrimedTnt(this, hit.x, hit.y, hit.z));
        this.playSound('ignite', 0.8);
        if (!this.isCreative()) inv.damageHeld(1);
        this.swing();
        return;
      }
    }
    if (heldItem && heldItem.block !== null) {
      if (this.placeBlock(hit, held)) this.swing();
    }
  }

  placeBlock(hit, held) {
    const world = this.world;
    const p = this.player;
    const it = getItem(held.id);
    const id = it.block;
    const b = blocks[id];
    let x = hit.x, y = hit.y, z = hit.z;
    const targetBlock = blocks[hit.id];
    if (!(targetBlock.replaceable && hit.id !== id)) {
      if (hit.face < 0) return false;
      const d = FACE_DIRS[hit.face];
      x += d[0]; y += d[1]; z += d[2];
    }
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cur = world.getBlock(x, y, z);
    if (!REPLACEABLE[cur] || cur === id) return false;
    if (b.solid) {
      const hw = p.w / 2;
      if (x + 1 > p.x - hw && x < p.x + hw && y + 1 > p.y && y < p.y + p.h && z + 1 > p.z - hw && z < p.z + hw) return false;
      for (const e of this.entities) {
        if (!(e instanceof Mob)) continue;
        const ew = e.w / 2;
        if (x + 1 > e.x - ew && x < e.x + ew && y + 1 > e.y && y < e.y + e.h && z + 1 > e.z - ew && z < e.z + ew) return false;
      }
    }
    let meta = 0;
    if (b.facing) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      if (Math.abs(fx) > Math.abs(fz)) meta = fx > 0 ? 1 : 0;
      else meta = fz > 0 ? 5 : 4;
    } else if (b.axis) {
      meta = hit.face === 0 || hit.face === 1 ? 1 : hit.face === 4 || hit.face === 5 ? 2 : 0;
    } else if (b.shape === SHAPE.TORCH) {
      if (hit.face === 2 || (targetBlock.replaceable && hit.face !== 3)) meta = 0;
      else if (hit.face === 3) return false;
      else meta = hit.face + 1;
    }
    world.setBlock(x, y, z, id, meta);
    if (b.support && !world.hasSupport(x, y, z, id)) {
      if (b.shape === SHAPE.TORCH && meta !== 0) {
        world.setBlock(x, y, z, id, 0);
        if (!world.hasSupport(x, y, z, id)) { world.setBlock(x, y, z, cur); return false; }
      } else { world.setBlock(x, y, z, cur); return false; }
    }
    if (id === B.CHEST) world.setBlockEntity(x, y, z, newChest());
    if (id === B.FURNACE) world.setBlockEntity(x, y, z, newFurnace());
    if (!this.isCreative()) p.inventory.consumeHeld();
    this.playSound('place_' + b.sound, 0.8);
    this.markUrgent(x, z);
    return true;
  }

  mine(dt, hit, fresh) {
    const p = this.player;
    if (this.isCreative()) {
      if (fresh || !this.breaking || this.breaking.cooldown <= 0) {
        this.breakBlock(hit.x, hit.y, hit.z, false);
        this.breaking = { cooldown: 0.22 };
        this.swing();
      } else this.breaking.cooldown -= dt;
      return;
    }
    const b = blocks[hit.id];
    if (b.hardness < 0) { this.breaking = null; this.swing(); return; }
    const br = this.breaking;
    if (!br || br.x !== hit.x || br.y !== hit.y || br.z !== hit.z || br.id !== hit.id) {
      const held = p.inventory.held;
      this.breaking = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, time: breakTime(hit.id, held ? held.id : null, p.headInWater) };
    }
    const cur = this.breaking;
    if (this.swingTime >= 1) this.swing();
    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      this.digSoundTimer = 0.24;
      this.playSound('dig_' + b.sound, 0.35);
      this.particles.digging(hit.x, hit.y, hit.z, hit.face, hit.id);
    }
    cur.progress += cur.time > 0 ? dt / cur.time : 1;
    if (cur.progress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, true);
      this.breaking = null;
      this.digSoundTimer = 0;
    }
  }

  breakBlock(x, y, z, drops) {
    const world = this.world;
    const id = world.getBlock(x, y, z);
    if (id === B.AIR) return;
    const b = blocks[id];
    if (b.hardness < 0 && !this.isCreative()) return;
    if (id === B.BEDROCK && !this.isCreative()) return;
    const inv = this.player.inventory;
    const held = inv.held;
    const be = world.getBlockEntity(x, y, z);
    if (be && !this.isCreative()) this.dropContainer(be, x, y, z);
    world.setBlock(x, y, z, B.AIR);
    this.particles.blockBreak(x, y, z, id);
    this.playSound('break_' + b.sound, 0.9);
    this.markUrgent(x, z);
    if (!this.isCreative()) {
      this.player.exhaustion += 0.005;
      if (drops && canHarvest(id, held ? held.id : null)) {
        const stacks = b.drops ? b.drops(Math.random) : [[id, 1]];
        for (const [sid, n] of stacks) if (n > 0) this.dropItem(x + 0.5, y + 0.3, z + 0.5, { id: sid, count: n });
      }
      const heldItem = held ? getItem(held.id) : null;
      if (heldItem && heldItem.tool && b.hardness > 0) {
        if (inv.damageHeld(heldItem.tool.type === 'sword' ? 2 : 1)) this.playSound('break_glass', 0.6);
      }
    }
  }

  attack(mob) {
    this.swing();
    if (this.attackCooldown > 0) return;
    const inv = this.player.inventory;
    const held = inv.held;
    let dmg = attackDamage(held ? held.id : null);
    if (!this.player.onGround && this.player.vy < 0) dmg *= 1.5; // coup critique
    if (mob.damage(dmg, this.player) && !this.isCreative()) {
      this.player.exhaustion += 0.1;
      const it = held ? getItem(held.id) : null;
      if (it && it.tool) {
        if (inv.damageHeld(it.tool.type === 'sword' ? 1 : 2)) this.playSound('break_glass', 0.6);
      }
    }
    this.attackCooldown = 0.25;
  }

  swing() {
    if (this.swingTime >= 0.5) this.swingTime = 0;
  }

  pickBlock(id) {
    const inv = this.player.inventory;
    let itemId = id;
    if (id === B.LIT_FURNACE) itemId = B.FURNACE;
    if (!getItem(itemId)) return;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === itemId) { inv.selected = i; return; }
    let slot = inv.selected;
    if (inv.slots[slot]) {
      const empty = inv.slots.findIndex((s, i) => i < 9 && !s);
      if (empty >= 0) slot = empty;
    }
    inv.slots[slot] = { id: itemId, count: maxStack(itemId), dmg: 0 };
    inv.selected = slot;
  }

  // Appui tactile court : attaque la créature visée ou utilise le bloc.
  touchTap() {
    if (this.state !== 'playing') return;
    if (this.targetEntity) this.attack(this.targetEntity);
    else if (this.target) this.use(this.target, true);
    else this.swing();
  }

  markUrgent(x, z) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.getChunk((x + dx) >> 4, (z + dz) >> 4);
        if (c) this.urgentChunks.add(c);
      }
  }

  // ------------------------------------------------------------------ objets
  dropItem(x, y, z, stack, pickupDelay = 0.5) {
    if (!this.world || !stack || stack.count <= 0) return null;
    const e = new ItemEntity(this, x, y, z, { id: stack.id, count: stack.count, dmg: stack.dmg || 0 }, pickupDelay);
    this.entities.push(e);
    return e;
  }

  dropHeld(all) {
    const p = this.player;
    const inv = p.inventory;
    const held = inv.held;
    if (!held) return;
    const n = all ? held.count : 1;
    const e = this.dropItem(p.x, p.eyeY - 0.3, p.z, { id: held.id, count: n, dmg: held.dmg }, 1.5);
    const d = lookVector(p.yaw, p.pitch);
    e.vx = d[0] * 5; e.vy = d[1] * 5 + 1.5; e.vz = d[2] * 5;
    inv.consumeHeld(n);
    this.swing();
  }

  dropContainer(be, x, y, z) {
    const list = be.type === 'chest' ? be.slots : [be.input, be.fuel, be.output];
    for (const s of list) if (s) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s);
  }

  pickupItems() {
    const p = this.player;
    if (p.dead) return;
    for (const e of this.entities) {
      if (!(e instanceof ItemEntity) || e.pickupDelay > 0 || e.dead) continue;
      const dx = e.x - p.x, dy = e.y - (p.y + 0.6), dz = e.z - p.z;
      if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.4) {
        const left = p.inventory.add(e.stack);
        if (left < e.stack.count) {
          this.playSound('pop', 0.4, 0, 1 + Math.random() * 0.5);
          if (left === 0) e.dead = true;
          else e.stack.count = left;
        }
      }
    }
  }

  // ------------------------------------------------------------------ ticks
  tick() {
    const world = this.world;
    world.update();
    if (!this.meta?.frozenTime) this.dayTime = (this.dayTime + 1) % DAY_LENGTH;
    this.player.tick();

    // Ticks aléatoires sur les chunks proches
    const pcx = Math.floor(this.player.x) >> 4, pcz = Math.floor(this.player.z) >> 4;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) world.randomTicks(pcx + dx, pcz + dz);

    this.tickFurnaces();

    this.spawnTimer++;
    if (this.spawnTimer >= 20) {
      this.spawnTimer = 0;
      this.spawnMobs();
    }
  }

  tickFurnaces() {
    for (const { x, y, z, data, chunk } of this.world.allBlockEntities()) {
      if (data.type !== 'furnace') continue;
      const res = data.input ? smeltResult(data.input.id) : null;
      const canSmelt = res !== null && (!data.output || (data.output.id === res && data.output.count < maxStack(res)));
      let changed = false;
      if (data.burn > 0) { data.burn--; changed = true; }
      if (data.burn <= 0 && canSmelt && data.fuel) {
        const fuel = getItem(data.fuel.id)?.fuel || 0;
        if (fuel > 0) {
          data.burn = data.burnMax = fuel;
          data.fuel.count--;
          if (data.fuel.count <= 0) data.fuel = null;
          changed = true;
        }
      }
      if (data.burn > 0 && canSmelt) {
        data.cook++;
        if (data.cook >= 200) {
          data.cook = 0;
          data.input.count--;
          if (data.input.count <= 0) data.input = null;
          if (data.output) data.output.count++;
          else data.output = { id: res, count: 1, dmg: 0 };
        }
        changed = true;
      } else if (data.cook > 0) { data.cook = Math.max(0, data.cook - 2); changed = true; }
      if (changed) chunk.modified = true;
      const id = this.world.getBlock(x, y, z);
      const want = data.burn > 0 ? B.LIT_FURNACE : B.FURNACE;
      if ((id === B.FURNACE || id === B.LIT_FURNACE) && id !== want) this.world.setBlock(x, y, z, want, this.world.getMeta(x, y, z), false);
    }
  }

  spawnInitialAnimals() {
    for (let i = 0; i < 4; i++) this.trySpawnPassive(12, 40);
  }

  trySpawnPassive(minD, maxD) {
    const world = this.world;
    const p = this.player;
    const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
    const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
    if (!world.isLoadedAt(x, z)) return;
    const y = world.topSolidY(x, z);
    if (y < 0 || world.getBlock(x, y, z) !== B.GRASS) return;
    const type = PASSIVE_MOBS[Math.floor(Math.random() * PASSIVE_MOBS.length)];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2;
      const oy = world.topSolidY(ox, oz);
      if (world.getBlock(ox, oy, oz) !== B.GRASS || SOLID[world.getBlock(ox, oy + 1, oz)] || SOLID[world.getBlock(ox, oy + 2, oz)]) continue;
      this.entities.push(new Mob(this, type, ox + 0.5, oy + 1, oz + 0.5));
    }
  }

  spawnMobs() {
    const p = this.player;
    const world = this.world;
    let passive = 0, hostile = 0;
    for (const e of this.entities) {
      if (!(e instanceof Mob)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.hostile) {
        if (d > 80 || (this.isDay() && d > 40 && Math.random() < 0.02)) { e.dead = true; continue; }
        hostile++;
      } else {
        if (d > 140) { e.dead = true; continue; }
        passive++;
      }
    }
    if (passive < 10 && Math.random() < 0.15) this.trySpawnPassive(24, 56);
    if (this.isCreative() || hostile >= 8) return;
    const sunFactor = this.renderer.env ? this.renderer.env.sun : 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 26;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!world.isLoadedAt(x, z)) continue;
      const top = world.topSolidY(x, z);
      const y = Math.random() < 0.5 ? top + 1 : 4 + Math.floor(Math.random() * Math.max(1, top - 4));
      if (!SOLID[world.getBlock(x, y - 1, z)] || world.getBlock(x, y - 1, z) === B.BEDROCK) continue;
      const a0 = world.getBlock(x, y, z), a1 = world.getBlock(x, y + 1, z);
      if (SOLID[a0] || SOLID[a1] || IS_LIQUID[a0] || IS_LIQUID[a1]) continue;
      const light = world.getLight(x, y, z);
      if ((light >> 4) >= 7 || (light & 15) * sunFactor >= 7) continue;
      const type = Math.random() < 0.65 ? 'zombie' : 'creeper';
      this.entities.push(new Mob(this, type, x + 0.5, y, z + 0.5));
      break;
    }
  }

  // ------------------------------------------------------------------ explosions
  explode(x, y, z, power, source) {
    const world = this.world;
    this.playSoundAt('explode', x, y, z, 1.6);
    this.particles.explosion(x, y, z, power);
    const r = Math.ceil(power);
    const cells = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > power * (0.75 + Math.random() * 0.35)) continue;
          const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
          const id = world.getBlock(bx, by, bz);
          if (id === B.AIR || IS_LIQUID[id]) continue;
          const b = blocks[id];
          if (b.hardness < 0 || b.hardness >= 50) continue;
          cells.push([bx, by, bz, id]);
        }
    for (const [bx, by, bz, id] of cells) {
      if (world.getBlock(bx, by, bz) !== id) continue;
      if (id === B.TNT) {
        world.setBlock(bx, by, bz, B.AIR);
        this.entities.push(new PrimedTnt(this, bx, by, bz, 0.5 + Math.random()));
        continue;
      }
      const be = world.getBlockEntity(bx, by, bz);
      if (be) this.dropContainer(be, bx, by, bz);
      world.setBlock(bx, by, bz, B.AIR);
      this.markUrgent(bx, bz);
      if (!this.isCreative() && Math.random() < 1 / power) {
        const b = blocks[id];
        const stacks = b.drops ? b.drops(Math.random) : [[id, 1]];
        for (const [sid, n] of stacks) if (n > 0) this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, { id: sid, count: n });
      }
    }
    // Dégâts et projection
    const reachR = power * 2;
    const hurt = (e, isPlayer) => {
      const cx = e.x, cy = e.y + e.h / 2, cz = e.z;
      const d = Math.hypot(cx - x, cy - y, cz - z);
      if (d > reachR) return;
      const impact = 1 - d / reachR;
      const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * reachR + 1);
      const k = (impact * 14) / (d || 1);
      e.vx += (cx - x) * k; e.vy += (cy - y) * k + impact * 4; e.vz += (cz - z) * k;
      if (isPlayer) e.damage(dmg, null, 'explosion');
      else if (e.damage) e.damage(dmg, e === source ? 'explosion_self' : null);
    };
    hurt(this.player, true);
    for (const e of this.entities) if (e !== source && !e.dead) hurt(e, false);
  }

  // ------------------------------------------------------------------ événements joueur
  onPlayerHurt(cause) {
    this.playSound('hurt', 0.8);
    this.ui.flashHurt();
  }

  onPlayerDeath(cause) {
    const p = this.player;
    const msgs = {
      fall: 'est tombé de trop haut', lava: 'a essayé de nager dans la lave', drown: 's’est noyé',
      explosion: 'a explosé', cactus: 's’est piqué à mort', starve: 'est mort de faim', mob: 'a été tué par un monstre',
      kill: 'a quitté ce monde',
    };
    const msg = 'Le joueur ' + (msgs[cause] || 'est mort');
    if (!this.isCreative()) {
      for (let i = 0; i < p.inventory.slots.length; i++) {
        const s = p.inventory.slots[i];
        if (s) { const e = this.dropItem(p.x, p.y + 1, p.z, s, 2); if (e) { e.vx *= 2; e.vz *= 2; } }
      }
      p.inventory.clear();
    }
    this.state = 'dead';
    this.breaking = null;
    this.input.releaseAll();
    this.ui.intentionalUnlock = true;
    this.input.exitLock();
    this.ui.showDeath(msg);
    this.chat(msg);
  }

  respawn() {
    const p = this.player;
    p.respawn();
    const world = this.world;
    // S'assure que le point de réapparition est dégagé
    world.updateLoading(p.x, p.z, 2, 200);
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    if (SOLID[world.getBlock(bx, by, bz)] || SOLID[world.getBlock(bx, by + 1, bz)]) {
      const spot = this.findSafeSpot(bx, bz);
      p.x = spot.x; p.y = spot.y; p.z = spot.z;
    }
    this.state = 'playing';
    this.ui.hideOverlays();
    if (!this.touch) this.input.requestLock();
  }

  // ------------------------------------------------------------------ sons
  playSound(name, vol = 1, pan = 0, pitch = 1) {
    this.audio.play(name, vol, pan, pitch);
  }

  playSoundAt(name, x, y, z, vol = 1) {
    const p = this.player;
    const dx = x - p.x, dy = y - p.eyeY, dz = z - p.z;
    const d = Math.hypot(dx, dy, dz);
    const v = vol * Math.max(0, 1 - d / 20);
    if (v <= 0.01) return;
    const right = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    const pan = d > 0.5 ? (dx * right[0] + dz * right[1]) / d : 0;
    this.audio.play(name, v, pan * 0.8);
  }

  // ------------------------------------------------------------------ rendu
  render() {
    const p = this.player;
    const world = this.world;
    const cam = { x: p.x, y: p.eyeY, z: p.z, yaw: p.yaw, pitch: p.pitch, fov: this.fov };
    let bobX = 0, bobY = 0;
    if (this.settings.viewBobbing && p.bobAmount > 0.01) {
      const b = p.bob * Math.PI * 0.5;
      bobY = -Math.abs(Math.sin(b)) * 0.07 * p.bobAmount;
      bobX = Math.sin(b) * 0.035 * p.bobAmount;
      cam.x += Math.cos(p.yaw) * bobX;
      cam.z -= Math.sin(p.yaw) * bobX;
      cam.y += bobY;
    }
    const headId = world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    const fluid = headId === B.WATER ? 'water' : headId === B.LAVA ? 'lava' : null;
    const entities = [];
    for (const e of this.entities) entities.push(e.render());
    const l = world.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const light = [(l & 15) / 15, (l >> 4) / 15];
    const held = p.inventory.held;
    let crack = -1;
    if (this.breaking && this.breaking.progress > 0) crack = Math.min(9, Math.floor(this.breaking.progress * 10));
    this.renderer.render({
      cam, world, time: this.clock, dayTime: this.dayTime, renderDistance: this.settings.renderDistance,
      fluid, target: this.target && this.state !== 'dead' ? this.target : null, crack,
      entities, particles: this.particles.list, particleLight: light, clouds: this.settings.clouds,
      hand: this.ui && this.ui.hudVisible ? {
        itemId: held ? held.id : null, swing: this.swingTime >= 1 ? 0 : this.swingTime, equip: this.equip, light,
        bobX: bobX * 0.6, bobY: bobY * 0.6,
      } : null,
    });
    this.cameraFluid = fluid;
  }

  debugInfo() {
    const p = this.player;
    const w = this.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    w.gen.column(bx, bz);
    const l = w.getLight(bx, Math.floor(p.eyeY), bz);
    const dirs = ['Nord (-Z)', 'Ouest (-X)', 'Sud (+Z)', 'Est (+X)'];
    const yawN = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = dirs[Math.round(yawN / (Math.PI / 2)) % 4];
    const t = this.target;
    return [
      `MCweb — ${this.fps} i/s`,
      `XYZ : ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Bloc : ${bx} ${by} ${bz}   Chunk : ${bx >> 4} ${bz >> 4}`,
      `Orientation : ${facing}`,
      `Biome : ${BIOME_NAMES[w.gen.biome]}`,
      `Lumière : ciel ${l & 15}, blocs ${l >> 4}`,
      `Heure : ${Math.floor(this.dayTime)} (${this.isDay() ? 'jour' : 'nuit'})`,
      `Chunks : ${w.chunks.size} chargés, ${this.renderer.stats.chunks} affichés, ${(this.renderer.stats.quads / 1000).toFixed(1)}k faces`,
      `Entités : ${this.entities.length}   Particules : ${this.particles.list.length}`,
      `Graine : ${w.seed}`,
      t ? `Bloc visé : ${blocks[t.id]?.name} (${t.x}, ${t.y}, ${t.z})` : '',
    ].filter(Boolean);
  }

  // ------------------------------------------------------------------ discussion et commandes
  chat(msg) {
    if (this.ui) this.ui.addChat(msg);
  }

  runCommand(text) {
    text = text.trim();
    if (!text) return;
    if (!text.startsWith('/')) { this.chat('<Joueur> ' + text); return; }
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    const p = this.player;
    const num = (v, base) => {
      if (v === undefined) return NaN;
      if (v.startsWith('~')) return base + (v.length > 1 ? parseFloat(v.slice(1)) : 0);
      return parseFloat(v);
    };
    switch (cmd.toLowerCase()) {
      case 'help':
      case 'aide':
        this.chat('Commandes : /gamemode <survie|creatif>, /time set <jour|nuit|midi|minuit|n>, /tp x y z, /give <objet> [n], /summon <creature>, /kill, /spawnpoint, /seed, /clear, /daylight <on|off>');
        break;
      case 'gamemode':
      case 'gm': {
        const a = (args[0] || '').toLowerCase();
        if (['creative', 'creatif', 'créatif', 'c', '1'].includes(a)) this.gamemode = GAMEMODE.CREATIVE;
        else if (['survival', 'survie', 's', '0'].includes(a)) { this.gamemode = GAMEMODE.SURVIVAL; p.flying = false; }
        else { this.chat('Usage : /gamemode <survie|creatif>'); break; }
        this.chat('Mode de jeu : ' + (this.isCreative() ? 'Créatif' : 'Survie'));
        break;
      }
      case 'time': {
        const v = (args[1] || '').toLowerCase();
        const named = { day: 1000, jour: 1000, noon: 6000, midi: 6000, night: 13000, nuit: 13000, midnight: 18000, minuit: 18000 };
        if (args[0] === 'set') {
          const t = named[v] ?? parseInt(v, 10);
          if (Number.isNaN(t)) { this.chat('Usage : /time set <jour|nuit|midi|minuit|nombre>'); break; }
          this.dayTime = ((t % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
        } else if (args[0] === 'add') this.dayTime = (this.dayTime + (parseInt(v, 10) || 0)) % DAY_LENGTH;
        else { this.chat('Usage : /time set <valeur>'); break; }
        this.chat('Heure réglée sur ' + Math.floor(this.dayTime));
        break;
      }
      case 'daylight':
        if (this.meta) this.meta.frozenTime = (args[0] || '').toLowerCase() === 'off';
        this.chat('Cycle jour/nuit ' + (this.meta?.frozenTime ? 'arrêté' : 'actif'));
        break;
      case 'tp':
      case 'teleport': {
        const x = num(args[0], p.x), y = num(args[1], p.y), z = num(args[2], p.z);
        if ([x, y, z].some(Number.isNaN)) { this.chat('Usage : /tp x y z'); break; }
        p.x = x; p.y = clamp(y, 0, 200); p.z = z; p.vx = p.vy = p.vz = 0; p.fallDist = 0;
        this.chat(`Téléporté en ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`);
        break;
      }
      case 'give': {
        const it = findItemByKey(args[0] || '');
        if (!it) { this.chat('Objet inconnu. Exemple : /give diamond 5'); break; }
        const n = Math.max(1, Math.min(64 * 36, parseInt(args[1], 10) || 1));
        let left = n;
        while (left > 0) {
          const k = Math.min(left, it.maxStack);
          const rest = p.inventory.add({ id: it.id, count: k, dmg: 0 });
          if (rest > 0) { this.dropItem(p.x, p.y + 1, p.z, { id: it.id, count: rest }); }
          left -= k;
        }
        this.chat(`Donné ${n} × ${it.name}`);
        break;
      }
      case 'summon': {
        const type = (args[0] || '').toLowerCase();
        const fr = { cochon: 'pig', vache: 'cow', mouton: 'sheep', poulet: 'chicken' };
        const t = fr[type] || type;
        if (!MOB_TYPES.includes(t)) { this.chat('Créatures : pig, cow, sheep, chicken, zombie, creeper'); break; }
        const d = lookVector(p.yaw, 0);
        this.entities.push(new Mob(this, t, p.x + d[0] * 3, p.y + 0.5, p.z + d[2] * 3));
        this.chat('Créature invoquée : ' + t);
        break;
      }
      case 'kill':
        if (this.isCreative()) { this.chat('Impossible en mode créatif'); break; }
        p.invuln = 0;
        p.damage(1000, null, 'kill');
        break;
      case 'spawnpoint':
        p.spawn = { x: p.x, y: p.y, z: p.z };
        this.chat('Point d’apparition défini ici.');
        break;
      case 'seed':
        this.chat('Graine : ' + this.world.seed + (this.meta?.seedText ? ` (« ${this.meta.seedText} »)` : ''));
        break;
      case 'clear':
        p.inventory.clear();
        this.chat('Inventaire vidé.');
        break;
      default:
        this.chat('Commande inconnue. Tapez /help');
    }
  }
}

export function newChest() {
  return { type: 'chest', slots: new Array(27).fill(null) };
}

export function newFurnace() {
  return { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}

