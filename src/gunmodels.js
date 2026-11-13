// Armes procédurales réalistes : silhouettes de profil extrudées avec chanfreins, rails à crans,
// chargeurs courbes, accessoires (viseurs, bouche, poignées, chargeurs) et finitions.
// Repère : canon vers -z, haut = +y. Les profils sont dessinés en (u = avant, v = haut).
import * as THREE from 'three';
import { getTextures } from './textures.js';

const SKIN_COLORS = {
  black: { metal: 0x1e2022, poly: 0x161718, accent: 0x2a2c2f },
  fde: { metal: 0x2a2620, poly: 0x8a7656, accent: 0x6f5f45 },
  od: { metal: 0x23251f, poly: 0x4b5139, accent: 0x3c4130 },
  gray: { metal: 0x3a3d41, poly: 0x5d6166, accent: 0x4a4d52 },
  gold: { metal: 0x8a6a20, poly: 0x1a1a1a, accent: 0xc9a040 },
};

const matCache = new Map();
export function gunMats(skin = 'black') {
  if (matCache.has(skin)) return matCache.get(skin);
  const t = getTextures();
  const nrm = t.gun_n.clone(); nrm.repeat.set(12, 12); nrm.needsUpdate = true;
  const rgh = t.gun_r.clone(); rgh.repeat.set(12, 12); rgh.needsUpdate = true;
  const c = SKIN_COLORS[skin] || SKIN_COLORS.black;
  const gold = skin === 'gold';
  const M = {
    metal: new THREE.MeshStandardMaterial({ color: c.metal, metalness: gold ? 1 : 0.8, roughness: gold ? 0.6 : 0.75, roughnessMap: rgh, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35) }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.95, roughness: 0.35, normalMap: nrm, normalScale: new THREE.Vector2(0.2, 0.2) }),
    poly: new THREE.MeshStandardMaterial({ color: c.poly, metalness: 0.05, roughness: 0.95, roughnessMap: rgh, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6) }),
    accent: new THREE.MeshStandardMaterial({ color: c.accent, metalness: 0.4, roughness: 0.7, normalMap: nrm, normalScale: new THREE.Vector2(0.3, 0.3) }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.3, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 1, roughness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3c22, metalness: 0, roughness: 0.55, map: t.wood }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3a6a8a, metalness: 0.1, roughness: 0.02, envMapIntensity: 3, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false }),
    lensTube: new THREE.MeshStandardMaterial({ color: 0x141516, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide }),
    dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 0.35, 0.25), toneMapped: false }),
    holo: new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.6, 0.4), toneMapped: false, transparent: true, side: THREE.DoubleSide }),
  };
  matCache.set(skin, M);
  return M;
}

// ---------- primitives ----------
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

/** Profil extrudé (épaisseur `w` le long de x), chanfreiné. */
function prof(parent, pts, w, mat, bevel = 0.0035, x = 0) {
  const shape = Array.isArray(pts) ? shapeFrom(pts) : pts;
  const b = Math.min(bevel, w * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, w - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.85, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -(w - 2 * b) / 2);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.x = x;
  parent.add(m);
  return m;
}

/** Cylindre le long de l'axe avant (u0 → u1) à la hauteur v. */
function tube(parent, u0, u1, v, r, mat, seg = 16, x = 0, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, Math.abs(u1 - u0), seg);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, v, -(u0 + u1) / 2);
  parent.add(m);
  return m;
}

function box(parent, u0, u1, v0, v1, w, mat, x = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, v1 - v0, u1 - u0), mat);
  m.position.set(x, (v0 + v1) / 2, -(u0 + u1) / 2);
  parent.add(m);
  return m;
}

/** Rail Picatinny avec crans. */
function rail(parent, u0, u1, v, mat, w = 0.021) {
  box(parent, u0, u1, v - 0.006, v, w, mat);
  const n = Math.floor((u1 - u0) / 0.0105);
  const g = new THREE.BoxGeometry(w + 0.004, 0.0045, 0.005);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, v + 0.002, -(u0 + 0.004 + i * 0.0105));
    parent.add(m);
  }
}

