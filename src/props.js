// Obstacles détaillés : voitures à carrosserie profilée, murets de sacs de sable, caisses à claire-voie,
// palettes, bureaux et cadres de conteneurs maritimes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures } from './textures.js';

const rnd = (a, b) => a + Math.random() * (b - a);

function shapeFrom(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  return s;
}

/** Profil extrudé dans le plan XY (x = longueur, y = hauteur), épaisseur w centrée sur z. */
function extrude(shape, w, bevel, mat) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -(w - 2 * bevel) / 2);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- voitures
const CAR_COLORS = { car_red: 0x7a1f1a, car_blue: 0x1f3d66, car_white: 0xc9c8c2, car_gray: 0x4a4e52 };

export function buildCar(p) {
  const t = getTextures();
  const color = CAR_COLORS[p.mat] || 0x6a6a6a;
  const dirty = p.tint < 0.5;
  const paint = new THREE.MeshPhysicalMaterial({
    color, roughness: dirty ? 0.55 : 0.3, metalness: 0.55, clearcoat: dirty ? 0.3 : 0.9, clearcoatRoughness: 0.2,
    map: t.paint, roughnessMap: t.paint_r,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.04, metalness: 0.2, envMapIntensity: 2.2, transparent: true, opacity: 0.88 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb5b8bb, roughness: 0.18, metalness: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 });
  const rimM = new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.3, metalness: 0.9 });
  const lightF = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0x2a2620, roughness: 0.1, metalness: 0.3 });
  const lightR = new THREE.MeshStandardMaterial({ color: 0x8e1010, emissive: 0x220000, roughness: 0.2 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 });

  const car = new THREE.Group();
  const W = 1.8;
  // caisse : silhouette avec passages de roue
  const R = 0.37, fx = 1.36, rx = -1.36, wy = 0.36;
  const body = new THREE.Shape();
  body.moveTo(2.12, 0.3);
  body.quadraticCurveTo(2.24, 0.45, 2.2, 0.66);           // pare-chocs avant
  body.quadraticCurveTo(2.1, 0.8, 1.6, 0.86);             // capot
  body.lineTo(0.95, 0.93);
  body.lineTo(-1.5, 0.98);                                 // ligne de caisse
  body.quadraticCurveTo(-2.12, 0.98, -2.2, 0.82);          // coffre
  body.quadraticCurveTo(-2.26, 0.5, -2.14, 0.3);           // pare-chocs arrière
  body.lineTo(rx - R - 0.04, 0.3);
  body.absarc(rx, wy, R + 0.04, Math.PI, 0, true);         // passage de roue arrière
  body.lineTo(fx - R - 0.04, 0.3);
  body.absarc(fx, wy, R + 0.04, Math.PI, 0, true);         // passage de roue avant
  body.lineTo(2.12, 0.3);
  car.add(extrude(body, W, 0.07, paint));
  // habitacle vitré + toit
  const cabin = shapeFrom([[0.92, 0.93], [0.28, 1.36], [-0.78, 1.38], [-1.48, 0.98]]);
  const cab = extrude(cabin, 1.52, 0.05, glass); car.add(cab);
  const roof = extrude(shapeFrom([[0.3, 1.33], [-0.78, 1.35], [-0.82, 1.42], [0.24, 1.41]]), 1.5, 0.03, paint); car.add(roof);
  // montants A, B, C
  const pillar = (a, b, wdt) => {
    for (const s of [-1, 1]) {
      const A = new THREE.Vector3(a[0], a[1], s * 0.77), B = new THREE.Vector3(b[0], b[1], s * 0.77);
      const d = B.clone().sub(A);
      const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, d.length(), 0.03), paint);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      car.add(m);
    }
  };
  pillar([0.9, 0.95], [0.29, 1.36], 0.06);
  pillar([-0.22, 0.97], [-0.22, 1.37], 0.07);
  pillar([-1.45, 1.0], [-0.78, 1.37], 0.1);
  // pare-chocs, calandre, bas de caisse
  const bumper = (x) => { const b = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.2, W + 0.02, 3, 0.06), trim); b.position.set(x, 0.42, 0); car.add(b); };
  bumper(2.16); bumper(-2.16);
  const grille = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.12, 0.75, 2, 0.015), trim); grille.position.set(2.2, 0.66, 0); car.add(grille);
  for (const s of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.03), trim); sill.position.set(0, 0.32, s * (W / 2 + 0.005)); car.add(sill);
    const hl = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.34, 2, 0.03), lightF); hl.position.set(2.17, 0.72, s * 0.62); car.add(hl);
    const tl = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.12, 0.3, 2, 0.03), lightR); tl.position.set(-2.2, 0.82, s * 0.64); car.add(tl);
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.1, 2, 0.03), paint); mirror.position.set(0.78, 1.0, s * (W / 2 + 0.06)); car.add(mirror);
    // lignes de portières
    for (const x of [0.92, -0.2, -1.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.62, 0.006), trim); l.position.set(x, 0.62, s * (W / 2 + 0.002)); car.add(l); }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), chrome);
    for (const x of [0.55, -0.6]) { const h = handle.clone(); h.position.set(x, 0.86, s * (W / 2 + 0.01)); car.add(h); }
  }
  for (const x of [2.235, -2.245]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.11, 0.48), plate); pl.position.set(x, x > 0 ? 0.47 : 0.62, 0); car.add(pl); }
  // roues
  const tireG = new THREE.CylinderGeometry(R, R, 0.22, 24); tireG.rotateX(Math.PI / 2);
  const sideG = new THREE.TorusGeometry(R - 0.06, 0.06, 8, 24);
  const rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20); rimG.rotateX(Math.PI / 2);
  const spokeG = new THREE.BoxGeometry(0.035, 0.36, 0.02);
  const flat = p.tint < 0.35;
  for (const x of [fx, rx]) for (const s of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(x, wy, s * (W / 2 - 0.12));
    wg.add(new THREE.Mesh(tireG, tire));
    const side = new THREE.Mesh(sideG, tire); side.position.z = s * 0.1; wg.add(side);
    const rim = new THREE.Mesh(rimG, rimM); rim.position.z = s * 0.105; wg.add(rim);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(spokeG, rimM); sp.rotation.z = (k / 5) * Math.PI; sp.position.z = s * 0.12; wg.add(sp); }
    if (flat && x === fx && s === 1) wg.scale.y = 0.85;
    car.add(wg);
  }
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (flat) { car.rotation.z = 0.02; car.rotation.x = 0.025; }
  if (!p.alongX) car.rotation.y = Math.PI / 2;
  if (p.tint > 0.7) car.rotation.y += Math.PI; // certaines garées dans l'autre sens
  return car;
}

