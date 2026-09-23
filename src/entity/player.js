// Le joueur : déplacements, nage, vol, santé, faim, air et inventaire.
import { moveEntity, entityLiquid, boxCollides } from './physics.js';
import { Inventory } from '../inventory.js';
import { B, SOLID, blocks } from '../blocks.js';

const GRAVITY = 28;
const WALK = 4.317, SPRINT = 5.612, SNEAK = 1.31, FLY = 10.9, FLY_SPRINT = 21.6;

export class Player {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 80; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.6; this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.collidedX = false; this.collidedZ = false;
    this.flying = false;
    this.sneaking = false;
    this.sprinting = false;
    this.inWater = false; this.inLava = false; this.headInWater = false; this.headInLava = false;
    this.health = 20; this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 300;
    this.fallDist = 0;
    this.invuln = 0;
    this.hurtTime = 0;
    this.dead = false;
    this.inventory = new Inventory();
    this.spawn = { x: 0.5, y: 80, z: 0.5 };
    this.regenTimer = 0; this.starveTimer = 0; this.drownTimer = 0; this.lavaTimer = 0;
    this.stepDist = 0;
    this.bob = 0; this.bobAmount = 0;
    this.eyeOffset = 1.62;
    this.lastHurtBy = null;
  }

  get eyeY() { return this.y + this.eyeOffset; }

  get creative() { return this.game.isCreative(); }

  update(dt, input) {
    const world = this.game.world;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    if (this.dead) return;
    if (!world.isLoadedAt(this.x, this.z)) return;

    const liquid = entityLiquid(world, this);
    this.inWater = liquid === B.WATER;
    this.inLava = liquid === B.LAVA;
    const headId = world.getBlock(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
    this.headInWater = headId === B.WATER;
    this.headInLava = headId === B.LAVA;

    if (!this.creative) this.flying = false;
    this.sneaking = input.sneak && !this.flying;
    const moving = Math.abs(input.forward) > 0.01 || Math.abs(input.strafe) > 0.01;
    if (input.sprint && input.forward > 0.5 && !this.sneaking && (this.food > 6 || this.creative)) this.sprinting = true;
    if (!moving || input.forward <= 0 || this.sneaking || this.collidedX || this.collidedZ) this.sprinting = false;

    let speed = this.flying ? (this.sprinting ? FLY_SPRINT : FLY) : this.sneaking ? SNEAK : this.sprinting ? SPRINT : WALK;
    if (!this.flying) {
      if (this.inLava) speed *= 0.35;
      else if (this.inWater) speed *= 0.55;
    }

    // Direction voulue dans le plan
    let f = input.forward, s = input.strafe;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = -sin * f + cos * s;
    const wz = -cos * f - sin * s;
    const accel = this.flying ? 9 : this.onGround ? 16 : this.inWater || this.inLava ? 7 : 2.8;
    const k = Math.min(1, accel * dt);
    this.vx += (wx * speed - this.vx) * k;
    this.vz += (wz * speed - this.vz) * k;

    // Mouvement vertical
    if (this.flying) {
      const tvy = ((input.jump ? 1 : 0) - (input.sneak ? 1 : 0)) * 8;
      this.vy += (tvy - this.vy) * Math.min(1, 10 * dt);
    } else if (this.inWater || this.inLava) {
      this.vy -= (this.inLava ? 5 : 8) * dt;
      this.vy *= Math.pow(0.25, dt);
      if (input.jump) {
        this.vy = Math.min(this.vy + 32 * dt, this.inLava ? 2 : 3.4);
        if (this.collidedX || this.collidedZ) this.vy = Math.max(this.vy, 5);
      }
      if (this.vy < -4) this.vy = -4;
    } else {
      this.vy -= GRAVITY * dt;
      if (this.vy < -60) this.vy = -60;
      if (input.jump && this.onGround) this.jump(wx, wz);
    }

    // Saut automatique (utile sur mobile)
    if (this.game.settings.autoJump && this.onGround && !this.flying && moving && !this.sneaking) {
      const hl = Math.hypot(this.vx, this.vz);
      if (hl > 0.5) {
        const ax = this.x + (this.vx / hl) * 0.55, az = this.z + (this.vz / hl) * 0.55;
        const fx = Math.floor(ax), fz = Math.floor(az), fy = Math.floor(this.y + 0.01);
        if (SOLID[world.getBlock(fx, fy, fz)] && !SOLID[world.getBlock(fx, fy + 1, fz)] && !SOLID[world.getBlock(fx, fy + 2, fz)] &&
          !SOLID[world.getBlock(Math.floor(this.x), fy + 2, Math.floor(this.z))]) this.jump(wx, wz);
      }
    }

    let dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
    // Accroupi : ne tombe pas des rebords
    if (this.sneaking && this.onGround) {
      const hw = this.w / 2;
      const ground = (ox, oz) => boxCollides(world, this.x - hw + ox, this.y - 0.6, this.z - hw + oz, this.x + hw + ox, this.y - 0.001, this.z + hw + oz);
      const step = 0.02;
      while (dx !== 0 && !ground(dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      while (dz !== 0 && !ground(0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      while (dx !== 0 && dz !== 0 && !ground(dx, dz)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
      if (dt > 0) { this.vx = dx / dt; this.vz = dz / dt; }
    }
    const prevVy = this.vy;
    const ox = this.x, oz = this.z;
    moveEntity(world, this, dx, dy, dz);
    if (this.flying && this.onGround) this.flying = false;

    // Chutes
    if (!this.onGround && prevVy < 0 && !this.inWater && !this.flying) this.fallDist += -dy;
    if (this.onGround) {
      if (this.fallDist > 3.2) {
        this.damage(Math.ceil(this.fallDist - 3), null, 'fall');
        this.game.playSound('fall', 0.8);
      }
      this.fallDist = 0;
    }
    if (this.inWater || this.flying || this.inLava) this.fallDist = 0;

    // Pas et balancement de la vue
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (this.onGround && !this.flying) {
      this.stepDist += moved;
      if (this.stepDist > (this.sprinting ? 2.2 : 1.7)) {
        this.stepDist = 0;
        const under = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z));
        if (under) this.game.playSound('step_' + (blocks[under]?.sound || 'stone'), 0.25);
      }
      if (this.sprinting) this.exhaustion += moved * 0.1;
    } else if (this.inWater) this.exhaustion += moved * 0.01;
    const bobTarget = this.onGround && !this.flying ? Math.min(1, Math.hypot(this.vx, this.vz) / WALK) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, dt * 10);
    this.bob += moved * 2.4;
    const eyeTarget = this.sneaking ? 1.5 : 1.62;
    this.eyeOffset += (eyeTarget - this.eyeOffset) * Math.min(1, dt * 14);
  }

  jump(wx, wz) {
    this.vy = 8.6;
    if (this.sprinting) {
      this.vx += wx * 2.2;
      this.vz += wz * 2.2;
      this.exhaustion += 0.2;
    } else this.exhaustion += 0.05;
  }

  // Appelé 20 fois par seconde : faim, régénération, noyade, lave.
  tick() {
    if (this.dead) return;
    const world = this.game.world;
    if (this.headInWater && !this.creative) {
      this.air--;
      if (this.air <= -20) { this.air = 0; this.damage(2, null, 'drown'); }
    } else this.air = Math.min(300, this.air + 4);

    if (this.inLava && !this.creative) {
      this.lavaTimer--;
      if (this.lavaTimer <= 0) { this.lavaTimer = 10; this.damage(4, null, 'lava'); }
    }
    // Cactus
    if (!this.creative) {
      const hw = this.w / 2 + 0.05;
      let touching = false;
      for (let y = Math.floor(this.y); y <= Math.floor(this.y + this.h); y++)
        for (let z = Math.floor(this.z - hw); z <= Math.floor(this.z + hw); z++)
          for (let x = Math.floor(this.x - hw); x <= Math.floor(this.x + hw); x++)
            if (world.getBlock(x, y, z) === B.CACTUS) touching = true;
      if (touching) this.damage(1, null, 'cactus');
    }

    if (this.creative) { this.health = 20; this.food = 20; return; }
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    if (this.food >= 18 && this.health < 20) {
      if (++this.regenTimer >= 80) { this.health = Math.min(20, this.health + 1); this.exhaustion += 6; this.regenTimer = 0; }
    } else this.regenTimer = 0;
    if (this.food <= 0) {
      if (++this.starveTimer >= 80) { if (this.health > 1) this.damage(1, null, 'starve'); this.starveTimer = 0; }
    } else this.starveTimer = 0;
  }

  damage(amount, source, cause = 'mob') {
    if (this.creative || this.dead || this.invuln > 0 || amount <= 0) return false;
    this.health -= amount;
    this.invuln = 0.5;
    this.hurtTime = 0.4;
    this.exhaustion += 0.1;
    if (source && source.x !== undefined) {
      const dx = this.x - source.x, dz = this.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx += (dx / d) * 6;
      this.vz += (dz / d) * 6;
      this.vy = Math.max(this.vy, 5);
    }
    this.lastHurtBy = cause;
    this.game.onPlayerHurt(cause);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath(cause);
    }
    return true;
  }

  eat(food) {
    this.food = Math.min(20, this.food + food);
    this.saturation = Math.min(this.food, this.saturation + food * 0.6);
  }

  respawn() {
    this.dead = false;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.air = 300;
    this.fallDist = 0;
    this.vx = this.vy = this.vz = 0;
    this.x = this.spawn.x; this.y = this.spawn.y; this.z = this.spawn.z;
  }

  toJSON() {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch,
      health: this.health, food: this.food, saturation: this.saturation, air: this.air,
      flying: this.flying, spawn: this.spawn, inventory: this.inventory.toJSON(), dead: this.dead,
    };
  }

  load(d) {
    if (!d) return;
    Object.assign(this, {
      x: d.x, y: d.y, z: d.z, yaw: d.yaw || 0, pitch: d.pitch || 0,
      health: d.health ?? 20, food: d.food ?? 20, saturation: d.saturation ?? 5, air: d.air ?? 300,
      flying: !!d.flying, spawn: d.spawn || this.spawn,
    });
    this.inventory.load(d.inventory);
    if (d.dead || this.health <= 0) this.respawn();
  }
}