// ---------- accessoires ----------
function addOptic(g, M, kind, u, railV) {
  if (kind === 'reddot') {
    box(g, u - 0.025, u + 0.025, railV, railV + 0.012, 0.03, M.metal);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.045, 24, 1, true), M.lensTube);
    t.rotation.x = Math.PI / 2; t.position.set(0, railV + 0.033, -u); g.add(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.003, 8, 24), M.lensTube);
    ring.position.set(0, railV + 0.033, -(u + 0.022)); g.add(ring);
    const knob = tube(g, u - 0.008, u + 0.008, railV + 0.033, 0.006, M.metal, 10, 0.022);
    knob.rotation.set(0, 0, Math.PI / 2);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 8, 6), M.dot);
    dot.position.set(0, railV + 0.033, -(u + 0.02)); g.add(dot);
    return railV + 0.033;
  }
  if (kind === 'holo') {
    prof(g, [[u - 0.04, railV], [u + 0.035, railV], [u + 0.035, railV + 0.016], [u - 0.04, railV + 0.016]], 0.034, M.metal);
    // fenêtre (cadre en U ouvert)
    box(g, u + 0.015, u + 0.03, railV + 0.016, railV + 0.058, 0.004, M.metal, 0.02);
    box(g, u + 0.015, u + 0.03, railV + 0.016, railV + 0.058, 0.004, M.metal, -0.02);
    box(g, u + 0.0, u + 0.03, railV + 0.054, railV + 0.06, 0.044, M.metal);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.036), new THREE.MeshPhysicalMaterial({ color: 0x9fd0c0, transparent: true, opacity: 0.12, roughness: 0, metalness: 0 }));
    glass.position.set(0, railV + 0.036, -(u + 0.022)); g.add(glass);
    const ret = new THREE.Mesh(new THREE.RingGeometry(0.0055, 0.0065, 32), M.holo);
    ret.position.set(0, railV + 0.036, -(u + 0.023)); g.add(ret);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 10), M.holo);
    dot.position.set(0, railV + 0.036, -(u + 0.0231)); g.add(dot);
    box(g, u - 0.035, u - 0.01, railV + 0.016, railV + 0.03, 0.03, M.accent);
    return railV + 0.036;
  }
  if (kind === 'acog') {
    box(g, u - 0.03, u + 0.04, railV, railV + 0.014, 0.028, M.metal);
    const v = railV + 0.036;
    tube(g, u - 0.07, u + 0.07, v, 0.017, M.metal, 24);
    tube(g, u + 0.07, u + 0.105, v, 0.022, M.metal, 24, 0, 0.017);
    tube(g, u - 0.095, u - 0.07, v, 0.02, M.metal, 24, 0, 0.017);
    const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.021, 24), M.glass); lensF.position.set(0, v, -(u + 0.106)); g.add(lensF);
    const lensB = new THREE.Mesh(new THREE.CircleGeometry(0.019, 24), M.glass); lensB.rotation.y = Math.PI; lensB.position.set(0, v, -(u - 0.096)); g.add(lensB);
    box(g, u - 0.01, u + 0.01, v + 0.017, v + 0.025, 0.012, M.metal);
    // réticule (chevron lumineux) au centre de l'oculaire
    const ret = new THREE.Mesh(new THREE.ConeGeometry(0.0012, 0.003, 3), M.dot);
    ret.position.set(0, v - 0.001, -(u - 0.094)); g.add(ret);
    return v;
  }
  return null;
}

