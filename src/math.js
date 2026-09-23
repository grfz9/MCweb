// Petite bibliothèque de maths (matrices 4x4 en ordre colonne, comme WebGL).

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

// Direction du regard pour un lacet (yaw) et un tangage (pitch).
// yaw = 0 regarde vers -Z, pitch > 0 regarde vers le haut.
export function lookVector(yaw, pitch, out = [0, 0, 0]) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

// Matrice de vue sans translation (rendu relatif à la caméra).
export function viewRotation(out, yaw, pitch) {
  const f = lookVector(yaw, pitch);
  // z = -f
  const zx = -f[0], zy = -f[1], zz = -f[2];
  // x = up × z, avec up = (0,1,0)
  let xx = zz, xy = 0, xz = -zx;
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl; xz /= xl;
  // y = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

export function translate(out, a, x, y, z) {
  if (out !== a) out.set(a);
  out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
  out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
  out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
  out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  return out;
}

export function scale(out, a, x, y, z) {
  if (out !== a) out.set(a);
  for (let i = 0; i < 4; i++) {
    out[i] = a[i] * x;
    out[4 + i] = a[4 + i] * y;
    out[8 + i] = a[8 + i] * z;
  }
  return out;
}

function rotate(out, a, rad, axis) {
  const s = Math.sin(rad), c = Math.cos(rad);
  if (out !== a) out.set(a);
  let i0, i1;
  if (axis === 0) { i0 = 4; i1 = 8; } else if (axis === 1) { i0 = 8; i1 = 0; } else { i0 = 0; i1 = 4; }
  for (let i = 0; i < 4; i++) {
    const p = a[i0 + i], q = a[i1 + i];
    out[i0 + i] = p * c + q * s;
    out[i1 + i] = q * c - p * s;
  }
  return out;
}
export const rotateX = (out, a, rad) => rotate(out, a, rad, 0);
export const rotateY = (out, a, rad) => rotate(out, a, rad, 1);
export const rotateZ = (out, a, rad) => rotate(out, a, rad, 2);

// Plans du frustum extraits d'une matrice vue-projection.
export function frustumPlanes(m, out = new Float32Array(24)) {
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
  ];
  for (let i = 0; i < 6; i++) {
    const r = rows[i];
    const l = Math.hypot(r[0], r[1], r[2]) || 1;
    out[i * 4] = r[0] / l; out[i * 4 + 1] = r[1] / l; out[i * 4 + 2] = r[2] / l; out[i * 4 + 3] = r[3] / l;
  }
  return out;
}

export function boxInFrustum(p, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let i = 0; i < 24; i += 4) {
    const a = p[i], b = p[i + 1], c = p[i + 2], d = p[i + 3];
    const x = a > 0 ? maxX : minX;
    const y = b > 0 ? maxY : minY;
    const z = c > 0 ? maxZ : minZ;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
