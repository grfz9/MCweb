// Entités : objets au sol, blocs qui tombent, TNT amorcée, créatures et particules.
import { moveEntity, entityLiquid } from './physics.js';
import { B, blocks, SOLID, REPLACEABLE, IS_LIQUID } from '../blocks.js';
import { I } from '../items.js';
import { T } from '../textures.js';
import { WOOL_INDEX } from '../blocks.js';

const GRAVITY = 28;

export class Entity {
  constructor(game, x, y, z) {
    this.game = game;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.6; this.h = 1.8;
    this.yaw = 0;
    this.onGround = false;
    this.collidedX = false; this.collidedZ = false;
    this.dead = false;
    this.age = 0;
    this.inWater = false;
    this.inLava = false;
  }

  get world() { return this.game.world; }

  physics(dt, gravity = GRAVITY) {
    const liquid = entityLiquid(this.world, this);
    this.inWater = liquid === B.WATER;
    this.inLava = liquid === B.LAVA;
    if (liquid) {
      this.vy -= gravity * 0.25 * dt;
      const damp = Math.pow(0.2, dt);
      this.vx *= damp; this.vz *= damp; this.vy *= Math.pow(0.35, dt);
    } else {
      this.vy -= gravity * dt;
      if (this.vy < -60) this.vy = -60;
    }
    moveEntity(this.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
  }

  // Lumière (ciel, blocs) normalisée au centre de l'entité.
  light() {
    const l = this.world.getLight(Math.floor(this.x), Math.floor(this.y + this.h * 0.5), Math.floor(this.z));
    return [(l & 15) / 15, (l >> 4) / 15];
  }

  distanceTo(x, y, z) {
    return Math.hypot(this.x - x, this.y - y, this.z - z);
  }
}

// ---------------------------------------------------------------------------
export class ItemEntity extends Entity {
  constructor(game, x, y, z, stack, pickupDelay = 0.5) {
    super(game, x, y, z);
    this.w = 0.25; this.h = 0.25;
    this.stack = stack;
    this.pickupDelay = pickupDelay;
    this.spin = Math.random() * Math.PI * 2;
    this.bob = Math.random() * Math.PI * 2;
    this.vx = (Math.random() - 0.5) * 2.5;
    this.vz = (Math.random() - 0.5) * 2.5;
    this.vy = 3 + Math.random() * 1.5;
  }

  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    this.spin += dt * 1.8;
    this.bob += dt * 2.6;
    this.physics(dt, 20);
    if (this.inWater) this.vy += 12 * dt; // flotte
    if (this.onGround) {
      const f = Math.pow(0.02, dt);
      this.vx *= f; this.vz *= f;
    }
    if (this.inLava) this.dead = true;
    if (this.age > 300 || this.y < -20) this.dead = true;
  }

  render() {
    return { kind: 'item', x: this.x, y: this.y, z: this.z, itemId: this.stack.id, count: this.stack.count, spin: this.spin, bob: this.bob, light: this.light() };
  }
}

// ---------------------------------------------------------------------------
export class FallingBlock extends Entity {
  constructor(game, x, y, z, blockId, meta) {
    super(game, x + 0.5, y, z + 0.5);
    this.w = 0.98; this.h = 0.98;
    this.blockId = blockId;
    this.meta = meta;
  }

  update(dt) {
    this.age += dt;
    this.physics(dt);
    this.vx = 0; this.vz = 0;
    if (this.onGround || this.age > 20) {
      this.dead = true;
      const bx = Math.floor(this.x), by = Math.round(this.y), bz = Math.floor(this.z);
      const cur = this.world.getBlock(bx, by, bz);
      if (cur === B.AIR || (REPLACEABLE[cur] && !SOLID[cur]) || IS_LIQUID[cur]) {
        this.world.setBlock(bx, by, bz, this.blockId, this.meta);
      } else {
        this.game.dropItem(this.x, this.y + 0.5, this.z, { id: this.blockId, count: 1 });
      }
    }
  }

  render() {
    return { kind: 'block', x: this.x, y: this.y, z: this.z, blockId: this.blockId, light: this.light() };
  }
}

// ---------------------------------------------------------------------------
export class PrimedTnt extends Entity {
  constructor(game, x, y, z, fuse = 4) {
    super(game, x + 0.5, y, z + 0.5);
    this.w = 0.98; this.h = 0.98;
    this.fuse = fuse;
    this.vy = 4;
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a) * 0.4; this.vz = Math.sin(a) * 0.4;
  }

  update(dt) {
    this.age += dt;
    this.physics(dt);
    if (this.onGround) { this.vx *= Math.pow(0.1, dt); this.vz *= Math.pow(0.1, dt); }
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.dead = true;
      this.game.explode(this.x, this.y + 0.5, this.z, 4, this);
    }
  }

  render() {
    const flash = (this.fuse * 4) % 1 < 0.5 ? 0.55 : 0;
    const scale = this.fuse < 0.4 ? 1 + (0.4 - this.fuse) * 0.4 : 1;
    return { kind: 'block', x: this.x, y: this.y, z: this.z, blockId: B.TNT, flash, scale, light: this.light() };
  }
}