function addMuzzle(g, M, kind, u, v) {
  if (kind === 'comp') {
    tube(g, u, u + 0.05, v, 0.0135, M.metal, 12);
    for (let i = 0; i < 3; i++) box(g, u + 0.012 + i * 0.012, u + 0.018 + i * 0.012, v + 0.008, v + 0.0145, 0.016, M.dark);
    return u + 0.05;
  }
  if (kind === 'flash') {
    tube(g, u, u + 0.055, v, 0.0115, M.metal, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      box(g, u + 0.025, u + 0.055, v + Math.sin(a) * 0.009 - 0.001, v + Math.sin(a) * 0.009 + 0.001, 0.003, M.dark, Math.cos(a) * 0.009);
    }
    return u + 0.055;
  }
  if (kind === 'supp') {
    tube(g, u, u + 0.02, v, 0.013, M.metal, 16, 0, 0.019);
    tube(g, u + 0.02, u + 0.175, v, 0.0195, M.metal, 24);
    for (let i = 0; i < 4; i++) tube(g, u + 0.04 + i * 0.03, u + 0.042 + i * 0.03, v, 0.0198, M.dark, 24);
    return u + 0.175;
  }
  // embout fileté
  tube(g, u, u + 0.018, v, 0.0105, M.steel, 12);
  return u + 0.018;
}

function addUnderbarrel(g, M, kind, u, v) {
  if (kind === 'vgrip') {
    box(g, u - 0.015, u + 0.015, v - 0.008, v, 0.02, M.metal);
    const grip = tube(g, 0, 0.001, 0, 0.013, M.poly, 12);
    grip.geometry.dispose();
    grip.geometry = new THREE.CylinderGeometry(0.0135, 0.0125, 0.085, 14);
    grip.position.set(0, v - 0.05, -u);
    return [0, v - 0.05, -u];
  }
  if (kind === 'agrip') {
    prof(g, [[u - 0.05, v], [u + 0.035, v], [u + 0.02, v - 0.03], [u - 0.03, v - 0.012]], 0.026, M.poly, 0.004);
    return [0, v - 0.02, -(u - 0.005)];
  }
  return null;
}

function ironSights(g, M, uRear, uFront, v) {
  prof(g, [[uRear - 0.015, v], [uRear + 0.012, v], [uRear + 0.008, v + 0.026], [uRear - 0.01, v + 0.026]], 0.022, M.metal, 0.002);
  box(g, uRear - 0.004, uRear + 0.004, v + 0.026, v + 0.03, 0.012, M.dark);
  prof(g, [[uFront - 0.012, v], [uFront + 0.012, v], [uFront + 0.004, v + 0.034], [uFront - 0.006, v + 0.034]], 0.018, M.metal, 0.002);
  box(g, uFront - 0.002, uFront + 0.002, v + 0.034, v + 0.042, 0.003, M.steel);
  return v + 0.037;
}

// ---------- armes ----------
function finalize(g, info) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, ...info };
}