// ---------------------------------------------------------------- sacs de sable
function bagGeometry() {
  // sac rempli : plat, bords bombés, extrémités légèrement pincées
  const g = new RoundedBoxGeometry(0.55, 0.15, 0.34, 5, 0.045);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 - Math.pow(Math.abs(x) / 0.275, 4) * 0.45 - Math.pow(Math.abs(z) / 0.17, 4) * 0.25;
    p.setY(i, y * Math.max(0.5, k) + (Math.sin(x * 23) * Math.cos(z * 19)) * 0.004);
    const pinch = Math.max(0, Math.abs(x) - 0.24) * 1.6;
    p.setZ(i, z * (1 - pinch));
  }
  g.computeVertexNormals();
  return g;
}

export function buildSandbags(boxes) {
  const t = getTextures();
  const tex = t.sandbag.clone(); tex.repeat.set(1, 1); tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: t.paint, normalMap: t.sandbag_n, normalScale: new THREE.Vector2(1.4, 1.4), color: 0x9c8a63, roughness: 1 });
  void tex;
  const geo = bagGeometry();
  const mats = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  for (const b of boxes) {
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z, h = b.max.y - b.min.y;
    const alongX = w >= d;
    const L = alongX ? w : d, T = alongX ? d : w;
    const rows = Math.max(1, Math.round(h / 0.15));
    const cols = Math.max(1, Math.round(T / 0.36));
    const n = Math.max(1, Math.round(L / 0.55));
    const step = (L - 0.56) / Math.max(1, n - 1);
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const ux = -L / 2 + 0.28 + i * step + (r % 2 ? step * 0.5 : 0); // rangées décalées comme des briques
        if (ux > L / 2 - 0.27) continue;
        for (let c = 0; c < cols; c++) {
          const v = -T / 2 + 0.18 + c * (T - 0.36) / Math.max(1, cols - 1);
          const y = b.min.y + 0.075 + r * (h - 0.15) / Math.max(1, rows - 1);
          const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
          const x = alongX ? cx + ux : cx + v, z = alongX ? cz + v : cz + ux;
          e.set(rnd(-0.04, 0.04), (alongX ? 0 : Math.PI / 2) + rnd(-0.08, 0.08), rnd(-0.04, 0.04));
          q.setFromEuler(e);
          s.set(rnd(0.95, 1.05), rnd(0.9, 1.1), 1);
          mats.push(m4.compose(new THREE.Vector3(x, y, z), q, s).clone());
        }
      }
    }
  }
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

