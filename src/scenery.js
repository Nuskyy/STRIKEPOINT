// Décor réaliste : terrain vallonné, herbe animée (instanciée), forêt, rochers, poteaux + câbles,
// fûts, pneus, flaques, vitres, poussière en suspension.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BuildingFactory, mergeByMaterial } from './buildings.js';
import { buildCar, buildSandbags, buildCrates, buildContainerDetails } from './props.js';
import { getTextures } from './textures.js';
import { HALF } from './map.js';

// ---------- bruit ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; }
  return s;
}

/** Hauteur du terrain : plat dans la zone de jeu, collines au-delà de l'enceinte. */
export function terrainHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const k = THREE.MathUtils.smoothstep(d, HALF + 24, HALF + 80);
  if (k <= 0) return 0;
  const h = fbm(x * 0.008 + 10, z * 0.008 - 4) * 70 - 14 + fbm(x * 0.03, z * 0.03) * 8;
  return Math.max(0, h) * k + k * 4;
}

const rnd = (a, b) => a + Math.random() * (b - a);

export class Scenery {
  constructor(scene, map, world, assets = null) {
    this.scene = scene;
    this.map = map;
    this.world = world;
    this.assets = assets?.ok ? assets : null;
    this.wetMaterials = [];
    this.tex = getTextures();
    this.uniforms = { uTime: { value: 0 } };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.terrain();
    if (this.assets) {
      this.realGrass();
      this.realVegetation();
      this.fences();
      this.skyline = new BuildingFactory(this.assets).skyline(this.group, HALF);
    } else this.grass();
    this.rocks();
    this.trees();
    this.props();
    if (map.sandbagBoxes?.length) this.group.add(buildSandbags(map.sandbagBoxes));
    if (map.crateBoxes?.length) this.group.add(buildCrates(map.crateBoxes));
    if (map.containers?.length) this.group.add(buildContainerDetails(map.containers));
    this.glass();
    this.dust();
    this.rain();
  }