export function buildAR(att = {}, skin = 'black') {
  const M = gunMats(skin), g = new THREE.Group();
  // receveur supérieur
  prof(g, [[0, 0.012], [0.285, 0.012], [0.285, 0.058], [0.06, 0.058], [0.04, 0.062], [0.0, 0.062]], 0.054, M.metal);
  box(g, 0.085, 0.165, 0.022, 0.046, 0.003, M.dark, 0.0275);            // fenêtre d'éjection
  tube(g, 0.06, 0.08, 0.04, 0.008, M.metal, 10, 0.03);                    // assistance de fermeture
  box(g, -0.03, 0.02, 0.054, 0.066, 0.042, M.metal);                       // levier d'armement
  // receveur inférieur + puits de chargeur
  const lower = prof(g, [[0, 0.013], [0.27, 0.013], [0.27, -0.002], [0.238, -0.016], [0.234, -0.052], [0.153, -0.052], [0.15, -0.018], [0.09, -0.02], [0.05, -0.012], [0.0, -0.006]], 0.05, M.metal);
  lower.name = 'lower';
  box(g, 0.065, 0.142, -0.05, -0.044, 0.008, M.metal);                    // pontet
  prof(g, [[0.135, -0.044], [0.142, -0.044], [0.142, -0.02], [0.135, -0.02]], 0.008, M.metal, 0.001);
  prof(g, [[0.1, -0.02], [0.108, -0.02], [0.112, -0.04], [0.104, -0.042]], 0.006, M.steel, 0.001); // détente
  tube(g, 0.12, 0.13, 0.0, 0.006, M.steel, 8, -0.027);                    // sélecteur
  // poignée pistolet
  prof(g, [[0.03, -0.01], [0.075, -0.01], [0.064, -0.03], [0.058, -0.06, 0.05, -0.11], [0.01, -0.112], [0.004, -0.1], [0.018, -0.05, 0.025, -0.03]], 0.033, M.poly, 0.006);
  // tube de crosse + crosse réglable
  tube(g, -0.2, 0.0, 0.036, 0.0155, M.metal, 16);
  prof(g, [[-0.085, 0.06], [-0.24, 0.056], [-0.258, 0.05], [-0.268, -0.055], [-0.24, -0.068], [-0.2, -0.03, -0.12, 0.004], [-0.085, 0.012]], 0.046, M.poly, 0.006);
  box(g, -0.272, -0.258, -0.06, 0.05, 0.048, M.rubber);
  // garde-main octogonal avec fentes M-LOK
  const hg = tube(g, 0.285, 0.6, 0.036, 0.0335, M.poly, 8);
  hg.rotation.z = Math.PI / 8;
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) box(g, 0.32 + i * 0.07, 0.36 + i * 0.07, 0.03, 0.042, 0.003, M.dark, s * 0.032);
  // rail supérieur continu
  rail(g, -0.005, 0.6, 0.068, M.metal);
  // canon, bloc d'emprunt de gaz
  tube(g, 0.6, 0.78, 0.036, 0.0095, M.steel, 14);
  box(g, 0.615, 0.64, 0.024, 0.048, 0.024, M.steel);
  // chargeur courbe
  const ext = att.mag === 'ext';
  const bot = ext ? -0.28 : -0.2;
  const mag = prof(g, [[0.158, -0.046], [0.229, -0.046], [0.242, -0.1, 0.272, bot], [0.205, bot - 0.012], [0.182, -0.11, 0.158, -0.046]], 0.026, M.poly, 0.004);
  box(g, 0.2, 0.275, bot - 0.018, bot - 0.004, 0.03, M.poly).rotation.x = 0.35;
  // accessoires
  const muzzleU = addMuzzle(g, M, att.muzzle || 'none', 0.78, 0.036);
  let sightV = addOptic(g, M, att.optic, 0.12, 0.068);
  if (sightV === null) sightV = ironSights(g, M, 0.02, 0.56, 0.068);
  else {
    // guidon rabattable à l'avant
    box(g, 0.55, 0.57, 0.068, 0.076, 0.018, M.metal);
  }
  const ub = addUnderbarrel(g, M, att.underbarrel, 0.48, 0.002);
  const sightU = att.optic === 'acog' ? 0.12 - 0.096 : att.optic === 'holo' ? 0.12 + 0.022 : att.optic === 'reddot' ? 0.12 : 0.02;
  return finalize(g, {
    mag, magBase: mag.position.clone(),
    sight: new THREE.Vector3(0, sightV, -sightU),
    muzzle: new THREE.Vector3(0, 0.036, -muzzleU - 0.01),
    eject: new THREE.Vector3(0.035, 0.035, -0.12),
    gripR: [0, -0.055, -0.04], supL: ub || [0, -0.01, -0.46],
    hip: new THREE.Vector3(0.14, -0.19, -0.36), adsDist: att.optic === 'acog' ? 0.11 : 0.16,
  });
}

