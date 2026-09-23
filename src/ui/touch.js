// Commandes tactiles : joystick, glisser pour regarder, appui court = utiliser, appui long = miner.
import { GAMEMODE } from '../constants.js';

const HOLD_DELAY = 300;
const TAP_MOVE = 12;
const LOOK_GAIN = 1.9;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    this.joyId = null;
    this.looks = new Map();
    this.lastJump = 0;

    this.bindJoystick();
    this.bindHold('t-jump', (on) => {
      this.input.virtual.jump = on;
      if (on) {
        const now = performance.now();
        if (now - this.lastJump < 300 && game.gamemode === GAMEMODE.CREATIVE) game.player.flying = !game.player.flying;
        this.lastJump = now;
      }
    });
    this.bindHold('t-sneak', (on) => { this.input.virtual.sneak = on; });
    this.bindTap('t-pause', () => game.pause());
    this.bindTap('t-inv', () => { if (game.state === 'playing') game.openScreen(game.isCreative() ? 'creative' : 'inventory'); });
    this.bindTap('t-chat', () => { if (game.state === 'playing') game.openChat('/'); });
    this.bindTap('t-drop', () => { if (game.state === 'playing') game.dropHeld(false); });
    this.bindLook(game.canvas);
  }

  bindTap(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.game.audio.unlock(); fn(); });
  }

  bindHold(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add('active');
      fn(true);
    });
    const up = () => { el.classList.remove('active'); fn(false); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  bindJoystick() {
    const joy = this.joy;
    const v = this.input.virtual;
    const update = (e) => {
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const max = r.width / 2;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / max, ny = dy / max;
      v.strafe = Math.abs(nx) > 0.15 ? nx : 0;
      v.forward = Math.abs(ny) > 0.15 ? -ny : 0;
      v.sprint = -ny > 0.92;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.game.audio.unlock();
      this.joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      update(e);
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) update(e); });
    const end = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.knob.style.transform = '';
      v.forward = v.strafe = 0;
      v.sprint = false;
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
  }

  bindLook(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.game.audio.unlock();
      canvas.setPointerCapture(e.pointerId);
      const t = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, start: performance.now(), moved: false, holding: false };
      t.timer = setTimeout(() => {
        if (!t.moved) { t.holding = true; this.game.touchBreak = true; }
      }, HOLD_DELAY);
      this.looks.set(e.pointerId, t);
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = this.looks.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;
      if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > TAP_MOVE) t.moved = true;
      if (this.game.state === 'playing') {
        this.input.dx += dx * LOOK_GAIN;
        this.input.dy += dy * LOOK_GAIN;
      }
    });
    const end = (e) => {
      const t = this.looks.get(e.pointerId);
      if (!t) return;
      clearTimeout(t.timer);
      this.looks.delete(e.pointerId);
      if (t.holding) this.game.touchBreak = false;
      else if (!t.moved && performance.now() - t.start < HOLD_DELAY) this.game.touchTap();
      if (![...this.looks.values()].some((o) => o.holding)) this.game.touchBreak = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
}
