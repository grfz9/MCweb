// Sons synthétisés avec la Web Audio API (aucun fichier audio) + petite musique d'ambiance.

const MATERIALS = {
  stone: { type: 'bandpass', f: 1700, q: 0.9, d: 0.13, v: 0.55 },
  wood: { type: 'bandpass', f: 650, q: 1.6, d: 0.13, v: 0.7, thump: 140 },
  grass: { type: 'highpass', f: 2200, q: 0.5, d: 0.12, v: 0.4 },
  gravel: { type: 'bandpass', f: 1100, q: 0.6, d: 0.14, v: 0.55 },
  sand: { type: 'bandpass', f: 2600, q: 0.4, d: 0.12, v: 0.35 },
  glass: { type: 'highpass', f: 3500, q: 1, d: 0.2, v: 0.5, ring: 2600 },
  wool: { type: 'lowpass', f: 500, q: 0.4, d: 0.1, v: 0.45 },
  snow: { type: 'highpass', f: 3000, q: 0.3, d: 0.12, v: 0.3 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.music = true;
    this.musicTimer = 40;
    this.musicPlaying = false;
  }

  // Doit être appelé depuis un geste de l'utilisateur (clic, touche).
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.reverb = this.makeReverb();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  makeReverb() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2.5;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    conv.connect(g);
    g.connect(this.master);
    return conv;
  }

  out(vol, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noiseBurst(dest, { type, f, q, d }, t, gain = 1, pitch = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = pitch;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = f * pitch;
    filt.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(filt); filt.connect(env); env.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + d + 0.05);
  }

  tone(dest, { wave = 'sine', f0, f1 = f0, d, gain = 0.5, t, attack = 0.01, lp = 0, vib = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    if (vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = vib;
      lg.gain.value = f0 * 0.04;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + d + 0.05);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(env);
    env.connect(dest);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  // name : 'dig_stone', 'place_wood', 'step_grass', 'pop', 'hurt', 'explode', ...
  play(name, vol = 1, pan = 0, pitch = 1) {
    if (!this.ctx || this.volume <= 0 || vol <= 0.001) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const dest = this.out(vol, pan);
    const [kind, mat] = name.split('_');
    const m = MATERIALS[mat] || MATERIALS.stone;
    const rp = pitch * (0.9 + Math.random() * 0.2);
    switch (kind) {
      case 'dig':
      case 'break':
        this.noiseBurst(dest, m, t, m.v, rp);
        if (kind === 'break') this.noiseBurst(dest, { ...m, d: m.d * 1.8 }, t + 0.03, m.v * 0.8, rp * 0.8);
        if (m.thump) this.tone(dest, { f0: m.thump, f1: m.thump * 0.6, d: 0.1, gain: 0.35, t });
        if (m.ring) this.tone(dest, { f0: m.ring * rp, f1: m.ring * 1.3, d: 0.25, gain: 0.12, t });
        return;
      case 'place':
        this.noiseBurst(dest, { ...m, d: m.d * 0.8 }, t, m.v * 0.8, rp * 0.8);
        if (m.thump) this.tone(dest, { f0: m.thump * 1.2, f1: m.thump * 0.7, d: 0.08, gain: 0.3, t });
        return;
      case 'step':
        this.noiseBurst(dest, { ...m, d: 0.07 }, t, m.v * 0.6, rp);
        return;
    }
    switch (name) {
      case 'pop':
        this.tone(dest, { f0: 500 * rp, f1: 1100 * rp, d: 0.09, gain: 0.25, t });
        break;
      case 'click':
        this.tone(dest, { wave: 'square', f0: 900, f1: 700, d: 0.05, gain: 0.08, t });
        break;
      case 'hurt':
        this.tone(dest, { wave: 'sawtooth', f0: 260, f1: 140, d: 0.18, gain: 0.35, t, lp: 900 });
        this.noiseBurst(dest, MATERIALS.wool, t, 0.3);
        break;
      case 'hurt_mob':
        this.tone(dest, { wave: 'sawtooth', f0: 150 * rp, f1: 80, d: 0.25, gain: 0.35, t, lp: 700 });
        break;
      case 'hurt_animal':
        this.tone(dest, { wave: 'triangle', f0: 700 * rp, f1: 420, d: 0.18, gain: 0.3, t, vib: 18 });
        break;
      case 'pig':
        for (let i = 0; i < 2; i++) this.tone(dest, { wave: 'sawtooth', f0: 210 * rp, f1: 160 * rp, d: 0.14, gain: 0.25, t: t + i * 0.18, lp: 800, vib: 30 });
        break;
      case 'cow':
        this.tone(dest, { wave: 'sawtooth', f0: 125 * rp, f1: 95 * rp, d: 0.9, gain: 0.3, t, lp: 450, attack: 0.08, vib: 5 });
        break;
      case 'sheep':
        this.tone(dest, { wave: 'sawtooth', f0: 330 * rp, f1: 300 * rp, d: 0.55, gain: 0.22, t, lp: 1400, attack: 0.03, vib: 22 });
        break;
      case 'chicken':
        for (let i = 0; i < 3; i++) this.tone(dest, { wave: 'triangle', f0: 1000 * rp, f1: 750 * rp, d: 0.06, gain: 0.18, t: t + i * 0.09 });
        break;
      case 'zombie':
        this.tone(dest, { wave: 'sawtooth', f0: 95 * rp, f1: 70 * rp, d: 1.1, gain: 0.35, t, lp: 380, attack: 0.1, vib: 4 });
        break;
      case 'fuse':
        this.noiseBurst(dest, { type: 'highpass', f: 3000, q: 0.5, d: 1.5 }, t, 0.25);
        break;
      case 'explode':
        this.noiseBurst(dest, { type: 'lowpass', f: 500, q: 0.3, d: 1.8 }, t, 1.0, 0.6);
        this.noiseBurst(dest, { type: 'lowpass', f: 1600, q: 0.3, d: 0.5 }, t, 0.7);
        this.tone(dest, { f0: 70, f1: 30, d: 1.0, gain: 0.8, t });
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noiseBurst(dest, { type: 'bandpass', f: 1400, q: 1.2, d: 0.08 }, t + i * 0.11, 0.35, rp);
        break;
      case 'burp':
        this.tone(dest, { wave: 'sawtooth', f0: 170, f1: 110, d: 0.35, gain: 0.25, t, lp: 600, vib: 12 });
        break;
      case 'splash':
        this.noiseBurst(dest, { type: 'bandpass', f: 900, q: 0.5, d: 0.5 }, t, 0.4);
        break;
      case 'fall':
        this.noiseBurst(dest, { type: 'lowpass', f: 300, q: 0.5, d: 0.25 }, t, 0.7);
        break;
      case 'ignite':
        this.noiseBurst(dest, { type: 'highpass', f: 4000, q: 0.5, d: 0.15 }, t, 0.35);
        break;
      case 'furnace':
        this.noiseBurst(dest, { type: 'lowpass', f: 700, q: 0.3, d: 0.6 }, t, 0.15);
        break;
      case 'chest':
        this.tone(dest, { wave: 'triangle', f0: 180, f1: 120, d: 0.25, gain: 0.25, t, lp: 800 });
        this.noiseBurst(dest, MATERIALS.wood, t, 0.3, 0.7);
        break;
    }
  }

  // Musique douce générative, jouée de temps en temps.
  update(dt) {
    if (!this.ctx || !this.music || this.musicPlaying) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 120 + Math.random() * 180;
    this.playMusic();
  }

  playMusic() {
    const ctx = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const roots = [48, 53, 55, 50];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const out = ctx.createGain();
    out.gain.value = 0.16;
    out.connect(this.master);
    out.connect(this.reverb);
    let t = ctx.currentTime + 0.5;
    const bars = 8;
    this.musicPlaying = true;
    for (let b = 0; b < bars; b++) {
      const chordRoot = root + [0, 5, -3, 7][b % 4];
      this.pianoNote(out, chordRoot - 12, t, 3.2, 0.5);
      this.pianoNote(out, chordRoot + 7 - 12, t + 0.05, 3, 0.3);
      let nt = t;
      const notes = 2 + Math.floor(Math.random() * 4);
      for (let n = 0; n < notes; n++) {
        const note = chordRoot + 12 + scale[Math.floor(Math.random() * scale.length)];
        nt += 0.4 + Math.floor(Math.random() * 3) * 0.4;
        if (nt > t + 3.2) break;
        this.pianoNote(out, note, nt, 2.2, 0.35 + Math.random() * 0.2);
      }
      t += 3.6;
    }
    setTimeout(() => { this.musicPlaying = false; }, (t - ctx.currentTime + 3) * 1000);
  }

  pianoNote(dest, midi, t, d, gain) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const ctx = this.ctx;
    for (const [mult, g] of [[1, 1], [2, 0.3], [3, 0.1]]) {
      const o = ctx.createOscillator();
      o.type = mult === 1 ? 'triangle' : 'sine';
      o.frequency.value = f * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain * g, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(env);
      env.connect(dest);
      o.start(t);
      o.stop(t + d + 0.1);
    }
  }
}