export function buildSMG(att = {}, skin = 'black') {
  const M = gunMats(skin), g = new THREE.Group();
  // receveur tubulaire
  prof(g, [[0, 0.0], [0.27, 0.0], [0.27, 0.05], [0.25, 0.058], [0.02, 0.058], [0, 0.05]], 0.048, M.metal);
  box(g, 0.1, 0.17, 0.018, 0.04, 0.003, M.dark, 0.0245);
  tube(g, 0.16, 0.2, 0.05, 0.006, M.steel, 8, -0.026).rotation.z = Math.PI / 2;  // levier latéral
  // carcasse polymère avec poignée intégrée
  prof(g, [[0.0, 0.002], [0.2, 0.002], [0.2, -0.02], [0.13, -0.022], [0.115, -0.04], [0.07, -0.04], [0.065, -0.025], [0.06, -0.05, 0.05, -0.115], [0.012, -0.115], [0.01, -0.08], [0.02, -0.025], [0.0, -0.02]], 0.044, M.poly, 0.006);
  // chargeur légèrement courbe
  const ext = att.mag === 'ext';
  const bot = ext ? -0.25 : -0.19;
  const mag = prof(g, [[0.13, -0.03], [0.175, -0.03], [0.185, -0.1, 0.205, bot], [0.16, bot - 0.006], [0.145, -0.1, 0.13, -0.03]], 0.024, M.metal, 0.003);
  // garde-main court
  prof(g, [[0.2, -0.018], [0.33, -0.018], [0.34, 0.0], [0.33, 0.045], [0.2, 0.045]], 0.05, M.poly, 0.006);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) box(g, 0.22 + i * 0.035, 0.24 + i * 0.035, 0.012, 0.022, 0.003, M.dark, s * 0.026);
  rail(g, 0.02, 0.27, 0.064, M.metal);
  tube(g, 0.33, 0.38, 0.025, 0.0095, M.steel, 12);
  // crosse repliable (tiges + plaque)
  for (const s of [-1, 1]) tube(g, -0.22, 0.0, 0.03, 0.0045, M.steel, 8, s * 0.017);
  prof(g, [[-0.235, 0.05], [-0.215, 0.05], [-0.215, -0.06], [-0.235, -0.06]], 0.045, M.poly, 0.004);
  const muzzleU = addMuzzle(g, M, att.muzzle || 'none', 0.38, 0.025);
  let sightV = addOptic(g, M, att.optic, 0.11, 0.064);
  if (sightV === null) sightV = ironSights(g, M, 0.03, 0.25, 0.064);
  const ub = addUnderbarrel(g, M, att.underbarrel, 0.27, -0.018);
  const sightU = att.optic === 'holo' ? 0.11 + 0.022 : att.optic === 'reddot' ? 0.11 : 0.03;
  return finalize(g, {
    mag, magBase: mag.position.clone(),
    sight: new THREE.Vector3(0, sightV, -sightU),
    muzzle: new THREE.Vector3(0, 0.025, -muzzleU - 0.01),
    eject: new THREE.Vector3(0.03, 0.03, -0.13),
    gripR: [0, -0.06, -0.035], supL: ub || [0, -0.02, -0.28],
    hip: new THREE.Vector3(0.135, -0.185, -0.34), adsDist: 0.17,
  });
}

