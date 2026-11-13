// Collisions AABB, raycasts et déplacement de corps (joueur, bots, grenades).
const AX = ['x', 'y', 'z'];
export const GROUND = { mat: 'ground', ground: true };

let _ax = -1, _sg = 0;

/** Test rayon / AABB. Retourne t d'entrée (>=0) ou -1. Axe/sens de la normale dans _ax/_sg. */
export function rayAABB(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  _ax = -1;
  // X
  if (Math.abs(d.x) < 1e-12) { if (o.x < b.min.x || o.x > b.max.x) return -1; }
  else {
    const inv = 1 / d.x; let t1 = (b.min.x - o.x) * inv, t2 = (b.max.x - o.x) * inv, s = -1;
    if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
    if (t1 > tmin) { tmin = t1; _ax = 0; _sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Y
  if (Math.abs(d.y) < 1e-12) { if (o.y < b.min.y || o.y > b.max.y) return -1; }
  else {
    const inv = 1 / d.y; let t1 = (b.min.y - o.y) * inv, t2 = (b.max.y - o.y) * inv, s = -1;
    if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
    if (t1 > tmin) { tmin = t1; _ax = 1; _sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Z
  if (Math.abs(d.z) < 1e-12) { if (o.z < b.min.z || o.z > b.max.z) return -1; }
  else {
    const inv = 1 / d.z; let t1 = (b.min.z - o.z) * inv, t2 = (b.max.z - o.z) * inv, s = -1;
    if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
    if (t1 > tmin) { tmin = t1; _ax = 2; _sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (_ax === -1) return -1; // origine à l'intérieur
  return tmin;
}

export class World {
  constructor(boxes, cell = 8) {
    this.boxes = boxes;
    this.cell = cell;
    this.grid = new Map();
    this.stamp = 0;
    boxes.forEach((b, i) => {
      b.id = i; b._s = 0;
      for (let x = Math.floor(b.min.x / cell); x <= Math.floor(b.max.x / cell); x++)
        for (let z = Math.floor(b.min.z / cell); z <= Math.floor(b.max.z / cell); z++) {
          const k = x * 1000 + z;
          let l = this.grid.get(k);
          if (!l) { l = []; this.grid.set(k, l); }
          l.push(b);
        }
    });
  }

  query(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const s = ++this.stamp, c = this.cell;
    for (let x = Math.floor(minx / c); x <= Math.floor(maxx / c); x++)
      for (let z = Math.floor(minz / c); z <= Math.floor(maxz / c); z++) {
        const l = this.grid.get(x * 1000 + z);
        if (!l) continue;
        for (let i = 0; i < l.length; i++) { const b = l[i]; if (b._s !== s) { b._s = s; out.push(b); } }
      }
    return out;
  }

  /** Raycast contre le décor. o, d: {x,y,z} (d normalisé). */
  raycast(o, d, maxDist) {
    let best = maxDist, hit = null, ax = -1, sg = 0;
    if (d.y < -1e-9) {
      const t = -o.y / d.y;
      if (t >= 0 && t < best) { best = t; hit = GROUND; ax = 1; sg = 1; }
    }
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const t = rayAABB(o, d, boxes[i], best);
      if (t >= 0 && t < best) { best = t; hit = boxes[i]; ax = _ax; sg = _sg; }
    }
    if (!hit) return null;
    const n = { x: 0, y: 0, z: 0 };
    n[AX[ax]] = sg;
    return { t: best, point: { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best }, normal: n, box: hit };
  }

  /** Ligne de vue dégagée entre a et b ? */
  clear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return this.raycast(a, d, len - 0.05) === null;
  }
}

const _q1 = [], _q2 = [];

export function blockedAt(world, x, y, z, r, h) {
  const l = world.query(x - r, z - r, x + r, z + r, _q2);
  for (let i = 0; i < l.length; i++) {
    const b = l[i];
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && y + h > b.min.y && y < b.max.y) return true;
  }
  return false;
}

function overlaps(p, r, h, b) {
  return p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && p.y + h > b.min.y && p.y < b.max.y;
}

function moveAxis(world, body, axis, amt) {
  if (amt === 0) return;
  const p = body.pos, r = body.radius, h = body.height, k = AX[axis];
  p[k] += amt;
  const list = world.query(p.x - r, p.z - r, p.x + r, p.z + r, _q1);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!overlaps(p, r, h, b)) continue;
    if (axis === 1) {
      if (amt < 0) { p.y = b.max.y; body.vel.y = 0; body.grounded = true; }
      else { p.y = b.min.y - h - 1e-3; if (body.vel.y > 0) body.vel.y = 0; }
    } else {
      const rise = b.max.y - p.y;
      if (body.canStep && rise > 0 && rise <= body.stepHeight && !blockedAt(world, p.x, b.max.y + 1e-3, p.z, r, h)) {
        p.y = b.max.y + 1e-3;
        continue;
      }
      if (amt > 0) p[k] = b.min[k] - r - 1e-4; else p[k] = b.max[k] + r + 1e-4;
      body.vel[k] = 0;
      body.hitWall = true;
    }
  }
}

/** body: {pos, vel, radius, height, stepHeight, grounded} */
export function moveBody(world, body, dt) {
  body.canStep = body.grounded;
  body.grounded = false;
  body.hitWall = false;
  // sous-pas pour éviter de traverser les murs à grande vitesse
  const sp = Math.hypot(body.vel.x, body.vel.y, body.vel.z) * dt;
  const steps = Math.max(1, Math.ceil(sp / (body.radius * 0.9)));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    moveAxis(world, body, 0, body.vel.x * sdt);
    moveAxis(world, body, 2, body.vel.z * sdt);
    moveAxis(world, body, 1, body.vel.y * sdt);
    if (body.pos.y <= 0) { body.pos.y = 0; if (body.vel.y < 0) body.vel.y = 0; body.grounded = true; }
    if (body.grounded) body.canStep = true;
  }
}
