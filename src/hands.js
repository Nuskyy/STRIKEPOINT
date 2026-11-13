// Mains et avant-bras de la vue à la 1re personne : doigts articulés enroulés autour de la poignée
// et du garde-main, gants avec renforts, avant-bras arrondis et manches camouflées.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getTextures } from './textures.js';

let M = null;
function mats() {
  if (M) return M;
  const t = getTextures();
  const leatherN = t.sandbag_n.clone(); leatherN.repeat.set(6, 6); leatherN.needsUpdate = true;
  const camo = t.camoA.clone(); camo.repeat.set(2, 2); camo.needsUpdate = true;
  M = {
    glove: new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.78, metalness: 0.02, normalMap: leatherN, normalScale: new THREE.Vector2(0.45, 0.45) }),
    pad: new THREE.MeshStandardMaterial({ color: 0x3b352d, roughness: 0.6, metalness: 0.05 }),
    stitch: new THREE.MeshStandardMaterial({ color: 0x4a4339, roughness: 0.9 }),
    sleeve: new THREE.MeshStandardMaterial({ map: camo, color: 0xd9d9cf, roughness: 0.95, normalMap: t.sandbag_n, normalScale: new THREE.Vector2(0.6, 0.6) }),
    cuff: new THREE.MeshStandardMaterial({ map: camo, color: 0xb9b9ad, roughness: 0.95 }),
    velcro: new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 1 }),
    watch: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1418, roughness: 0.05, metalness: 0.9 }),
  };
  return M;
}

const UP = new THREE.Vector3(0, 1, 0);
const capCache = new Map();
function capGeo(r, len) {
  const k = `${r.toFixed(4)}_${len.toFixed(4)}`;
  if (!capCache.has(k)) capCache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.0005, len), 4, 10));
  return capCache.get(k);
}

/** Capsule entre deux points (repère du parent). */
function bone(parent, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const m = new THREE.Mesh(capGeo(r, len), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  return m;
}

/** Doigt à 3 phalanges suivant un arc autour d'un axe (pts calculés par l'appelant). */
function finger(parent, pts, r, mat) {
  for (let i = 0; i < pts.length - 1; i++) bone(parent, pts[i], pts[i + 1], r * (1 - i * 0.08), mat);
  // ongle / bout renforcé du gant
}

/** Avant-bras effilé (tour) + manche, entre le poignet W et le coude E (repère du parent). */
function forearm(parent, W, E, beyond = 0.32) {
  const m = mats();
  const A = new THREE.Vector3(...W), B = new THREE.Vector3(...E);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.normalize();
  // manche : profil légèrement bombé, plis
  const prof = [];
  const total = len + beyond;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    let r = 0.034 + 0.016 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) + 0.004 * Math.sin(t * 22);
    if (i === 0) r = 0.03;
    prof.push(new THREE.Vector2(r, t * total));
  }
  const sleeve = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), m.sleeve);
  sleeve.position.copy(A).addScaledVector(dir, 0.035);
  sleeve.quaternion.setFromUnitVectors(UP, dir);
  parent.add(sleeve);
  // revers retroussé au poignet
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 20), m.cuff);
  cuff.position.copy(A).addScaledVector(dir, 0.04);
  cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  parent.add(cuff);
  // poignet ganté
  bone(parent, W, A.clone().addScaledVector(dir, 0.05).toArray(), 0.026, m.glove);
  return { dir, A };
}

/** Repère orthonormé à partir d'un axe "haut" et d'une direction "arrière" approchée. */
function frame(up, back) {
  const Y = new THREE.Vector3(...up).normalize();
  const Z = new THREE.Vector3(...back);
  Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z);
}

/**
 * Main refermée sur une poignée verticale (pistolet / poignée avant).
 * center : centre de la poignée ; up : axe de la poignée vers le haut ; mirror : main gauche.
 * Retourne la position du poignet (repère du parent).
 */
export function gripHand(parent, center, up, { mirror = false, gripR = 0.016, watch = false } = {}) {
  const m = mats();
  const h = new THREE.Group();
  h.applyMatrix4(frame(up, [0, 0, 1]));
  if (mirror) h.scale.x = -1;
  h.position.set(...center);
  parent.add(h);
  const R = gripR + 0.009;
  const P = (deg, y, rr = R) => { const a = (deg * Math.PI) / 180; return [rr * Math.cos(a), y, -rr * Math.sin(a)]; };
  // paume (côté arrière-droit de la poignée)
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.09, 0.058, 3, 0.011), m.glove);
  palm.position.set(R * 0.75, -0.004, R * 0.95);
  palm.rotation.y = -Math.PI / 4;
  h.add(palm);
  // renfort de phalanges
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.07, 0.026, 2, 0.008), m.pad);
  pad.position.set(R * 1.25, -0.002, R * 0.05);
  pad.rotation.y = -Math.PI / 6;
  h.add(pad);
  // index (posé le long du pontet), majeur, annulaire, auriculaire
  const ys = [0.03, 0.009, -0.012, -0.032];
  ys.forEach((y, i) => {
    const r = i === 3 ? 0.0074 : 0.0086;
    const curl = i === 0 ? [-25, 30, 70, 95] : [-30, 40, 100, 150];
    finger(h, curl.map((d, k) => P(d, y - k * 0.001, R + (k === 0 ? 0.004 : 0))), r, m.glove);
  });
  // pouce : par-dessus, côté gauche
  bone(h, [R * 0.4, 0.034, R * 0.9], [-R * 0.25, 0.04, R * 0.35], 0.0098, m.glove);
  bone(h, [-R * 0.25, 0.04, R * 0.35], [-R * 0.95, 0.034, -R * 0.35], 0.009, m.glove);
  // poignet
  const W = new THREE.Vector3(R * 1.1, -0.03, R * 2.2);
  bone(h, [R * 0.9, -0.01, R * 1.3], W.toArray(), 0.027, m.glove);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 6, 16), m.velcro);
  strap.position.copy(W); strap.rotation.x = Math.PI / 2 - 0.5;
  h.add(strap);
  if (watch) {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.007, 16), m.watch);
    face.position.copy(W).add(new THREE.Vector3(0.026, 0.0, 0)); face.rotation.z = Math.PI / 2; h.add(face);
  }
  h.updateMatrix();
  return W.clone().applyMatrix4(h.matrix);
}