export function buildShotgun(att = {}, skin = 'black') {
  const M = gunMats(skin), g = new THREE.Group();
  const stockMat = skin === 'black' ? M.wood : M.poly;
  // boîte de culasse
  prof(g, [[0, -0.02], [0.23, -0.02], [0.23, 0.045], [0.04, 0.05], [0.0, 0.035]], 0.05, M.metal);
  box(g, 0.08, 0.16, 0.0, 0.03, 0.003, M.dark, 0.0255);
  box(g, 0.06, 0.15, -0.032, -0.026, 0.008, M.metal);
  prof(g, [[0.06, -0.02], [0.15, -0.02], [0.15, -0.032], [0.06, -0.032]], 0.03, M.metal, 0.002);
  prof(g, [[0.1, -0.022], [0.106, -0.022], [0.11, -0.04], [0.103, -0.042]], 0.006, M.steel, 0.001);
  // crosse avec poignée galbée
  prof(g, [[0.0, 0.035], [0.0, -0.02], [0.04, -0.03], [0.02, -0.06, -0.02, -0.07], [-0.05, -0.065], [-0.3, -0.1], [-0.32, -0.095], [-0.33, 0.03], [-0.31, 0.045], [-0.08, 0.03]], 0.044, stockMat, 0.008);
  box(g, -0.345, -0.33, -0.1, 0.035, 0.046, M.rubber);
  // canon + tube magasin
  tube(g, 0.23, 0.72, 0.025, 0.0115, M.steel, 16);
  tube(g, 0.23, 0.62, -0.004, 0.0115, M.metal, 16);
  tube(g, 0.62, 0.635, -0.004, 0.0125, M.metal, 16);
  box(g, 0.6, 0.62, -0.004, 0.025, 0.012, M.metal);
  box(g, 0.705, 0.712, 0.036, 0.044, 0.005, M.steel);                       // guidon (bille)
  // pompe striée
  const pump = new THREE.Group(); g.add(pump);
  prof(pump, [[0.3, -0.024], [0.48, -0.024], [0.48, 0.016], [0.3, 0.016]], 0.05, stockMat, 0.01);
  for (let i = 0; i < 8; i++) box(pump, 0.315 + i * 0.02, 0.322 + i * 0.02, -0.026, 0.018, 0.052, M.dark);
  rail(g, 0.03, 0.2, 0.051, M.metal);
  let sightV = addOptic(g, M, att.optic, 0.1, 0.051);
  if (sightV === null) sightV = 0.046;
  const sightU = att.optic === 'holo' ? 0.122 : att.optic === 'reddot' ? 0.1 : 0.05;
  return finalize(g, {
    mag: null, pump, pumpBase: 0,
    sight: new THREE.Vector3(0, sightV, -sightU),
    muzzle: new THREE.Vector3(0, 0.025, -0.73),
    eject: new THREE.Vector3(0.035, 0.02, -0.12),
    gripR: [0, -0.05, 0.01], supL: [0, -0.02, -0.39],
    hip: new THREE.Vector3(0.14, -0.19, -0.35), adsDist: 0.2,
  });
}

// ---------- armes réelles (pack CC0 Stein Games) ----------
let ASSETS = null;
export function setGunAssets(a) { ASSETS = a; }

// Points clés en coordonnées du modèle (m) : [y, z] avec z = vers la bouche.
const REAL = {
  ar: { asset: 'AK47', grip: [-0.045, -0.018], sup: [0.06, 0.3], iron: [0.145, 0.12], muzzle: [0.09, 0.72], rail: [0.136, -0.02, 0.1], eject: [0.11, 0.05] },
  smg: { asset: 'MP5', grip: [-0.03, -0.01], sup: [0.08, 0.22], iron: [0.186, 0.0], muzzle: [0.119, 0.417], rail: [0.183, 0.02, 0.15], eject: [0.15, 0.06] },
  dmr: { asset: 'M14', grip: [-0.02, -0.08], sup: [0.01, 0.35], iron: [0.09, 0.1], muzzle: [0.053, 0.849], rail: [0.092, -0.02, 0.2], eject: [0.07, 0.04] },
  sniper: { asset: 'M700', grip: [-0.02, -0.08], sup: [-0.01, 0.28], scope: [0.052, 0.0, 0.24], muzzle: [0.03, 0.737], eject: [0.04, 0.05] },
  pistol: { asset: '1911', grip: [-0.025, -0.035], sup: null, iron: [0.092, -0.02], muzzle: [0.069, 0.181], eject: [0.08, 0.02] },
};
const SKIN_TINT = { black: null, fde: 0xd9c49a, od: 0xa9b38a, gray: 0xb8bcc2, gold: 0xffd27a };

const P = (yz) => [0, yz[0], -yz[1]];