// ---------------------------------------------------------------- caisses, palettes, bureaux
function crateGeos(size) {
  const g = [], dark = [], metal = [];
  const s = size, hs = s / 2, beam = 0.085;
  g.push(new THREE.BoxGeometry(s - 0.04, s - 0.04, s - 0.04));
  // arêtes
  const edge = (w, h, d, x, y, z) => { const b = new RoundedBoxGeometry(w, h, d, 2, 0.012); b.translate(x, y, z); dark.push(b); };
  for (const a of [-1, 1]) for (const c of [-1, 1]) {
    edge(beam, s, beam, a * (hs - beam / 2), 0, c * (hs - beam / 2));
    edge(s, beam, beam, 0, a * (hs - beam / 2), c * (hs - beam / 2));
    edge(beam, beam, s, a * (hs - beam / 2), c * (hs - beam / 2), 0);
  }
  // croisillons sur les 4 faces
  const diag = Math.hypot(s - 2 * beam, s - 2 * beam);
  for (let f = 0; f < 4; f++) {
    const b = new THREE.BoxGeometry(beam * 0.9, diag, 0.03);
    b.rotateZ(Math.PI / 4 * (f % 2 ? 1 : -1));
    b.translate(0, 0, hs + 0.005);
    b.rotateY((f * Math.PI) / 2);
    dark.push(b);
  }
  // équerres métalliques aux coins
  for (const a of [-1, 1]) for (const b2 of [-1, 1]) for (const c of [-1, 1]) {
    const k = new THREE.BoxGeometry(0.12, 0.12, 0.12); k.translate(a * (hs - 0.05), b2 * (hs - 0.05), c * (hs - 0.05)); metal.push(k);
  }
  const merge = (list) => mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  return [merge(g), merge(dark), merge(metal)];
}