// ---------------------------------------------------------------------------
const MOB_DEFS = {
  pig: { w: 0.9, h: 0.9, health: 10, speed: 1.3, hostile: false, drops: () => [[I.PORKCHOP, 1 + rnd(3)]], sound: 'pig' },
  cow: { w: 0.9, h: 1.4, health: 10, speed: 1.2, hostile: false, drops: () => [[I.BEEF, 1 + rnd(3)]], sound: 'cow' },
  sheep: { w: 0.9, h: 1.3, health: 8, speed: 1.2, hostile: false, drops: () => [[WOOL_INDEX.white, 1], [I.MUTTON, 1 + rnd(2)]], sound: 'sheep' },
  chicken: { w: 0.4, h: 0.7, health: 4, speed: 1.1, hostile: false, drops: () => [[I.CHICKEN, 1], [I.FEATHER, rnd(3)]], sound: 'chicken' },
  zombie: { w: 0.6, h: 1.95, health: 20, speed: 2.4, hostile: true, drops: () => [[I.ROTTEN_FLESH, rnd(3)]], sound: 'zombie' },
  creeper: { w: 0.6, h: 1.7, health: 20, speed: 2.1, hostile: true, drops: () => [[I.GUNPOWDER, rnd(3)]], sound: null },
};
export const MOB_TYPES = Object.keys(MOB_DEFS);
export const PASSIVE_MOBS = ['pig', 'cow', 'sheep', 'chicken'];
export const HOSTILE_MOBS = ['zombie', 'creeper'];

function rnd(n) { return Math.floor(Math.random() * n); }

export class Mob extends Entity {
  constructor(game, type, x, y, z) {
    super(game, x, y, z);
    const d = MOB_DEFS[type];
    this.type = type;
    this.def = d;
    this.w = d.w; this.h = d.h;
    this.health = d.health;
    this.hostile = d.hostile;
    this.yaw = Math.random() * Math.PI * 2;
    this.bodyYaw = this.yaw;
    this.headPitch = 0;
    this.walk = 0;
    this.walkAmount = 0;
    this.hurtTime = 0;
    this.invuln = 0;
    this.deathTime = 0;
    this.moveX = 0; this.moveZ = 0;
    this.wantJump = false;
    this.wanderTimer = Math.random() * 3;
    this.panic = 0;
    this.attackCooldown = 0;
    this.fuse = 0; // creeper
    this.fallDist = 0;
    this.burnTimer = 0;
    this.soundTimer = 5 + Math.random() * 10;
    this.flap = 0;
    this.lavaTimer = 0;
  }

  update(dt) {
    this.age += dt;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.deathTime > 0) {
      this.deathTime += dt;
      this.moveX = this.moveZ = 0;
      if (this.deathTime > 1) {
        this.dead = true;
        this.game.particles.poof(this.x, this.y + this.h / 2, this.z);
      }
    } else {
      this.ai(dt);
    }

    // Accélération vers la vitesse voulue
    const k = Math.min(1, dt * (this.onGround ? 10 : 2.5));
    this.vx += (this.moveX - this.vx) * k;
    this.vz += (this.moveZ - this.vz) * k;
    if (this.wantJump && (this.onGround || this.inWater)) {
      this.vy = this.inWater ? 4 : 8.4;
      this.wantJump = false;
    }
    const prevVy = this.vy;
    this.physics(dt, this.type === 'chicken' && !this.onGround ? 14 : GRAVITY);
    if (this.type === 'chicken' && !this.onGround && this.vy < -2.5) this.vy = -2.5;
    if (this.inWater && this.vy < 1.5) this.vy += 18 * dt; // les créatures nagent