/** Arme réelle + accessoires ; retourne null si l'asset n'est pas chargé. */
export function buildRealGun(id, att = {}, skin = 'black') {
  const R = REAL[id];
  const src = R && ASSETS?.weapons?.[R.asset];
  if (!src) return null;
  const M = gunMats(skin === 'black' ? 'black' : skin);
  const g = new THREE.Group();
  const inner = src.scene.clone(true);
  inner.rotation.y = Math.PI; // le canon du modèle pointe vers +z
  const tint = SKIN_TINT[skin];
  if (tint) {
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.set(tint);
      if (skin === 'gold') { o.material.metalness = 1; o.material.roughness = 0.35; }
    });
  }
  g.add(inner);
  let sightV = null, sightU = 0, adsDist = 0.16;
  if (R.scope) {
    // lunette de tir longue portée sur montage
    const [v, u0, u1] = R.scope, c = (u0 + u1) / 2, sv = v + 0.045;
    box(g, c - 0.06, c - 0.035, v, sv - 0.012, 0.02, M.metal); box(g, c + 0.035, c + 0.06, v, sv - 0.012, 0.02, M.metal);
    tube(g, c - 0.11, c + 0.1, sv, 0.0155, M.metal, 24);
    tube(g, c + 0.1, c + 0.16, sv, 0.024, M.metal, 24, 0, 0.0155);
    tube(g, c - 0.16, c - 0.11, sv, 0.02, M.metal, 24, 0, 0.0155);
    tube(g, c - 0.02, c + 0.02, sv + 0.022, 0.012, M.metal, 14);
    const tur = tube(g, -0.015, 0.015, 0, 0.012, M.metal, 14); tur.rotation.set(0, 0, Math.PI / 2); tur.position.set(0.022, sv, -c);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 24), M.glass); lens.position.set(0, sv, -(c + 0.161)); g.add(lens);
    sightV = sv; sightU = c - 0.16; adsDist = 0.09;
  } else {
    const opt = att.optic && att.optic !== 'iron' && R.rail ? att.optic : null;
    if (opt) {
      const [rv, r0, r1] = R.rail;
      rail(g, r0, r1, rv + 0.007, M.metal);
      const u = (r0 + r1) / 2;
      sightV = addOptic(g, M, opt, u, rv + 0.007);
      sightU = opt === 'acog' ? u - 0.096 : opt === 'holo' ? u + 0.022 : u;
      adsDist = opt === 'acog' ? 0.11 : 0.15;
    } else {
      [sightV, sightU] = R.iron;
      adsDist = id === 'pistol' ? 0.3 : 0.13;
    }
  }
  // bouche du canon
  let muzzleU = R.muzzle[1];
  if (att.muzzle && att.muzzle !== 'none') muzzleU = addMuzzle(g, M, att.muzzle, R.muzzle[1], R.muzzle[0]);
  // poignée sous le garde-main
  let sup = R.sup ? P(R.sup) : null;
  if (R.sup && att.underbarrel && att.underbarrel !== 'none') {
    const s = addUnderbarrel(g, M, att.underbarrel, R.sup[1], R.sup[0] - 0.035);
    if (s) sup = s;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const grip = P(R.grip);
  const G = id === 'pistol' ? [0.12, -0.2, -0.36] : [0.14, -0.245, -0.4]; // position de la main droite à la hanche
  return {
    group: g, mag: null, real: true,
    sight: new THREE.Vector3(0, sightV, -sightU),
    muzzle: new THREE.Vector3(0, R.muzzle[0], -muzzleU - 0.01),
    eject: new THREE.Vector3(0.03, R.eject[0], -R.eject[1]),
    gripR: grip, supL: sup || [grip[0] - 0.01, grip[1] - 0.01, grip[2] + 0.01],
    hip: new THREE.Vector3(G[0] - grip[0], G[1] - grip[1], G[2] - grip[2]),
    adsDist,
  };
}

/** Version 3e personne (sans bras) pour les soldats. */
export function buildThirdPersonGun(kind = 'ar') {
  const real = buildRealGun(kind === 'smg' ? 'smg' : 'ar', { optic: kind === 'smg' ? 'reddot' : 'iron' });
  if (real) {
    const muzzle = new THREE.Object3D();
    muzzle.position.copy(real.muzzle);
    real.group.add(muzzle);
    return { group: real.group, muzzle, gripR: real.gripR, supL: real.supL };
  }
  const b = kind === 'smg' ? buildSMG({ optic: 'reddot' }) : buildAR({ optic: kind === 'ar' ? 'holo' : 'reddot', underbarrel: 'vgrip' });
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(b.muzzle);
  b.group.add(muzzle);
  return { group: b.group, muzzle, gripR: b.gripR, supL: b.supL };
}