  rain() {
    // gouttes = segments étirés qui tombent dans une boîte de 50 m centrée sur la caméra
    const N = 9000;
    this.rainN = N;
    const pos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainSeed[i * 3] = rnd(-25, 25); this.rainSeed[i * 3 + 1] = rnd(0, 22); this.rainSeed[i * 3 + 2] = rnd(-25, 25);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: 0xb8c4cc, transparent: true, opacity: 0.32, depthWrite: false });
    this.rainLines = new THREE.LineSegments(g, m);
    this.rainLines.frustumCulled = false;
    this.rainLines.renderOrder = 4;
    this.scene.add(this.rainLines);
    // éclaboussures au sol
    const sp = new Float32Array(600 * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    this.splashLife = new Float32Array(600);
    this.splashes = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ee, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false }));
    this.splashes.frustumCulled = false;
    this.scene.add(this.splashes);
    this.splashIdx = 0;
    this.rainOn = false; // pluie désactivée (sol simplement humide après l'averse)
    this.rainLines.visible = false;
    this.splashes.visible = false;
  }

  updateRain(dt, cam) {
    if (!this.rainOn) { this.rainLines.visible = false; this.splashes.visible = false; return; }
    this.rainLines.visible = true; this.splashes.visible = true;
    const a = this.rainLines.geometry.attributes.position.array, s = this.rainSeed;
    const fall = 14 * dt, wind = 1.6 * dt;
    for (let i = 0; i < this.rainN; i++) {
      const j = i * 3;
      s[j + 1] -= fall; s[j] += wind;
      if (s[j + 1] < 0) { s[j + 1] += 22; s[j] = rnd(-25, 25); s[j + 2] = rnd(-25, 25); }
      // boîte qui suit la caméra
      let x = s[j] + cam.x, z = s[j + 2] + cam.z;
      x = cam.x + ((((x - cam.x) + 25) % 50) + 50) % 50 - 25;
      z = cam.z + ((((z - cam.z) + 25) % 50) + 50) % 50 - 25;
      const y = s[j + 1] + cam.y - 8;
      const k = i * 6;
      a[k] = x; a[k + 1] = y; a[k + 2] = z;
      a[k + 3] = x - 0.06; a[k + 4] = y + 0.55; a[k + 5] = z;
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;
    // éclaboussures
    const sp = this.splashes.geometry.attributes.position.array;
    for (let n = 0; n < 14; n++) {
      const i = this.splashIdx; this.splashIdx = (i + 1) % 600;
      sp[i * 3] = cam.x + rnd(-14, 14); sp[i * 3 + 1] = 0.03; sp[i * 3 + 2] = cam.z + rnd(-14, 14);
      this.splashLife[i] = 0.12;
    }
    for (let i = 0; i < 600; i++) {
      if (this.splashLife[i] > 0) { this.splashLife[i] -= dt; sp[i * 3 + 1] += dt * 0.6; if (this.splashLife[i] <= 0) sp[i * 3 + 1] = -100; }
    }
    this.splashes.geometry.attributes.position.needsUpdate = true;
  }

  occupied(x, z, pad = 0.3) {
    const l = this.world.query(x - pad, z - pad, x + pad, z + pad, this._q || (this._q = []));
    for (const b of l) {
      if (b.max.y < 0.05) continue;
      if (x + pad > b.min.x && x - pad < b.max.x && z + pad > b.min.z && z - pad < b.max.z) return true;
    }
    return false;
  }

  onRoad(x, z) { return Math.abs(z) < 4.6 || Math.abs(x) < 4.6; }

  terrain() {
    const t = this.tex;
    const size = 900, seg = 220;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      // variations de couleur : terre sèche / herbe / terre sombre
      const n = fbm(x * 0.05 + 3, z * 0.05 + 7, 4);
      const n2 = fbm(x * 0.012 - 5, z * 0.012 + 2, 3);
      const grassy = THREE.MathUtils.smoothstep(n, 0.45, 0.7) * 0.8 + (h > 2 ? 0.5 : 0);
      c.setRGB(0.78, 0.72, 0.6);
      c.lerp(new THREE.Color(0.48, 0.55, 0.32), Math.min(1, grassy));
      c.multiplyScalar(0.8 + n2 * 0.4);
      if (h > 30) c.lerp(new THREE.Color(0.55, 0.53, 0.5), THREE.MathUtils.smoothstep(h, 30, 55));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const uv = g.attributes.uv;
    const tile = this.assets ? 3.5 : 7;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / tile), uv.getY(i) * (size / tile));
    let mat = this.assets && this.assets.material('dirt', { color: 0xc8c0b0 });
    if (mat) mat.vertexColors = true;
    else mat = new THREE.MeshStandardMaterial({ map: t.dirt, normalMap: t.dirt_n, roughnessMap: t.dirt_r, roughness: 1, vertexColors: true, color: 0xd8d0c0 });
    this.wetMaterials.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  grass() {
    const t = this.tex;
    const blade = new THREE.PlaneGeometry(0.7, 0.55);
    blade.translate(0, 0.27, 0);
    const b2 = blade.clone().rotateY(Math.PI / 2);
    const b3 = blade.clone().rotateY(Math.PI / 4);
    const geo = mergeGeometries([blade, b2, b3]);
    const mat = new THREE.MeshStandardMaterial({
      map: t.grass, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: 0xe6e8c0,
    });
    const u = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
         float w = sin(uTime * 1.8 + ph) * 0.5 + sin(uTime * 3.1 + ph * 1.7) * 0.2;
         transformed.x += w * 0.09 * uv.y;
         transformed.z += w * 0.05 * uv.y;`,
      );
    };
    const COUNT = 7000;
    const im = new THREE.InstancedMesh(geo, mat, COUNT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < COUNT * 4 && n < COUNT; tries++) {
      // amas : on favorise les zones « herbeuses » du bruit
      const inside = Math.random() < 0.45;
      let x, z;
      if (inside) { x = rnd(-HALF + 1, HALF - 1); z = rnd(-HALF + 1, HALF - 1); }
      else { const a = Math.random() * Math.PI * 2, r = rnd(HALF + 3, HALF + 45); x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const dens = fbm(x * 0.05 + 3, z * 0.05 + 7, 4);
      if (Math.random() > THREE.MathUtils.smoothstep(dens, inside ? 0.5 : 0.35, inside ? 0.75 : 0.65) + (inside ? 0 : 0.08)) continue;
      if (inside && (this.onRoad(x, z) || this.occupied(x, z))) continue;
      const y = terrainHeight(x, z);
      p.set(x, y, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI);
      const sc = rnd(0.6, 1.4);
      s.set(sc, sc * rnd(0.7, 1.3), sc);
      m4.compose(p, q, s);
      im.setMatrixAt(n, m4);
      col.setHSL(rnd(0.17, 0.26), rnd(0.2, 0.35), rnd(0.4, 0.58));
      im.setColorAt(n, col);
      n++;
    }
    im.count = n;
    im.receiveShadow = true;
    im.frustumCulled = false;
    this.group.add(im);
    this.grassMesh = im;
  }

  /** Instancie chaque maillage d'une pièce de modèle (sans sa position dans le kit). */
  instancedPart(part, transforms, { shadow = false, wind = false } = {}) {
    const meshes = [];
    part.updateMatrixWorld(true);
    const base = new THREE.Matrix4().copy(part.matrixWorld);
    base.setPosition(0, 0, 0);
    part.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const out = [];
    for (const o of meshes) {
      const local = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(part.matrixWorld).invert(), o.matrixWorld);
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(base, local));
      let mat = o.material;
      if (wind) {
        mat = mat.clone();
        const u = this.uniforms;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = u.uTime;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
            float h = max(0.0, position.y) * 4.0;
            transformed.x += (sin(uTime * 1.7 + ph) * 0.5 + sin(uTime * 2.9 + ph * 1.3) * 0.2) * 0.05 * h;
            transformed.z += sin(uTime * 1.3 + ph * 0.7) * 0.03 * h;`);
        };
        mat.customProgramCacheKey = () => 'wind';
      }
      const im = new THREE.InstancedMesh(g, mat, transforms.length);
      transforms.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow; im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      out.push(im);
    }
    return out;
  }

  /** Touffes d'herbe réelles (Poly Haven grass_medium_01), instanciées en amas. */
  realGrass() {
    const kit = this.assets.models.grass_medium_01;
    if (!kit) { this.grass(); return; }
    const names = ['tall_a', 'tall_b', 'tall_c', 'mid_b', 'mid_c', 'small_a', 'small_b'];
    const parts = names.map((n) => kit.getObjectByName(`grass_medium_01_${n}_LOD0`)).filter(Boolean);
    const lists = parts.map(() => []);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let clusters = 0;
    for (let tries = 0; tries < 9000 && clusters < 1400; tries++) {
      const inside = Math.random() < 0.55;
      let cx, cz;
      if (inside) { cx = rnd(-HALF + 1, HALF - 1); cz = rnd(-HALF + 1, HALF - 1); }
      else { const a = Math.random() * Math.PI * 2, r = rnd(HALF + 2, HALF + 20); cx = Math.cos(a) * r; cz = Math.sin(a) * r; }
      const dens = fbm(cx * 0.05 + 3, cz * 0.05 + 7, 4);
      if (Math.random() > THREE.MathUtils.smoothstep(dens, 0.42, 0.7) + 0.05) continue;
      if (inside && (this.onRoad(cx, cz) || this.occupied(cx, cz, 0.6))) continue;
      clusters++;
      const n = 4 + Math.floor(Math.random() * 7);
      for (let k = 0; k < n; k++) {
        const x = cx + rnd(-0.9, 0.9), z = cz + rnd(-0.9, 0.9);
        if (inside && this.occupied(x, z, 0.15)) continue;
        const sc = rnd(2.2, 3.8);
        p.set(x, terrainHeight(x, z), z);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2);
        s.set(sc, sc * rnd(0.85, 1.3), sc);
        lists[Math.floor(Math.random() * parts.length)].push(m4.compose(p, q, s).clone());
      }
    }
    this.grassMeshes = [];
    parts.forEach((part, i) => { if (lists[i].length) this.grassMeshes.push(...this.instancedPart(part, lists[i], { wind: true })); });
    this.grassMesh = new THREE.Group();
    this.grassMesh.visible = true;
  }

  /** Arbustes, rochers, souches et tronc mort réels. */
  realVegetation() {
    const A = this.assets.models;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const T = (x, z, sc, rotY = Math.random() * 6.28, y = 0) => m4.compose(p.set(x, terrainHeight(x, z) + y, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY), s.set(sc, sc, sc)).clone();
    // arbustes le long de l'enceinte et des bâtiments
    const shrubs = ['a', 'b', 'c', 'd'].map((k) => A.shrub_02?.getObjectByName(`shrub_02_${k}`)).filter(Boolean);
    if (shrubs.length) {
      const lists = shrubs.map(() => []);
      for (let i = 0; i < 70; i++) {
        let x, z;
        const side = i % 4, t = rnd(-HALF + 3, HALF - 3), off = HALF - rnd(1.2, 2.5);
        if (side === 0) { x = t; z = -off; } else if (side === 1) { x = t; z = off; } else if (side === 2) { x = -off; z = t; } else { x = off; z = t; }
        if (this.onRoad(x, z) || this.occupied(x, z, 0.8)) continue;
        lists[i % shrubs.length].push(T(x, z, rnd(0.55, 0.95)));
      }
      // arbustes extérieurs (devant la ceinture d'immeubles)
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, r = rnd(HALF + 22, HALF + 40);
        lists[i % shrubs.length].push(T(Math.cos(a) * r, Math.sin(a) * r, rnd(0.8, 1.4)));
      }
      shrubs.forEach((sh, i) => { if (lists[i].length) this.instancedPart(sh, lists[i], { shadow: true }); });
    }
    const place = (id, list) => { const part = A[id]; if (part && list.length) this.instancedPart(part, list.map(([x, z, sc, r]) => T(x, z, sc, r)), { shadow: true }); };
    place('boulder_01', [[-66, 52, 1.4], [66, -24, 1.1], [-40, -66, 1.3], [38, 66, 1.2], [-66, -12, 0.9]].filter(([x, z]) => !this.occupied(x, z, 1.2)));
    place('tree_stump_01', [[-62, 44, 1], [61, -44, 1], [-36, 64, 0.9]].filter(([x, z]) => !this.occupied(x, z, 0.8)));
    place('dead_tree_trunk', [[-24, 60, 1, 0.4], [44, -64, 1, 2.1]].filter(([x, z]) => !this.occupied(x, z, 1.6)));
  }

  /** Grillages à mailles losangées (segments doubles + poteaux). */
  fences() {
    const kit = this.assets.models.modular_chainlink_fence;
    if (!kit || !this.map.fences.length) return;
    const seg = kit.getObjectByName('modular_chainlink_fence_double');
    const post = kit.getObjectByName('modular_chainlink_fence_post');
    if (!seg || !post) return;
    const segT = [], postT = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const f of this.map.fences) {
      const dx = f.x1 - f.x0, dz = f.z1 - f.z0, len = Math.hypot(dx, dz);
      const ang = Math.atan2(-dz, dx);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ang);
      const n = Math.max(1, Math.round(len / 2));
      const step = len / n;
      for (let i = 0; i <= n; i++) {
        const t = i * step;
        postT.push(m4.compose(new THREE.Vector3(f.x0 + (dx / len) * t, 0, f.z0 + (dz / len) * t), q, one).clone());
        if (i < n) {
          const tc = t + step / 2;
          segT.push(m4.compose(new THREE.Vector3(f.x0 + (dx / len) * tc, 0, f.z0 + (dz / len) * tc), q, new THREE.Vector3(step / 1.91, 1, 1)).clone());
        }
      }
    }
    // centrer les pièces sur leur origine (elles sont décalées dans le kit)
    for (const [part, list] of [[seg, segT], [post, postT]]) {
      const box = new THREE.Box3().setFromObject(part);
      const c = box.getCenter(new THREE.Vector3());
      const off = new THREE.Matrix4().makeTranslation(-c.x + part.position.x * 0, -box.min.y, -c.z);
      const g = new THREE.Group();
      const clone = part.clone(true);
      clone.position.set(0, 0, 0);
      clone.updateMatrixWorld(true);
      const cb = new THREE.Box3().setFromObject(clone);
      const cc = cb.getCenter(new THREE.Vector3());
      clone.position.set(-cc.x, -cb.min.y, -cc.z);
      g.add(clone);
      this.instancedPart(g, list, { shadow: true });
      void off;
    }
  }

  rocks() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ map: this.tex.concrete, normalMap: this.tex.concrete_n, color: 0x8a8578, roughness: 0.95, flatShading: true });
    const COUNT = 600;
    const im = new THREE.InstancedMesh(geo, mat, COUNT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < COUNT * 3 && n < COUNT; i++) {
      const inside = Math.random() < 0.6;
      let x, z, sc;
      if (inside) { x = rnd(-HALF + 1, HALF - 1); z = rnd(-HALF + 1, HALF - 1); sc = rnd(0.04, 0.16); if (this.onRoad(x, z) && Math.random() < 0.7) continue; if (this.occupied(x, z, 0.2)) continue; }
      else { const a = Math.random() * Math.PI * 2, r = rnd(HALF + 4, HALF + 90); x = Math.cos(a) * r; z = Math.sin(a) * r; sc = rnd(0.3, 2.2); }
      p.set(x, terrainHeight(x, z) + sc * 0.2, z);
      e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      q.setFromEuler(e);
      s.set(sc * rnd(0.8, 1.6), sc * rnd(0.5, 0.9), sc * rnd(0.8, 1.6));
      m4.compose(p, q, s);
      im.setMatrixAt(n++, m4);
    }
    im.count = n;
    im.castShadow = true; im.receiveShadow = true;
    this.group.add(im);
  }

  treeGeometries() {
    // conifère : tronc + 4 cônes ; feuillu : tronc + amas d'icosaèdres. Couleurs par sommet.
    const paint = (g, color) => {
      const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const k = 0.85 + Math.random() * 0.3;
        a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const ni = (g) => (g.index ? g.toNonIndexed() : g);
    const trunk = () => ni(new THREE.CylinderGeometry(0.16, 0.3, 4, 7).translate(0, 2, 0));
    const pine = [paint(trunk(), 0x4a3828)];
    for (let i = 0; i < 4; i++) pine.push(paint(ni(new THREE.ConeGeometry(2.4 - i * 0.5, 2.8, 8).translate(0, 3 + i * 1.5, 0)), i % 2 ? 0x2f4a2a : 0x355230));
    const leafy = [paint(trunk(), 0x51402e)];
    for (let i = 0; i < 6; i++) {
      const r = 1.3 + Math.random() * 0.7;
      leafy.push(paint(ni(new THREE.IcosahedronGeometry(r, 1)).translate(rnd(-1.1, 1.1), 4.4 + rnd(-0.4, 1.6), rnd(-1.1, 1.1)), [0x4c6a33, 0x5a7538, 0x3f5b2c][i % 3]));
    }
    return [mergeGeometries(pine), mergeGeometries(leafy)];
  }

  trees() {
    const [pine, leafy] = this.treeGeometries();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const place = (geo, list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((t, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * 6.28);
        m4.compose(new THREE.Vector3(t.x, terrainHeight(t.x, t.z) - 0.1, t.z), q, new THREE.Vector3(t.s, t.s * rnd(0.9, 1.25), t.s));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
    };
    const pines = [], leafs = [];
    for (const t of this.map.trees) (Math.random() < 0.5 ? pines : leafs).push(t);
    // forêt autour de l'enceinte
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (this.assets ? HALF + 26 : HALF + 8) + Math.pow(Math.random(), 0.7) * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (fbm(x * 0.02, z * 0.02, 3) < 0.42) continue;
      const t = { x, z, s: rnd(0.9, 1.9) };
      (Math.random() < 0.65 ? pines : leafs).push(t);
    }
    place(pine, pines);
    place(leafy, leafs);
  }

  props() {
    const t = this.tex;
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9, map: t.wood, normalMap: t.wood_n });
    const metal = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.5, metalness: 0.8 });
    const wire = new THREE.LineBasicMaterial({ color: 0x151515 });
    const barrelCols = [0x2f4a6b, 0x7a2a1e, 0x3c5a32, 0x6a6a6a, 0x8a6a20];
    const barrelGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18);
    const ringGeo = new THREE.TorusGeometry(0.295, 0.012, 6, 20).rotateX(Math.PI / 2);
    const tireGeo = new THREE.TorusGeometry(0.42, 0.16, 10, 20).rotateX(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
    const poles = { x: [], z: [] };
    for (const p of this.map.props) {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      const A = this.assets;
      if (p.type === 'barrel' && A?.models.Barrel_01) {
        const b = A.clone('Barrel_01'); b.rotation.y = p.rot; g.add(b);
      } else if (p.type === 'tires' && A?.models.old_tyre) {
        for (let i = 0; i < 3; i++) {
          const r = A.clone('old_tyre');
          r.rotation.set(Math.PI / 2, 0, Math.random() * 6);
          r.position.set(rnd(-0.05, 0.05), 0.08 + i * 0.16, rnd(-0.05, 0.05));
          g.add(r);
        }
      } else if (p.type === 'barrel') {
        const m = new THREE.MeshStandardMaterial({ color: barrelCols[Math.floor(p.tint * barrelCols.length)], roughness: 0.55, metalness: 0.6, map: t.metal, normalMap: t.metal_n });
        const b = new THREE.Mesh(barrelGeo, m); b.position.y = 0.44; g.add(b);
        for (const y of [0.05, 0.3, 0.6, 0.86]) { const r = new THREE.Mesh(ringGeo, m); r.position.y = y; g.add(r); }
        g.rotation.y = p.rot;
      } else if (p.type === 'car') {
        g.add(buildCar(p));
      } else if (p.type === 'tires') {
        for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(tireGeo, tireMat); r.position.set(rnd(-0.05, 0.05), 0.16 + i * 0.31, rnd(-0.05, 0.05)); g.add(r); }
      } else if (p.type === 'pole' && this.polePreset()) {
        const pole = this.polePreset().clone(true);
        pole.rotation.y = p.axis === 'x' ? Math.PI / 2 : 0;
        g.add(pole);
        poles[p.axis].push(p);
      } else if (p.type === 'pole') {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 8, 8), wood); pole.position.y = 4; g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(p.axis === 'x' ? 0.12 : 1.8, 0.12, p.axis === 'x' ? 1.8 : 0.12), wood); arm.position.y = 7.6; g.add(arm);
        for (const o of [-0.75, 0, 0.75]) {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), metal);
          ins.position.set(p.axis === 'x' ? 0 : o, 7.74, p.axis === 'x' ? o : 0); g.add(ins);
        }
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), metal); tr.position.set(p.axis === 'x' ? 0 : 0.3, 6.6, p.axis === 'x' ? 0.3 : 0);
        if (Math.random() < 0.4) g.add(tr);
        poles[p.axis].push(p);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
    }
    // câbles en chaînette entre poteaux consécutifs
    for (const axis of ['x', 'z']) {
      const list = poles[axis].sort((a, b) => (axis === 'x' ? a.x - b.x : a.z - b.z));
      const pts = [];
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        const gap = axis === 'x' ? b.x - a.x : b.z - a.z;
        if (gap > 25) continue;
        const real = !!this._pole;
        const top = real ? this.poleTop : 7.8;
        for (const o of real ? [-0.6, 0.6] : [-0.75, 0, 0.75]) {
          const N = 16;
          for (let k = 0; k < N; k++) {
            for (const kk of [k, k + 1]) {
              const f = kk / N;
              const sag = Math.sin(f * Math.PI) * 0.9;
              const x = axis === 'x' ? a.x + gap * f : a.x + o;
              const z = axis === 'x' ? a.z + o : a.z + gap * f;
              pts.push(x, top - sag, z);
            }
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.group.add(new THREE.LineSegments(g, wire));
    }
  }

  car(g, p) {
    const t = this.tex;
    const colors = { car_red: 0x7c2420, car_blue: 0x22406a, car_white: 0xc4c4bf, car_gray: 0x4f5357 };
    const paint = new THREE.MeshPhysicalMaterial({
      color: colors[p.mat] || 0x777777, roughness: 0.42, metalness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.25,
      map: t.paint, roughnessMap: t.paint_r,
    });
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0e161c, roughness: 0.05, metalness: 0.3, envMapIntensity: 2.2 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.3, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 });
    const light = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0x332a18, roughness: 0.2 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0x2a0000, roughness: 0.3 });
    const car = new THREE.Group();
    // modèle orienté le long de X, tourné ensuite
    const body = new THREE.Mesh(new RoundedBoxGeometry(4.3, 0.62, 1.82, 3, 0.18), paint); body.position.y = 0.66; car.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(2.25, 0.56, 1.6, 3, 0.2), glassM); cabin.position.set(-0.2, 1.22, 0); car.add(cabin);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.08, 1.56, 2, 0.04), paint); roof.position.set(-0.3, 1.5, 0); car.add(roof);
    for (const z of [-0.79, 0.79]) {
      for (const x of [-0.95, 0.5]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), paint); pl.position.set(x, 1.22, z); car.add(pl); }
    }
    const bumperF = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.22, 1.86, 2, 0.06), dark); bumperF.position.set(2.17, 0.48, 0); car.add(bumperF);
    const bumperR = bumperF.clone(); bumperR.position.x = -2.17; car.add(bumperR);
    for (const z of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.12, 0.32, 2, 0.03), light); hl.position.set(2.15, 0.78, z); car.add(hl);
      const tl = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.3, 2, 0.03), red); tl.position.set(-2.15, 0.8, z); car.add(tl);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.7), dark); grille.position.set(2.16, 0.72, 0); car.add(grille);
    const wGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18).rotateX(Math.PI / 2);
    const rGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12).rotateX(Math.PI / 2);
    const flat = p.tint < 0.4;
    for (const x of [-1.38, 1.38]) for (const z of [-0.8, 0.8]) {
      const w = new THREE.Mesh(wGeo, tire); w.position.set(x, 0.34, z); car.add(w);
      const r = new THREE.Mesh(rGeo, rim); r.position.set(x, 0.34, z * 1.01); car.add(r);
    }
    // épave : légèrement affaissée d'un côté
    if (flat) { car.rotation.z = 0.025; car.rotation.x = 0.03; }
    if (!p.alongX) car.rotation.y = Math.PI / 2;
    g.add(car);
  }

  /** Poteau électrique complet (pièces « preset_01 » du kit Poly Haven), centré, ×1.25 de haut. */
  polePreset() {
    if (this._pole !== undefined) return this._pole;
    const kit = this.assets?.models.modular_electricity_poles;
    this._pole = null;
    if (!kit) return null;
    const parts = kit.children.filter((c) => c.name.startsWith('preset_01_'));
    if (!parts.length) return null;
    const g = new THREE.Group();
    for (const c of parts) { const o = c.clone(true); o.position.x -= -2.5; g.add(o); }
    const merged = mergeByMaterial(g);
    merged.scale.set(1.2, 1.3, 1.2);
    this._pole = merged;
    this.poleTop = 5.75 * 1.3;
    return merged;
  }

  puddles() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(64 + rnd(-22, 22), 64 + rnd(-22, 22), rnd(22, 40), 0, 7); ctx.fill(); }
    const alpha = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2c2a, roughness: 0.04, metalness: 0.2, alphaMap: alpha, transparent: true, depthWrite: false,
      envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    for (const [x, z, s] of [[-12, 1, 3], [10, -3, 2.5], [1, -28, 3.5], [-2, 30, 2.8], [-40, 10, 4], [38, -12, 3.2], [20, 40, 3], [-25, -45, 3.6], [-60, -8, 2.6], [61, 6, 2.8]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s * rnd(1, 1.6), s), mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 3;
      m.position.set(x, 0.02, z);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  glass() {
    const intact = new THREE.MeshPhysicalMaterial({
      color: 0x9fb4bd, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false,
    });
    const dirty = intact.clone(); dirty.opacity = 0.42; dirty.roughness = 0.3; dirty.color.set(0x8d9a94);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.7 });
    for (const w of this.map.windows) {
      const len = w.b - w.a, h = w.y1 - w.y0, mid = (w.a + w.b) / 2, my = (w.y0 + w.y1) / 2;
      const g = new THREE.Group();
      if (w.alongX) g.position.set(mid, my, w.fixed); else { g.position.set(w.fixed, my, mid); g.rotation.y = Math.PI / 2; }
      if (!w.broken) g.add(new THREE.Mesh(new THREE.PlaneGeometry(len, h), Math.random() < 0.5 ? intact : dirty));
      else {
        // vitre brisée : quelques éclats triangulaires dans les coins
        const shape = new THREE.Shape();
        shape.moveTo(-len / 2, -h / 2); shape.lineTo(-len / 2 + len * rnd(0.3, 0.6), -h / 2); shape.lineTo(-len / 2, -h / 2 + h * rnd(0.3, 0.7)); shape.closePath();
        const sh2 = new THREE.Shape();
        sh2.moveTo(len / 2, h / 2); sh2.lineTo(len / 2 - len * rnd(0.2, 0.5), h / 2); sh2.lineTo(len / 2, h / 2 - h * rnd(0.3, 0.6)); sh2.closePath();
        g.add(new THREE.Mesh(new THREE.ShapeGeometry([shape, sh2]), dirty));
      }
      // cadre
      const fz = 0.06;
      for (const [x, y, sw, sh] of [[0, h / 2, len, fz], [0, -h / 2, len, fz], [-len / 2, 0, fz, h], [len / 2, 0, fz, h], [0, 0, fz * 0.7, h]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.08), frameMat); f.position.set(x, y, 0); g.add(f);
      }
      this.group.add(g);
    }
  }

  dust() {
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-20, 20); pos[i * 3 + 1] = rnd(0, 8); pos[i * 3 + 2] = rnd(-20, 20); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.035, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true });
    this.dustPts = new THREE.Points(g, m);
    this.dustPts.frustumCulled = false;
    this.scene.add(this.dustPts);
  }

  update(dt, cam) {
    this.uniforms.uTime.value += dt;
    if (this.rainOn) this.updateRain(dt, cam);
    // la poussière suit la caméra (boîte de 40 m qui boucle)
    const p = this.dustPts.geometry.attributes.position, a = p.array, t = this.uniforms.uTime.value;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(t * 0.3 + i) * 0.003 + 0.004;
      a[i + 1] += Math.sin(t * 0.5 + i * 0.7) * 0.002;
      a[i + 2] += Math.cos(t * 0.27 + i) * 0.003;
      const dx = a[i] - cam.x, dz = a[i + 2] - cam.z;
      if (dx > 20) a[i] -= 40; else if (dx < -20) a[i] += 40;
      if (dz > 20) a[i + 2] -= 40; else if (dz < -20) a[i + 2] += 40;
      if (a[i + 1] > cam.y + 6) a[i + 1] -= 8; else if (a[i + 1] < 0) a[i + 1] += 8;
    }
    p.needsUpdate = true;
  }
}