    // Dégâts de chute
    if (!this.onGround && prevVy < 0 && !this.inWater) this.fallDist += -prevVy * dt;
    if (this.onGround) {
      if (this.fallDist > 3 && this.type !== 'chicken') this.damage(Math.ceil(this.fallDist - 3), null);
      this.fallDist = 0;
    }
    if (this.inWater) this.fallDist = 0;
    if (this.inLava) {
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) { this.damage(4, null); this.lavaTimer = 0.5; }
    }

    // Animation
    const sp = Math.hypot(this.vx, this.vz);
    this.walk += sp * dt * 4;
    this.walkAmount += (Math.min(1, sp / 1.5) - this.walkAmount) * Math.min(1, dt * 8);
    if (sp > 0.3 && this.deathTime === 0) {
      const target = Math.atan2(-this.vx, -this.vz);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 8);
    }
    if (this.type === 'chicken') this.flap = this.onGround ? 0 : Math.abs(Math.sin(this.age * 20)) * 1.2;

    // Sons d'ambiance
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      this.soundTimer = 8 + Math.random() * 16;
      if (this.def.sound && this.deathTime === 0) this.game.playSoundAt(this.def.sound, this.x, this.y, this.z);
    }
    if (this.y < -30) this.dead = true;
  }

  ai(dt) {
    const player = this.game.player;
    const world = this.world;
    const survival = !this.game.isCreative() && !player.dead;
    const dx = player.x - this.x, dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    const dy = player.y - this.y;

    // Les zombies brûlent au soleil
    if (this.type === 'zombie' && this.game.isDay() && !this.inWater) {
      const sky = world.getSkyLight(Math.floor(this.x), Math.floor(this.y + this.h), Math.floor(this.z));
      if (sky >= 14) {
        this.burnTimer -= dt;
        if (this.burnTimer <= 0) { this.damage(1, null); this.burnTimer = 1; }
      }
    }

    if (this.hostile && survival && dist < 20 && Math.abs(dy) < 8) {
      const speed = this.def.speed;
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      if (this.type === 'creeper') {
        if (dist < 3.2) {
          this.fuse += dt;
          this.moveX = this.moveZ = 0;
          if (this.fuse === dt) this.game.playSoundAt('fuse', this.x, this.y, this.z);
          if (this.fuse >= 1.5) {
            this.dead = true;
            this.game.explode(this.x, this.y + 0.8, this.z, 3, this);
            return;
          }
        } else {
          this.fuse = Math.max(0, this.fuse - dt);
          this.moveX = nx * speed; this.moveZ = nz * speed;
        }
      } else {
        this.moveX = nx * speed; this.moveZ = nz * speed;
        if (dist < 1.3 && Math.abs(dy) < 1.6 && this.attackCooldown <= 0) {
          this.attackCooldown = 1;
          player.damage(3, this);
        }
      }
      this.headPitch = Math.atan2(dy + 1.2 - this.h * 0.8, dist) * 0.8;
      if ((this.collidedX || this.collidedZ) && this.onGround) this.wantJump = true;
      return;
    }
    this.fuse = Math.max(0, this.fuse - dt);
    this.headPitch *= 0.9;

    // Errance / panique
    if (this.panic > 0) {
      this.panic -= dt;
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        const a = Math.atan2(this.z - player.z, this.x - player.x) + (Math.random() - 0.5) * 1.5;
        this.moveX = Math.cos(a) * this.def.speed * 2.2;
        this.moveZ = Math.sin(a) * this.def.speed * 2.2;
        this.wanderTimer = 0.8;
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        if (Math.random() < 0.45) {
          const a = Math.random() * Math.PI * 2;
          const s = this.def.speed * (this.hostile ? 0.6 : 1);
          this.moveX = Math.cos(a) * s;
          this.moveZ = Math.sin(a) * s;
          this.wanderTimer = 2 + Math.random() * 3;
        } else {
          this.moveX = this.moveZ = 0;
          this.wanderTimer = 2 + Math.random() * 5;
        }
      }
    }
    // Évite les falaises et la lave
    if ((this.moveX || this.moveZ) && this.onGround) {
      const len = Math.hypot(this.moveX, this.moveZ);
      const ax = Math.floor(this.x + (this.moveX / len) * (this.w / 2 + 0.4));
      const az = Math.floor(this.z + (this.moveZ / len) * (this.w / 2 + 0.4));
      const fy = Math.floor(this.y);
      let drop = 0;
      while (drop < 4 && !SOLID[world.getBlock(ax, fy - 1 - drop, az)] && !IS_LIQUID[world.getBlock(ax, fy - 1 - drop, az)]) drop++;
      const ahead = world.getBlock(ax, fy, az);
      if ((drop >= 4 && this.panic <= 0) || world.getBlock(ax, fy - 1, az) === B.LAVA || ahead === B.LAVA || ahead === B.CACTUS) {
        this.moveX = this.moveZ = 0;
        this.wanderTimer = 0.5;
      }
    }
    if ((this.collidedX || this.collidedZ) && this.onGround && (this.moveX || this.moveZ)) this.wantJump = true;
  }

  damage(amount, source) {
    if (this.deathTime > 0 || this.invuln > 0) return false;
    this.health -= amount;
    this.hurtTime = 0.35;
    this.invuln = 0.45;
    if (source) {
      const dx = this.x - source.x, dz = this.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx = (dx / d) * 7;
      this.vz = (dz / d) * 7;
      this.vy = 5.5;
      if (!this.hostile) { this.panic = 5; this.wanderTimer = 0; }
    }
    this.game.playSoundAt(this.hostile ? 'hurt_mob' : 'hurt_animal', this.x, this.y, this.z);
    if (this.health <= 0) {
      this.deathTime = 0.0001;
      if (source !== 'explosion_self') {
        for (const [id, n] of this.def.drops()) if (n > 0) this.game.dropItem(this.x, this.y + 0.4, this.z, { id, count: n });
      }
    }
    return true;
  }

  render() {
    let flash = 0;
    if (this.type === 'creeper' && this.fuse > 0) flash = (this.fuse * 8) % 1 < 0.5 ? 0.5 : 0;
    return {
      kind: 'mob', model: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw,
      walk: this.walk, walkAmount: this.walkAmount, headPitch: this.headPitch, headYaw: 0,
      hurt: this.hurtTime > 0 || this.deathTime > 0, death: this.deathTime * 2.2, flap: this.flap,
      scale: this.type === 'creeper' ? 1 + Math.min(this.fuse, 1.5) * 0.08 : 1, flash,
      light: this.light(),
    };
  }
}

