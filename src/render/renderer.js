// Moteur de rendu WebGL2 : terrain, ciel, nuages, entités, particules et main du joueur.
import * as M from '../math.js';
import { buildTiles, TILE_NAMES, T } from '../textures.js';
import { buildChunkMesh } from './mesher.js';
import * as S from './shaders.js';
import { MOB_MODELS, buildMobMeshes, itemMesh, unitCubeMesh, armMesh, blockCubeMesh } from './models.js';
import { Simplex } from '../noise.js';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error('Erreur de shader : ' + log);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Erreur de liaison : ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.canvas = canvas;
    this.resolution = 1;
    this.gamma = 0.5;
    this.stats = { chunks: 0, quads: 0 };

    this.chunkProg = program(gl, S.CHUNK_VS, S.CHUNK_FS);
    this.skyProg = program(gl, S.SKY_VS, S.SKY_FS);
    this.cloudProg = program(gl, S.CLOUD_VS, S.CLOUD_FS);
    this.lineProg = program(gl, S.LINE_VS, S.LINE_FS);
    this.modelProg = program(gl, S.MODEL_VS, S.MODEL_FS);

    this.createTextureArray();
    this.createCloudTexture();

    this.quadEBO = gl.createBuffer();
    this.indexCapacity = 0;
    this.ensureIndexCapacity(65536);

    // Triangle plein écran pour le ciel
    this.skyVAO = gl.createVertexArray();
    gl.bindVertexArray(this.skyVAO);
    const skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Plan des nuages
    this.cloudVAO = gl.createVertexArray();
    gl.bindVertexArray(this.cloudVAO);
    const cloudBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Contour du bloc visé
    this.lineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.lineVAO);
    const lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    const e = 0.003, a0 = -e, a1 = 1 + e;
    const edges = [];
    const corners = [[a0, a0, a0], [a1, a0, a0], [a1, a0, a1], [a0, a0, a1], [a0, a1, a0], [a1, a1, a0], [a1, a1, a1], [a0, a1, a1]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) edges.push(...corners[i], ...corners[j]);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edges), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Modèles
    this.crackModel = this.createModel(unitCubeMesh());
    this.armModel = this.createModel(armMesh());
    this.itemModels = new Map();
    this.blockModels = new Map();
    this.mobModels = {};
    for (const [name, model] of Object.entries(MOB_MODELS)) {
      this.mobModels[name] = buildMobMeshes(model).map((p) => ({ ...p, model: this.createModel(p.data) }));
    }
    this.particleModel = this.createModel(new Float32Array(0), true);

    this.proj = M.mat4();
    this.view = M.mat4();
    this.viewProj = M.mat4();
    this.planes = new Float32Array(24);
    this.tmp = M.mat4();
    this.tmp2 = M.mat4();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    this.resize();
  }

  // ------------------------------------------------------------------ ressources
  createTextureArray() {
    const gl = this.gl;
    const data = buildTiles();
    const n = TILE_NAMES.length;
    this.layerCount = n;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 4);
    // Mipmaps faits main : préservent la couverture des textures découpées (feuilles, plantes).
    let size = 16, level = data;
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const cutout = new Uint8Array(n);
    for (let t = 0; t < n; t++) for (let i = 3; i < 1024; i += 4) if (data[t * 1024 + i] === 0) { cutout[t] = 1; break; }
    for (let l = 1; l <= 4; l++) {
      const ns = size >> 1;
      const next = new Uint8Array(ns * ns * 4 * n);
      for (let t = 0; t < n; t++) {
        const src = t * size * size * 4, dst = t * ns * ns * 4;
        for (let y = 0; y < ns; y++)
          for (let x = 0; x < ns; x++) {
            let r = 0, g = 0, b = 0, a = 0, w = 0;
            for (let k = 0; k < 4; k++) {
              const sx = x * 2 + (k & 1), sy = y * 2 + (k >> 1);
              const i = src + (sy * size + sx) * 4;
              const al = level[i + 3];
              const wt = al + 1;
              r += level[i] * wt; g += level[i + 1] * wt; b += level[i + 2] * wt; a += al; w += wt;
            }
            const o = dst + (y * ns + x) * 4;
            next[o] = r / w; next[o + 1] = g / w; next[o + 2] = b / w;
            a /= 4;
            next[o + 3] = cutout[t] ? (a >= 60 ? 255 : 0) : a;
          }
      }
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, l, gl.RGBA8, ns, ns, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, next);
      level = next;
      size = ns;
    }
    this.texture = tex;
  }

  createCloudTexture() {
    const gl = this.gl;
    const N = 256;
    const data = new Uint8Array(N * N);
    const noise = new Simplex(4242);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        // bruit périodique : échantillonnage sur un tore
        const ax = (x / N) * Math.PI * 2, ay = (y / N) * Math.PI * 2;
        const v = noise.noise3(Math.cos(ax) * 6, Math.sin(ax) * 6, Math.cos(ay) * 6 + Math.sin(ay) * 3.7)
          + 0.5 * noise.noise3(Math.cos(ax) * 14 + 10, Math.sin(ax) * 14, Math.sin(ay) * 14);
        data[y * N + x] = v > 0.28 ? 255 : 0;
      }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.cloudTexture = tex;
  }

  ensureIndexCapacity(quads) {
    if (quads <= this.indexCapacity) return;
    let cap = Math.max(this.indexCapacity, 1024);
    while (cap < quads) cap *= 2;
    const idx = new Uint32Array(cap * 6);
    for (let q = 0, v = 0, i = 0; q < cap; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2;
      idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadEBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.indexCapacity = cap;
  }

  createModel(data, dynamic = false) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    return { vao, vbo, count: data.length / 7 };
  }

  getItemModel(itemId) {
    let m = this.itemModels.get(itemId);
    if (!m) {
      const { data, cube } = itemMesh(itemId);
      m = { ...this.createModel(data), cube };
      this.itemModels.set(itemId, m);
    }
    return m;
  }

  getBlockModel(blockId) {
    let m = this.blockModels.get(blockId);
    if (!m) {
      m = this.createModel(blockCubeMesh(blockId));
      this.blockModels.set(blockId, m);
    }
    return m;
  }

  // ------------------------------------------------------------------ chunks
  createChunkVAO() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.UNSIGNED_SHORT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, 16, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadEBO);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  uploadChunk(chunk, mesh) {
    const gl = this.gl;
    this.ensureIndexCapacity(Math.max(mesh.opaqueQuads, mesh.transQuads));
    let m = chunk.mesh;
    if (!m) m = chunk.mesh = { o: null, t: null, nO: 0, nT: 0 };
    m.nO = mesh.opaqueQuads * 6;
    m.nT = mesh.transQuads * 6;
    if (mesh.opaqueQuads) {
      if (!m.o) m.o = this.createChunkVAO();
      gl.bindBuffer(gl.ARRAY_BUFFER, m.o.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque, gl.STATIC_DRAW);
    }
    if (mesh.transQuads) {
      if (!m.t) m.t = this.createChunkVAO();
      gl.bindBuffer(gl.ARRAY_BUFFER, m.t.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.trans, gl.STATIC_DRAW);
    }
  }

  freeChunk(chunk) {
    const m = chunk.mesh;
    if (!m) return;
    const gl = this.gl;
    for (const part of [m.o, m.t]) {
      if (!part) continue;
      gl.deleteBuffer(part.vbo);
      gl.deleteVertexArray(part.vao);
    }
    chunk.mesh = null;
  }

  // Remaille les chunks modifiés, les plus proches d'abord, dans un budget de temps.
  updateMeshes(world, camX, camZ, radius, budgetMs, force = null) {
    const start = performance.now();
    const pcx = Math.floor(camX) >> 4, pcz = Math.floor(camZ) >> 4;
    if (force) {
      for (const c of force) {
        if (c.dirty && world.isMeshable(c)) this.meshChunk(world, c);
      }
    }
    if (!world.dirtyChunks.size) return 0;
    const list = [];
    const r2 = (radius + 0.5) * (radius + 0.5);
    for (const c of world.dirtyChunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d = dx * dx + dz * dz;
      if (d > r2) continue;
      list.push([d, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, c] of list) {
      if (!world.isMeshable(c)) continue;
      this.meshChunk(world, c);
      n++;
      if (performance.now() - start > budgetMs) break;
    }
    return n;
  }

  meshChunk(world, c) {
    const mesh = buildChunkMesh(world, c);
    this.uploadChunk(c, mesh);
    c.dirty = false;
    c.meshVersion++;
    world.dirtyChunks.delete(c);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.resolution;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // ------------------------------------------------------------------ environnement
  environment(dayTime, fluid) {
    const a = (dayTime / 24000) * Math.PI * 2;
    const sunDir = [Math.cos(a), Math.sin(a), 0];
    const sunH = sunDir[1];
    const day = M.smoothstep(-0.2, 0.22, sunH);
    const sunset = (1 - M.smoothstep(0.0, 0.4, Math.abs(sunH))) * M.smoothstep(-0.3, -0.05, sunH);
    const zenith = mix3([0.008, 0.01, 0.03], [0.4, 0.6, 1.0], day);
    let horizon = mix3([0.025, 0.03, 0.07], [0.7, 0.82, 1.0], day);
    horizon = mix3(horizon, [0.95, 0.55, 0.32], sunset * 0.5);
    const env = {
      sunDir,
      sun: 0.3 + 0.7 * day,
      skyLightColor: mix3([0.62, 0.68, 0.95], [1, 1, 1], day),
      zenith,
      horizon,
      glow: [1.0 * sunset, 0.45 * sunset, 0.18 * sunset],
      stars: 1 - M.smoothstep(-0.25, 0.1, sunH),
      fogColor: horizon,
      cloudColor: mix3([0.12, 0.13, 0.18], [1, 1, 1], day),
      underwater: 0,
    };
    if (fluid === 'water') {
      env.fogColor = mix3([0.01, 0.03, 0.08], [0.1, 0.25, 0.6], day);
      env.underwater = 0.85;
    } else if (fluid === 'lava') {
      env.fogColor = [0.85, 0.28, 0.03];
      env.underwater = 1;
    }
    return env;
  }

  // ------------------------------------------------------------------ rendu d'une image
  render(frame) {
    const gl = this.gl;
    this.resize();
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const cam = frame.cam;
    const world = frame.world;
    const R = frame.renderDistance;
    const env = this.environment(frame.dayTime, frame.fluid);
    this.env = env;

    let fogEnd = R * 16 - 6, fogStart = fogEnd * 0.6;
    if (frame.fluid === 'water') { fogStart = 0; fogEnd = 22; }
    else if (frame.fluid === 'lava') { fogStart = 0; fogEnd = 2.5; }
    this.fog = [fogStart, fogEnd];

    const aspect = W / H;
    M.perspective(this.proj, cam.fov, aspect, 0.05, R * 16 + 200);
    M.viewRotation(this.view, cam.yaw, cam.pitch);
    M.multiply(this.viewProj, this.proj, this.view);
    M.frustumPlanes(this.viewProj, this.planes);

    gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.drawSky(cam, aspect, env);

    // Terrain opaque
    const visible = [];
    const pcx = Math.floor(cam.x) >> 4, pcz = Math.floor(cam.z) >> 4;
    const r2 = (R + 0.5) * (R + 0.5);
    for (const c of world.chunks.values()) {
      if (!c.mesh) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > r2) continue;
      const ox = c.cx * 16 - cam.x, oz = c.cz * 16 - cam.z;
      if (!M.boxInFrustum(this.planes, ox, -cam.y, oz, ox + 16, c.maxY + 2 - cam.y, oz + 16)) continue;
      visible.push([dx * dx + dz * dz, c]);
    }
    visible.sort((a, b) => a[0] - b[0]);

    const cp = this.chunkProg;
    gl.useProgram(cp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.uniform1i(cp.u.u_tex, 0);
    gl.uniformMatrix4fv(cp.u.u_viewProj, false, this.viewProj);
    gl.uniform1f(cp.u.u_time, frame.time);
    gl.uniform2f(cp.u.u_fog, fogStart, fogEnd);
    gl.uniform1f(cp.u.u_sun, env.sun);
    gl.uniform3fv(cp.u.u_skyLightColor, env.skyLightColor);
    gl.uniform3fv(cp.u.u_fogColor, env.fogColor);
    gl.uniform1f(cp.u.u_gamma, this.gamma);
    gl.uniform1f(cp.u.u_alphaTest, 0.5);
    gl.disable(gl.BLEND);
    let quads = 0;
    for (const [, c] of visible) {
      const m = c.mesh;
      if (!m.nO) continue;
      gl.uniform3f(cp.u.u_offset, c.cx * 16 - cam.x, -cam.y, c.cz * 16 - cam.z);
      gl.uniform3f(cp.u.u_chunkWorld, (c.cx * 16) % 4096, 0, (c.cz * 16) % 4096);
      gl.bindVertexArray(m.o.vao);
      gl.drawElements(gl.TRIANGLES, m.nO, gl.UNSIGNED_INT, 0);
      quads += m.nO / 6;
    }
    this.stats.chunks = visible.length;

    // Entités, particules, fissure et contour
    this.drawEntities(frame, env);
    this.drawParticles(frame, env);
    if (frame.target) this.drawTarget(frame);

    // Terrain translucide (eau, glace), de l'arrière vers l'avant
    gl.useProgram(cp.p);
    gl.uniform1f(cp.u.u_alphaTest, 0.01);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (let i = visible.length - 1; i >= 0; i--) {
      const c = visible[i][1];
      const m = c.mesh;
      if (!m.nT) continue;
      gl.uniform3f(cp.u.u_offset, c.cx * 16 - cam.x, -cam.y, c.cz * 16 - cam.z);
      gl.uniform3f(cp.u.u_chunkWorld, (c.cx * 16) % 4096, 0, (c.cz * 16) % 4096);
      gl.bindVertexArray(m.t.vao);
      gl.drawElements(gl.TRIANGLES, m.nT, gl.UNSIGNED_INT, 0);
      quads += m.nT / 6;
    }
    this.stats.quads = quads;

    if (frame.clouds !== false) this.drawClouds(frame, env);
    gl.disable(gl.BLEND);

    if (frame.hand) this.drawHand(frame, env, aspect);
    gl.bindVertexArray(null);
  }

  drawSky(cam, aspect, env) {
    const gl = this.gl;
    const sp = this.skyProg;
    gl.useProgram(sp.p);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const f = M.lookVector(cam.yaw, cam.pitch);
    // repère caméra
    const r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const th = Math.tan(cam.fov / 2);
    gl.uniform3fv(sp.u.u_camF, f);
    gl.uniform3fv(sp.u.u_camR, r);
    gl.uniform3fv(sp.u.u_camU, u);
    gl.uniform2f(sp.u.u_tan, th * aspect, th);
    gl.uniform3fv(sp.u.u_zenith, env.zenith);
    gl.uniform3fv(sp.u.u_horizon, env.horizon);
    gl.uniform3fv(sp.u.u_sunDir, env.sunDir);
    gl.uniform3fv(sp.u.u_glow, env.glow);
    gl.uniform1f(sp.u.u_stars, env.stars);
    gl.uniform1f(sp.u.u_underwater, env.underwater);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  drawClouds(frame, env) {
    const gl = this.gl;
    const cp = this.cloudProg;
    const cam = frame.cam;
    gl.useProgram(cp.p);
    const size = Math.max(frame.renderDistance * 16 * 1.6, 160);
    gl.uniformMatrix4fv(cp.u.u_viewProj, false, this.viewProj);
    gl.uniform1f(cp.u.u_height, 108.33 - cam.y);
    gl.uniform1f(cp.u.u_size, size);
    const drift = frame.time * 1.2;
    gl.uniform2f(cp.u.u_offset, (cam.x + drift) % (12 * 256), cam.z % (12 * 256));
    gl.uniform3fv(cp.u.u_color, env.cloudColor);
    gl.uniform3fv(cp.u.u_fogColor, env.fogColor);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTexture);
    gl.uniform1i(cp.u.u_clouds, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.bindVertexArray(this.cloudVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  useModelProgram(env, viewProj = this.viewProj) {
    const gl = this.gl;
    const mp = this.modelProg;
    gl.useProgram(mp.p);
    gl.uniformMatrix4fv(mp.u.u_viewProj, false, viewProj);
    gl.uniform1i(mp.u.u_tex, 0);
    gl.uniform1f(mp.u.u_sun, env.sun);
    gl.uniform3fv(mp.u.u_skyLightColor, env.skyLightColor);
    gl.uniform3fv(mp.u.u_fogColor, env.fogColor);
    gl.uniform2f(mp.u.u_fog, this.fog[0], this.fog[1]);
    gl.uniform1f(mp.u.u_gamma, this.gamma);
    gl.uniform1f(mp.u.u_unlit, 0);
    gl.uniform1f(mp.u.u_layer, -1);
    gl.uniform4f(mp.u.u_tint, 0, 0, 0, 0);
    return mp;
  }

  drawModel(model, matrix, light, tint = null) {
    const gl = this.gl;
    const mp = this.modelProg;
    gl.uniformMatrix4fv(mp.u.u_model, false, matrix);
    gl.uniform2f(mp.u.u_light, light[0], light[1]);
    if (tint) gl.uniform4fv(mp.u.u_tint, tint);
    else gl.uniform4f(mp.u.u_tint, 0, 0, 0, 0);
    gl.bindVertexArray(model.vao);
    gl.drawArrays(gl.TRIANGLES, 0, model.count);
  }

  drawEntities(frame, env) {
    if (!frame.entities || !frame.entities.length) return;
    const cam = frame.cam;
    this.useModelProgram(env);
    const m = this.tmp, m2 = this.tmp2;
    for (const e of frame.entities) {
      const dx = e.x - cam.x, dy = e.y - cam.y, dz = e.z - cam.z;
      if (dx * dx + dz * dz > (frame.renderDistance * 16) ** 2) continue;
      if (!M.boxInFrustum(this.planes, dx - 1.5, dy - 0.5, dz - 1.5, dx + 1.5, dy + 2.5, dz + 1.5)) continue;
      M.identity(m);
      M.translate(m, m, dx, dy, dz);
      if (e.kind === 'mob') {
        const parts = this.mobModels[e.model];
        if (!parts) continue;
        M.rotateY(m, m, e.yaw);
        if (e.death > 0) M.rotateZ(m, m, Math.min(1, e.death) * Math.PI / 2);
        if (e.scale && e.scale !== 1) M.scale(m, m, e.scale, e.scale, e.scale);
        const tint = e.hurt ? [1, 0.1, 0.1, 0.45] : e.flash ? [1, 1, 1, e.flash] : null;
        for (const p of parts) {
          m2.set(m);
          if (p.pivot && p.anim) {
            let rx = 0, ry = 0, rz = 0;
            const swing = Math.sin(e.walk) * 0.8 * e.walkAmount;
            switch (p.anim) {
              case 'legA': rx = swing; break;
              case 'legB': rx = -swing; break;
              case 'head': rx = -(e.headPitch || 0); ry = e.headYaw || 0; break;
              case 'armL': rx = Math.PI / 2 + Math.sin(frame.time * 2) * 0.05 - swing * 0.2; break;
              case 'armR': rx = Math.PI / 2 - Math.sin(frame.time * 2) * 0.05 + swing * 0.2; break;
              case 'wingL': rz = e.flap || 0; break;
              case 'wingR': rz = -(e.flap || 0); break;
            }
            M.translate(m2, m2, p.pivot[0], p.pivot[1], p.pivot[2]);
            if (ry) M.rotateY(m2, m2, ry);
            if (rx) M.rotateX(m2, m2, rx);
            if (rz) M.rotateZ(m2, m2, rz);
            M.translate(m2, m2, -p.pivot[0], -p.pivot[1], -p.pivot[2]);
          }
          this.drawModel(p.model, m2, e.light, tint);
        }
      } else if (e.kind === 'item') {
        const model = this.getItemModel(e.itemId);
        M.translate(m, m, 0, 0.25 + Math.sin(e.bob) * 0.06, 0);
        M.rotateY(m, m, e.spin);
        const s = model.cube ? 0.25 : 0.4;
        M.scale(m, m, s, s, s);
        this.drawModel(model, m, e.light);
        if (e.count > 1) {
          M.translate(m, m, 0.25, 0.2, 0.25);
          this.drawModel(model, m, e.light);
        }
      } else if (e.kind === 'block') {
        const model = this.getBlockModel(e.blockId);
        M.translate(m, m, 0, 0.5, 0);
        if (e.scale) M.scale(m, m, e.scale, e.scale, e.scale);
        this.drawModel(model, m, e.light, e.flash ? [1, 1, 1, e.flash] : null);
      }
    }
  }

  drawParticles(frame, env) {
    const ps = frame.particles;
    if (!ps || !ps.length) return;
    const gl = this.gl;
    const cam = frame.cam;
    const f = M.lookVector(cam.yaw, cam.pitch);
    const r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const up = u;
    const data = new Float32Array(ps.length * 6 * 7);
    let o = 0;
    for (const p of ps) {
      const x = p.x - cam.x, y = p.y - cam.y, z = p.z - cam.z;
      const s = p.size;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const us = [p.u, p.u + p.us], vs = [p.v + p.us, p.v];
      const verts = corners.map(([a, b]) => [
        x + (r[0] * a + up[0] * b) * s, y + (r[1] * a + up[1] * b) * s, z + (r[2] * a + up[2] * b) * s,
        us[a > 0 ? 1 : 0], vs[b > 0 ? 1 : 0],
      ]);
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = verts[k];
        data[o++] = v[0]; data[o++] = v[1]; data[o++] = v[2];
        data[o++] = v[3]; data[o++] = v[4]; data[o++] = p.layer; data[o++] = p.shade ?? 1;
      }
    }
    this.useModelProgram(env);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleModel.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.particleModel.count = ps.length * 6;
    gl.disable(gl.CULL_FACE);
    this.drawModel(this.particleModel, M.identity(this.tmp), frame.particleLight || [1, 0]);
    gl.enable(gl.CULL_FACE);
  }

  drawTarget(frame) {
    const gl = this.gl;
    const t = frame.target;
    const cam = frame.cam;
    if (frame.crack >= 0) {
      this.useModelProgram(this.env);
      const mp = this.modelProg;
      gl.uniform1f(mp.u.u_unlit, 1);
      gl.uniform1f(mp.u.u_layer, T.destroy_0 + Math.min(9, frame.crack));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -1);
      const m = M.identity(this.tmp);
      M.translate(m, m, t.x - cam.x, t.y - cam.y, t.z - cam.z);
      this.drawModel(this.crackModel, m, [1, 1]);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.disable(gl.BLEND);
      gl.uniform1f(mp.u.u_layer, -1);
      gl.uniform1f(mp.u.u_unlit, 0);
    }
    const lp = this.lineProg;
    gl.useProgram(lp.p);
    gl.uniformMatrix4fv(lp.u.u_viewProj, false, this.viewProj);
    gl.uniform3f(lp.u.u_offset, t.x - cam.x, t.y - cam.y, t.z - cam.z);
    gl.uniform3f(lp.u.u_scale, 1, t.height ?? 1, 1);
    gl.uniform4f(lp.u.u_color, 0, 0, 0, 0.55);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.lineVAO);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.disable(gl.BLEND);
  }

  // Objet tenu en main (ou bras) dessiné par-dessus la scène.
  drawHand(frame, env, aspect) {
    const gl = this.gl;
    const h = frame.hand;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const proj = M.perspective(M.mat4(), (70 * Math.PI) / 180, aspect, 0.01, 10);
    this.useModelProgram(env, proj);
    gl.uniform2f(this.modelProg.u.u_fog, 100, 200);
    const m = M.identity(this.tmp);
    const s = h.swing;
    const sq = Math.sin(Math.sqrt(s) * Math.PI);
    const s1 = Math.sin(s * Math.PI);
    const bobX = h.bobX || 0, bobY = h.bobY || 0;
    if (h.itemId) {
      const model = this.getItemModel(h.itemId);
      M.translate(m, m, 0.56 - sq * 0.35 + bobX, -0.52 + Math.sin(Math.sqrt(s) * Math.PI * 2) * 0.18 - h.equip * 0.6 + bobY, -0.72 - s1 * 0.15);
      if (model.cube) {
        M.translate(m, m, 0.04, 0.06, -0.12);
        M.rotateY(m, m, Math.PI / 4 - s1 * 0.5);
        M.rotateZ(m, m, -sq * 0.25);
        M.rotateX(m, m, -sq * 0.9);
        M.scale(m, m, 0.3, 0.3, 0.3);
      } else {
        M.rotateY(m, m, -Math.PI / 2 + 0.35 - s1 * 0.4);
        M.rotateZ(m, m, 0.45 - sq * 0.8);
        M.rotateX(m, m, 0);
        M.scale(m, m, 0.68, 0.68, 0.68);
      }
      this.drawModel(model, m, h.light);
    } else {
      M.translate(m, m, 0.62 - sq * 0.3 + bobX, -0.62 + Math.sin(Math.sqrt(s) * Math.PI * 2) * 0.15 - h.equip * 0.6 + bobY, -0.62 - s1 * 0.2);
      M.rotateX(m, m, 1.25 - sq * 0.6);
      M.rotateY(m, m, -0.35);
      M.rotateZ(m, m, 0.2);
      this.drawModel(this.armModel, m, h.light);
    }
  }
}