export function buildCrates(boxes) {
  const t = getTextures();
  const wood = new THREE.MeshStandardMaterial({ map: t.wood, normalMap: t.wood_n, roughness: 0.92, color: 0xa8957c });
  const woodDark = new THREE.MeshStandardMaterial({ map: t.wood, normalMap: t.wood_n, roughness: 0.88, color: 0x6e5d48 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3b3c, roughness: 0.5, metalness: 0.8 });
  const root = new THREE.Group();
  const cubes = [], other = [];
  for (const b of boxes) {
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
    if (Math.abs(w - d) < 0.1 && Math.abs(w - h) < 0.1) cubes.push({ b, s: w });
    else other.push({ b, w, h, d });
  }
  if (cubes.length) {
    const [core, dark, metal] = crateGeos(cubes[0].s);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const tr = cubes.map(({ b }) => m4.compose(new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2),
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.floor(Math.random() * 4) * Math.PI / 2), new THREE.Vector3(1, 1, 1)).clone());
    for (const [g, m] of [[core, wood], [dark, woodDark], [metal, steel]]) {
      const im = new THREE.InstancedMesh(g, m, tr.length);
      tr.forEach((x, i) => im.setMatrixAt(i, x));
      im.castShadow = true; im.receiveShadow = true;
      root.add(im);
    }
  }
  for (const { b, w, h, d } of other) {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const grp = new THREE.Group();
    grp.position.set(cx, b.min.y, cz);
    if (h < 0.3) {
      // palette : 3 traverses + lattes
      for (const z of [-d / 2 + 0.05, 0, d / 2 - 0.05]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, 0.1), woodDark); r.position.set(0, h * 0.3, z); grp.add(r); }
      for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.25, d), wood); s.position.set(-w / 2 + 0.05 + i * (w - 0.1) / 6, h * 0.86, 0); grp.add(s); }
    } else {
      // bureau : plateau + pieds + caisson
      const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.04, d, 2, 0.012), wood); top.position.y = h - 0.02; grp.add(top);
      for (const a of [-1, 1]) for (const c of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.04, 0.05), steel); l.position.set(a * (w / 2 - 0.05), (h - 0.04) / 2, c * (d / 2 - 0.05)); grp.add(l); }
      const drawer = new THREE.Mesh(new RoundedBoxGeometry(0.42, h * 0.75, d * 0.85, 2, 0.01), steel); drawer.position.set(w / 2 - 0.25, h * 0.38, 0); grp.add(drawer);
      const mon = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.32, 0.03, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
      mon.position.set(-0.2, h + 0.24, -d / 4); grp.add(mon);
    }
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(grp);
  }
  return root;
}

// ---------------------------------------------------------------- conteneurs
const CONT_COLORS = { c_red: 0x6e1f15, c_blue: 0x15335a, c_green: 0x1f3d24, c_orange: 0x7a3a12, c_gray: 0x4a4e52, c_yellow: 0x6e5a12 };

export function buildContainerDetails(list) {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.6, metalness: 0.7 });
  for (const c of list) {
    const frameMat = new THREE.MeshStandardMaterial({ color: CONT_COLORS[c.mat] || 0x444444, roughness: 0.55, metalness: 0.5 });
    const g = new THREE.Group();
    g.position.set(c.x, c.y0, c.z);
    if (!c.alongX) g.rotation.y = Math.PI / 2;
    const L = c.L, W = c.W, H = c.H, e = 0.02;
    // montants d'angle et longerons
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.16), frameMat); post.position.set(a * (L / 2 - 0.08 + e), H / 2, b * (W / 2 - 0.08 + e)); g.add(post);
      const casting = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), steel);
      for (const y of [0.06, H - 0.06]) { const k = casting.clone(); k.position.set(a * (L / 2 - 0.08 + e), y, b * (W / 2 - 0.08 + e)); g.add(k); }
    }
    for (const b of [-1, 1]) for (const y of [0.09, H - 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, 0.06), frameMat); rail.position.set(0, y, b * (W / 2 + e)); g.add(rail);
    }
    for (const a of [-1, 1]) for (const y of [0.09, H - 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, W), frameMat); rail.position.set(a * (L / 2 + e), y, 0); g.add(rail);
    }
    // portes : barres de verrouillage + poignées (côté +x)
    const dx = L / 2 + e + 0.02;
    for (const z of [-0.85, -0.35, 0.35, 0.85]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, H - 0.25, 10), steel); rod.position.set(dx, H / 2, z); g.add(rod);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.22), steel); handle.position.set(dx + 0.02, H * 0.45, z + 0.1); g.add(handle);
      for (const y of [0.25, H - 0.25]) { const cam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.08), steel); cam.position.set(dx, y, z); g.add(cam); }
    }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.01, H - 0.3, 0.02), steel); seam.position.set(dx - 0.015, H / 2, 0); g.add(seam);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(g);
  }
  return root;
}
