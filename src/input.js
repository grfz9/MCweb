// Clavier, souris et verrouillage du pointeur. Les touches utilisent event.code
// (position physique) : ZQSD sur AZERTY et WASD sur QWERTY fonctionnent tous les deux.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = [false, false, false];
    this.clicked = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.lockFailed = false;
    this.enabled = false; // vrai quand le jeu capte les commandes
    this.onLockChange = null;
    this.onKey = null; // (code, event) -> true si géré par l'interface
    this.lastSpace = 0;
    this.doubleSpace = false;
    this.lastForward = 0;
    this.doubleForward = false;
    // Entrées virtuelles (tactile)
    this.virtual = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };

    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.lockFailed) return;
      this.mouse[e.button] = true;
      this.clicked[e.button] = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || (this.lockFailed && (e.buttons & 4 || e.target === canvas))) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouse = [false, false, false];
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  keyDown(e) {
    const code = e.code;
    if (this.onKey && this.onKey(code, e)) return;
    if (!this.enabled) return;
    if (!this.keys.has(code)) {
      this.pressed.add(code);
      const now = performance.now();
      if (code === 'Space') {
        this.doubleSpace = now - this.lastSpace < 300;
        this.lastSpace = now;
      }
      if (code === 'KeyW' || code === 'ArrowUp') {
        this.doubleForward = now - this.lastForward < 300;
        this.lastForward = now;
      }
    }
    this.keys.add(code);
    if (['Space', 'Tab', 'F3', 'Slash', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft'].includes(code)) e.preventDefault();
    if (code.startsWith('Digit') && e.ctrlKey) e.preventDefault();
  }

  requestLock() {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.lockFailed = true; });
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Commandes de déplacement combinées (clavier + tactile).
  movement() {
    const k = this.keys;
    let forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    forward += this.virtual.forward;
    strafe += this.virtual.strafe;
    return {
      forward: Math.max(-1, Math.min(1, forward)),
      strafe: Math.max(-1, Math.min(1, strafe)),
      jump: k.has('Space') || this.virtual.jump,
      sneak: k.has('ShiftLeft') || k.has('ShiftRight') || this.virtual.sneak,
      sprint: k.has('ControlLeft') || k.has('ControlRight') || this.doubleForward || this.virtual.sprint,
    };
  }

  // À appeler en fin d'image.
  endFrame() {
    this.pressed.clear();
    this.clicked = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.doubleSpace = false;
    if (!this.keys.has('KeyW') && !this.keys.has('ArrowUp')) this.doubleForward = false;
  }

  releaseAll() {
    this.keys.clear();
    this.mouse = [false, false, false];
    this.virtual.forward = this.virtual.strafe = 0;
    this.virtual.jump = this.virtual.sneak = this.virtual.sprint = false;
  }
}