// ---------------------------------------------------------------------------
export class Particles {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  add(p) {
    if (this.list.length < 1500) this.list.push(p);
  }

  blockBreak(x, y, z, blockId) {
    const b = blocks[blockId];
    if (!b) return;
    const layer = b.tex[4];
    for (let i = 0; i < 28; i++) {
      this.add({
        x: x + 0.1 + Math.random() * 0.8, y: y + 0.1 + Math.random() * 0.8, z: z + 0.1 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3.5, vz: (Math.random() - 0.5) * 3,
        life: 0.4 + Math.random() * 0.8, layer, u: Math.floor(Math.random() * 12) / 16, v: Math.floor(Math.random() * 12) / 16,
        us: 4 / 16, size: 0.06 + Math.random() * 0.05, gravity: 16, shade: 0.9,
      });
    }
  }

  digging(x, y, z, face, blockId) {
    const b = blocks[blockId];
    if (!b) return;
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face] || [0, 1, 0];
    for (let i = 0; i < 2; i++) {
      const px = x + 0.5 + n[0] * 0.52 + (n[0] ? 0 : (Math.random() - 0.5) * 0.9);
      const py = y + 0.5 + n[1] * 0.52 + (n[1] ? 0 : (Math.random() - 0.5) * 0.9);
      const pz = z + 0.5 + n[2] * 0.52 + (n[2] ? 0 : (Math.random() - 0.5) * 0.9);
      this.add({
        x: px, y: py, z: pz, vx: n[0] * 1.5 + (Math.random() - 0.5), vy: n[1] * 1.5 + Math.random(), vz: n[2] * 1.5 + (Math.random() - 0.5),
        life: 0.3 + Math.random() * 0.4, layer: b.tex[face] ?? b.tex[4], u: Math.floor(Math.random() * 12) / 16, v: Math.floor(Math.random() * 12) / 16,
        us: 4 / 16, size: 0.05, gravity: 16, shade: 0.85,
      });
    }
  }

  poof(x, y, z, count = 14, spread = 0.5, size = 0.12) {
    for (let i = 0; i < count; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * spread * 2, y: y + (Math.random() - 0.5) * spread * 2, z: z + (Math.random() - 0.5) * spread * 2,
        vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.2,
        life: 0.5 + Math.random() * 0.6, layer: T.snow, u: 0, v: 0, us: 1, size: size * (0.7 + Math.random() * 0.6),
        gravity: -1, shade: 0.55 + Math.random() * 0.4,
      });
    }
  }

  explosion(x, y, z, power) {
    this.poof(x, y, z, 40 + power * 10, power * 0.8, 0.35);
    for (let i = 0; i < 12; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * power, y: y + (Math.random() - 0.5) * power, z: z + (Math.random() - 0.5) * power,
        vx: 0, vy: 0.5, vz: 0, life: 0.25 + Math.random() * 0.2, layer: T.glowstone, u: 0, v: 0, us: 1,
        size: 0.8 + Math.random() * 0.8, gravity: 0, shade: 1,
      });
    }
  }

  update(dt) {
    const world = this.game.world;
    const out = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (SOLID[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        p.vx *= 0.3; p.vz *= 0.3; p.vy = 0;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      out.push(p);
    }
    this.list = out;
  }
}