/**
 * Main gauche en « C » sous le garde-main (axe le long de z).
 * center : point d'appui sous le garde-main ; hgR : rayon du garde-main.
 */
export function supportHand(parent, center, { hgR = 0.03, watch = true } = {}) {
  const m = mats();
  const h = new THREE.Group();
  h.position.set(...center);
  parent.add(h);
  const R = hgR + 0.0095;
  const C = [0, R - 0.006, 0]; // axe du garde-main au-dessus du point d'appui
  const P = (deg, z, rr = R) => { const a = (deg * Math.PI) / 180; return [C[0] + rr * Math.sin(a), C[1] - rr * Math.cos(a), z]; };
  // paume sous le garde-main, inclinée vers la gauche
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.058, 0.026, 0.085, 3, 0.011), m.glove);
  palm.position.set(-0.012, C[1] - R - 0.006, 0.004);
  palm.rotation.z = -0.35;
  h.add(palm);
  // doigts qui remontent sur le flanc droit
  [-0.03, -0.01, 0.01, 0.029].forEach((z, i) => {
    const r = i === 3 ? 0.0074 : 0.0086;
    finger(h, [-15, 35, 85, 125].map((d, k) => P(d, z + k * 0.001, R + (k === 0 ? 0.004 : 0))), r, m.glove);
  });
  // pouce le long du flanc gauche, vers l'avant
  bone(h, [-0.03, C[1] - R + 0.004, 0.035], [-R - 0.003, C[1] - 0.006, 0.0], 0.0098, m.glove);
  bone(h, [-R - 0.003, C[1] - 0.006, 0.0], [-R - 0.001, C[1] + 0.006, -0.032], 0.009, m.glove);
  // poignet
  const W = new THREE.Vector3(-0.034, C[1] - R - 0.036, 0.058);
  bone(h, [-0.02, C[1] - R - 0.01, 0.03], W.toArray(), 0.027, m.glove);
  if (watch) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.005, 6, 18), m.watch);
    band.position.copy(W).add(new THREE.Vector3(0.004, -0.004, 0.012)); band.rotation.x = Math.PI / 2 - 0.6; h.add(band);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 16), m.watch);
    face.position.copy(W).add(new THREE.Vector3(-0.028, 0, 0.012)); face.rotation.z = Math.PI / 2; h.add(face);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.011, 16), m.glass);
    glass.position.copy(face.position).add(new THREE.Vector3(-0.0045, 0, 0)); glass.rotation.y = -Math.PI / 2; h.add(glass);
  }
  return W.clone().add(h.position);
}

/**
 * Bras complets pour une arme.
 * gripR : poignée (main droite) ; supL : appui main gauche ; opts.gripUp : inclinaison de la poignée,
 * opts.support : 'rail' (garde-main), 'vgrip' (poignée verticale), 'pistol' (deux mains sur la crosse).
 */
export function buildArms(g, gripR, supL, opts = {}) {
  const up = opts.gripUp || [0, 1, -0.35];
  const wR = gripHand(g, gripR, up, { gripR: opts.gripRadius || 0.016 });
  const eR = [wR.x + 0.07, wR.y - 0.17, wR.z + 0.3];
  forearm(g, wR.toArray(), eR);
  if (!supL) return;
  let wL;
  if (opts.support === 'pistol') {
    wL = gripHand(g, [gripR[0] - 0.02, gripR[1] - 0.006, gripR[2] - 0.012], up, { mirror: true, gripR: 0.02, watch: true });
  } else if (opts.support === 'vgrip') {
    wL = gripHand(g, supL, [0, 1, 0.15], { mirror: true, gripR: 0.0135, watch: true });
  } else {
    wL = supportHand(g, supL, { hgR: opts.hgR || 0.03 });
  }
  const eL = [wL.x - 0.13, wL.y - 0.17, wL.z + 0.27];
  forearm(g, wL.toArray(), eL);
}
