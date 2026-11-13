// Particules, traçantes, impacts, décalcomanies, explosions et flashs lumineux.
import * as THREE from 'three';
import { getTextures } from './textures.js';

const PV = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PF = /* glsl */`
uniform float uSoft;
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

class Particles {
  constructor(scene, max, additive, soft) {
    this.max = max; this.next = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('aColor', this.colAttr); g.setAttribute('aSize', this.sizeAttr);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: soft } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, r1 = r, g1 = g, b1 = b) {
    const i = this.next; this.next = (i + 1) % this.max;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
  }

  update(dt) {
    const { p, v, c, s, life, maxLife } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (s[i] !== 0) { s[i] = 0; c[i * 4 + 3] = 0; } continue; }
      life[i] -= dt;
      if (life[i] <= 0) { s[i] = 0; c[i * 4 + 3] = 0; continue; }
      const i3 = i * 3, i4 = i * 4;
      const k = 1 - life[i] / maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      v[i3] *= dr; v[i3 + 1] = v[i3 + 1] * dr - this.grav[i] * dt; v[i3 + 2] *= dr;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < 0.02 && this.grav[i] > 0) { p[i3 + 1] = 0.02; v[i3 + 1] *= -0.3; v[i3] *= 0.6; v[i3 + 2] *= 0.6; }
      s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      c[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * k;
      c[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * k;
      c[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * k;
      const fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
      c[i4 + 3] = this.a0[i] * fade;
    }
    this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true; this.sizeAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

const R = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const tex = getTextures();
    this.add = new Particles(scene, 3000, true, 1.6);
    this.norm = new Particles(scene, 2500, false, 1.2);

    // Traçantes
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    tGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 9, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, active: false, a: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, trav: 0, len: 0, speed: 0 });
    }

    // Décalcomanies (impacts de balles)
    this.decals = [];
    this.decalIdx = 0;
    const dGeo = new THREE.PlaneGeometry(1, 1);
    const holeMat = this.holeMat = new THREE.MeshBasicMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let i = 0; i < 220; i++) {
      const m = new THREE.Mesh(dGeo, holeMat);
      m.visible = false; m.matrixAutoUpdate = false;
      scene.add(m); this.decals.push(m);
    }
    this.scorches = [];
    this.scorchIdx = 0;
    const scMat = new THREE.MeshBasicMaterial({ map: tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(dGeo, scMat);
      m.visible = false; m.matrixAutoUpdate = false;
      scene.add(m); this.scorches.push(m);
    }

    // Pool de lumières (fixe, pour éviter les recompilations de shaders)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 1, peak: 0 });
    }
    this.lightIdx = 0;
    this._v = new THREE.Vector3();
  }

  setScale(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.add.mat.uniforms.uScale.value = s;
    this.norm.mat.uniforms.uScale.value = s;
  }

  flash(pos, color, intensity, dist, dur) {
    const L = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    L.light.position.set(pos.x, pos.y, pos.z);
    L.light.color.set(color);
    L.light.distance = dist;
    L.peak = intensity; L.t = dur; L.dur = dur;
    L.light.intensity = intensity;
  }

  tracer(a, b, speed = 420) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.a.set(a.x, a.y, a.z);
    t.dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
    t.dist = t.dir.length();
    if (t.dist < 1) return;
    t.dir.divideScalar(t.dist);
    t.trav = 0; t.len = Math.min(3.2, t.dist * 0.4); t.speed = speed;
    t.active = true; t.mesh.visible = true;
  }

  decal(point, normal, size) {
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    m.material = this.holeMat;
    this._place(m, point, normal, size, 0.012);
  }

  scorch(point, size) {
    const m = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    this._place(m, point, { x: 0, y: 1, z: 0 }, size, 0.015);
  }

  _place(m, point, normal, size, off) {
    m.position.set(point.x + normal.x * off, point.y + normal.y * off, point.z + normal.z * off);
    this._v.set(m.position.x + normal.x, m.position.y + normal.y, m.position.z + normal.z);
    if (Math.abs(normal.y) > 0.9) m.up.set(0, 0, 1); else m.up.set(0, 1, 0);
    m.lookAt(this._v);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size);
    m.updateMatrix();
    m.visible = true;
  }

  impact(point, normal, mat) {
    const { x, y, z } = point, n = normal;
    const isMetal = mat && (mat.startsWith('c_') || mat.startsWith('metal') || mat.startsWith('car') || mat === 'glass' || mat === 'ammo');
    const isWood = mat === 'wood';
    const isSoft = mat === 'ground' || mat === 'sandbag';
    if (isMetal) {
      for (let i = 0; i < 10; i++) {
        const sp = 3 + Math.random() * 6;
        this.add.emit(x, y, z, (n.x + R(0.7)) * sp, (n.y + R(0.7) + 0.3) * sp, (n.z + R(0.7)) * sp, 0.15 + Math.random() * 0.25, 0.04, 0.01, 4, 2.5, 0.8, 1, 14, 1);
      }
      this.flash(point, 0xffaa55, 2, 3, 0.05);
    }
    let dc = [0.55, 0.53, 0.5];
    if (isWood) dc = [0.45, 0.33, 0.2];
    else if (isSoft) dc = [0.42, 0.37, 0.28];
    else if (mat === 'brick') dc = [0.5, 0.3, 0.24];
    for (let i = 0; i < 5; i++) {
      const sp = 0.6 + Math.random() * 1.6;
      this.norm.emit(x, y, z, (n.x + R(0.5)) * sp, (n.y + R(0.5)) * sp + 0.3, (n.z + R(0.5)) * sp, 0.6 + Math.random() * 0.8, 0.12, 0.6 + Math.random() * 0.4, dc[0], dc[1], dc[2], 0.55, -0.2, 2.5);
    }
    for (let i = 0; i < 6; i++) {
      const sp = 2 + Math.random() * 4;
      this.norm.emit(x, y, z, (n.x + R(0.8)) * sp, (n.y + R(0.6) + 0.5) * sp, (n.z + R(0.8)) * sp, 0.5 + Math.random() * 0.4, 0.035, 0.03, dc[0] * 0.6, dc[1] * 0.6, dc[2] * 0.6, 1, 12, 0.5);
    }
    if (mat !== 'ground' || Math.random() < 0.5) this.decal(point, normal, 0.09 + Math.random() * 0.05);
  }

  blood(point, dir) {
    for (let i = 0; i < 8; i++) {
      const sp = 1 + Math.random() * 3;
      this.norm.emit(point.x, point.y, point.z, (dir.x + R(0.6)) * sp, (dir.y + R(0.6)) * sp, (dir.z + R(0.6)) * sp, 0.3 + Math.random() * 0.4, 0.06, 0.25, 0.35, 0.02, 0.02, 0.9, 6, 2);
    }
    this.norm.emit(point.x, point.y, point.z, 0, 0.2, 0, 0.35, 0.15, 0.5, 0.3, 0.02, 0.02, 0.6, 0, 1);
  }

  gunSmoke(pos, dir) {
    for (let i = 0; i < 3; i++) {
      const sp = 0.4 + Math.random() * 0.8;
      this.norm.emit(pos.x, pos.y, pos.z, dir.x * sp + R(0.15), dir.y * sp + 0.25 + R(0.1), dir.z * sp + R(0.15), 0.9 + Math.random() * 0.7, 0.05, 0.45, 0.7, 0.7, 0.68, 0.16, -0.25, 1.6);
    }
  }

  bloodSplat(point, dir, world) {
    // tache de sang sur la surface derrière la cible
    const hit = world.raycast(point, dir, 2.5);
    if (!hit) return;
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    if (!this.bloodMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      for (let i = 0; i < 14; i++) {
        x.fillStyle = `rgba(${70 + Math.random() * 40},0,0,${0.5 + Math.random() * 0.4})`;
        x.beginPath(); x.arc(32 + R(18), 32 + R(18), 2 + Math.random() * 9, 0, 7); x.fill();
      }
      this.bloodMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    }
    m.material = this.bloodMat;
    this._place(m, hit.point, hit.normal, 0.35 + Math.random() * 0.4, 0.012);
  }

  muzzleWorld(pos, dir) {
    for (let i = 0; i < 4; i++) {
      const sp = 2 + Math.random() * 6;
      this.add.emit(pos.x, pos.y, pos.z, dir.x * sp + R(0.5), dir.y * sp + R(0.5), dir.z * sp + R(0.5), 0.05, 0.25, 0.05, 5, 3, 1, 1, 0, 3);
    }
    this.norm.emit(pos.x, pos.y, pos.z, dir.x * 1.5, dir.y * 1.5 + 0.3, dir.z * 1.5, 0.5, 0.1, 0.5, 0.6, 0.6, 0.6, 0.25, -0.3, 2);
    this.flash(pos, 0xffaa50, 6, 7, 0.05);
  }

  explosion(pos) {
    const { x, y, z } = pos;
    for (let i = 0; i < 40; i++) {
      const sp = 3 + Math.random() * 9;
      this.add.emit(x, y + 0.3, z, R() * sp, Math.random() * sp * 0.9, R() * sp, 0.3 + Math.random() * 0.4, 1.2 + Math.random(), 2.6, 5, 2.6, 0.7, 1, -2, 4, 1.2, 0.3, 0.05);
    }
    for (let i = 0; i < 40; i++) {
      const sp = 10 + Math.random() * 18;
      this.add.emit(x, y + 0.3, z, R() * sp, Math.random() * sp, R() * sp, 0.4 + Math.random() * 0.6, 0.07, 0.02, 5, 3, 1, 1, 16, 0.6);
    }
    for (let i = 0; i < 30; i++) {
      const sp = 1 + Math.random() * 4;
      const g = 0.15 + Math.random() * 0.15;
      this.norm.emit(x + R(1), y + 0.5 + Math.random(), z + R(1), R() * sp, 1 + Math.random() * 3, R() * sp, 2 + Math.random() * 2.5, 1.5, 5 + Math.random() * 3, g, g, g, 0.65, -0.4, 1.2);
    }
    for (let i = 0; i < 20; i++) {
      const sp = 5 + Math.random() * 8;
      this.norm.emit(x, y + 0.2, z, R() * sp, 3 + Math.random() * sp, R() * sp, 1 + Math.random(), 0.08, 0.06, 0.12, 0.1, 0.08, 1, 18, 0.3);
    }
    this.flash(pos, 0xff9040, 400, 30, 0.35);
    this.scorch({ x, y: 0.01, z }, 4.5);
  }

  update(dt) {
    this.add.update(dt);
    this.norm.update(dt);
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.trav += t.speed * dt;
      const head = Math.min(t.trav, t.dist);
      const tail = Math.max(0, t.trav - t.len);
      if (tail >= t.dist) { t.active = false; t.mesh.visible = false; continue; }
      const len = Math.max(0.01, head - tail);
      t.mesh.position.copy(t.a).addScaledVector(t.dir, tail);
      this._v.copy(t.mesh.position).add(t.dir);
      t.mesh.lookAt(this._v);
      t.mesh.scale.set(0.014, 0.014, len);
    }
    for (const L of this.lights) {
      if (L.t <= 0) { if (L.light.intensity !== 0) L.light.intensity = 0; continue; }
      L.t -= dt;
      L.light.intensity = Math.max(0, L.peak * (L.t / L.dur));
    }
  }

  clear() {
    this.add.clear(); this.norm.clear();
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false; }
    for (const d of this.decals) d.visible = false;
    for (const d of this.scorches) d.visible = false;
  }
}
