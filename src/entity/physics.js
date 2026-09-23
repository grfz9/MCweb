// Collisions boîte englobante contre les blocs solides.
import { SOLID, IS_LIQUID, BOX_HEIGHT, B } from '../blocks.js';

const EPS = 1e-7;

// Déplace une entité (pos = centre des pieds, w = largeur, h = hauteur) en résolvant les collisions axe par axe.
export function moveEntity(world, e, dx, dy, dz) {
  const hw = e.w / 2;
  let minX = e.x - hw, minY = e.y, minZ = e.z - hw;
  let maxX = e.x + hw, maxY = e.y + e.h, maxZ = e.z + hw;

  const x0 = Math.floor(Math.min(minX, minX + dx)) , x1 = Math.floor(Math.max(maxX, maxX + dx));
  const y0 = Math.floor(Math.min(minY, minY + dy)) , y1 = Math.floor(Math.max(maxY, maxY + dy));
  const z0 = Math.floor(Math.min(minZ, minZ + dz)) , z1 = Math.floor(Math.max(maxZ, maxZ + dz));
  const boxes = [];
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const id = world.getBlock(x, y, z);
        if (SOLID[id]) boxes.push(x, y, z, BOX_HEIGHT[id]);
      }

  const odx = dx, ody = dy, odz = dz;
  // Axe Y
  for (let i = 0; i < boxes.length; i += 4) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2], bh = boxes[i + 3];
    if (maxX <= bx + EPS || minX >= bx + 1 - EPS || maxZ <= bz + EPS || minZ >= bz + 1 - EPS) continue;
    if (dy > 0 && maxY <= by + EPS) dy = Math.min(dy, by - maxY);
    else if (dy < 0 && minY >= by + bh - EPS) dy = Math.max(dy, by + bh - minY);
  }
  minY += dy; maxY += dy;
  // Axe X
  for (let i = 0; i < boxes.length; i += 4) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2], bh = boxes[i + 3];
    if (maxY <= by + EPS || minY >= by + bh - EPS || maxZ <= bz + EPS || minZ >= bz + 1 - EPS) continue;
    if (dx > 0 && maxX <= bx + EPS) dx = Math.min(dx, bx - maxX);
    else if (dx < 0 && minX >= bx + 1 - EPS) dx = Math.max(dx, bx + 1 - minX);
  }
  minX += dx; maxX += dx;
  // Axe Z
  for (let i = 0; i < boxes.length; i += 4) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2], bh = boxes[i + 3];
    if (maxY <= by + EPS || minY >= by + bh - EPS || maxX <= bx + EPS || minX >= bx + 1 - EPS) continue;
    if (dz > 0 && maxZ <= bz + EPS) dz = Math.min(dz, bz - maxZ);
    else if (dz < 0 && minZ >= bz + 1 - EPS) dz = Math.max(dz, bz + 1 - minZ);
  }

  e.x += dx;
  e.y += dy;
  e.z += dz;
  e.collidedX = dx !== odx;
  e.collidedZ = dz !== odz;
  e.collidedY = dy !== ody;
  e.onGround = ody < 0 && dy !== ody;
  if (e.collidedX) e.vx = 0;
  if (e.collidedZ) e.vz = 0;
  if (e.collidedY) e.vy = 0;
}

// La boîte de l'entité touche-t-elle un bloc solide ?
export function boxCollides(world, minX, minY, minZ, maxX, maxY, maxZ) {
  for (let y = Math.floor(minY); y <= Math.floor(maxY - EPS); y++)
    for (let z = Math.floor(minZ); z <= Math.floor(maxZ - EPS); z++)
      for (let x = Math.floor(minX); x <= Math.floor(maxX - EPS); x++)
        if (SOLID[world.getBlock(x, y, z)]) return true;
  return false;
}

// Liquide dans lequel baigne une partie de la boîte (null, B.WATER ou B.LAVA).
export function liquidIn(world, minX, minY, minZ, maxX, maxY, maxZ) {
  let found = 0;
  for (let y = Math.floor(minY); y <= Math.floor(maxY - EPS); y++)
    for (let z = Math.floor(minZ); z <= Math.floor(maxZ - EPS); z++)
      for (let x = Math.floor(minX); x <= Math.floor(maxX - EPS); x++) {
        const id = world.getBlock(x, y, z);
        if (IS_LIQUID[id]) {
          if (id === B.LAVA) return B.LAVA;
          found = id;
        }
      }
  return found || null;
}

export function entityLiquid(world, e, shrink = 0.4) {
  const hw = e.w / 2 - 0.001;
  return liquidIn(world, e.x - hw, e.y + shrink * 0.3, e.z - hw, e.x + hw, e.y + e.h * (1 - shrink * 0.3), e.z + hw);
}

// Boîtes qui se chevauchent ?
export function aabbOverlap(a, b) {
  return a.x - a.w / 2 < b.x + b.w / 2 && a.x + a.w / 2 > b.x - b.w / 2 &&
    a.y < b.y + b.h && a.y + a.h > b.y &&
    a.z - a.w / 2 < b.z + b.w / 2 && a.z + a.w / 2 > b.z - b.w / 2;
}

// Intersection rayon / boîte (retourne la distance ou -1).
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
