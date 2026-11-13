// Modèle de soldat low-poly animé procéduralement (bots + joueurs distants).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getTextures } from './textures.js';

export const TEAM_COLORS = {
  A: { uniform: 0x4f5a3a, vest: 0x363d2c, helmet: 0x4a5236, accent: 0x3d8bff, camo: 'camoA' },
  B: { uniform: 0x7a6a50, vest: 0x4e4232, helmet: 0x6b5c44, accent: 0xff4040, camo: 'camoB' },
  C: { uniform: 0x3f4550, vest: 0x2a2e36, helmet: 0x353a44, accent: 0xff4040, camo: 'camoC' },
};

const geoCache = new Map();
function box(w, h, d) {
  const k = `${w}_${h}_${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.3));
  return geoCache.get(k);
}
const camoCache = new Map();
function camoMat(key) {
  if (!camoCache.has(key)) {
    const t = getTextures();
    camoCache.set(key, new THREE.MeshStandardMaterial({ map: t[key], normalMap: t.sandbag_n, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95 }));
  }
  return camoCache.get(key);
}
const matCache = new Map();
function mat(color, rough = 0.85, metal = 0.05) {
  const k = `${color}_${rough}_${metal}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(k);
}

const UP = new THREE.Vector3(0, 1, 0);
function limb(parent, from, to, t, m) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(box(t, Math.round(len * 100) / 100, t), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(mesh);
  return mesh;
}

export class SoldierModel {
  constructor(scheme) {
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    const mU = camoMat(scheme.camo), mV = mat(scheme.vest, 0.9), mH = camoMat(scheme.camo);
    const mS = mat(0xc49a7c, 0.7), mB = mat(0x1e1e1e, 0.9), mG = mat(0x222326, 0.45, 0.6);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.root.add(this.hips);
    const mkLeg = (x) => {
      const leg = new THREE.Group(); leg.position.set(x, 0, 0);
      const thigh = new THREE.Mesh(box(0.17, 0.5, 0.2), mU); thigh.position.y = -0.25; leg.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.48; leg.add(knee);
      const shin = new THREE.Mesh(box(0.15, 0.42, 0.17), mU); shin.position.y = -0.21; knee.add(shin);
      const boot = new THREE.Mesh(box(0.16, 0.1, 0.27), mB); boot.position.set(0, -0.42, -0.04); knee.add(boot);
      const pad = new THREE.Mesh(box(0.15, 0.1, 0.06), mV); pad.position.set(0, -0.02, -0.1); knee.add(pad);
      this.hips.add(leg);
      return { leg, knee };
    };
    this.legL = mkLeg(-0.11);
    this.legR = mkLeg(0.11);

    this.upper = new THREE.Group();
    this.upper.position.y = 0.95;
    this.root.add(this.upper);
    const u = this.upper;
    const torso = new THREE.Mesh(box(0.44, 0.56, 0.25), mU); torso.position.y = 0.3; u.add(torso);
    const vest = new THREE.Mesh(box(0.48, 0.4, 0.31), mV); vest.position.y = 0.32; u.add(vest);
    const pouch = new THREE.Mesh(box(0.36, 0.1, 0.07), mV); pouch.position.set(0, 0.17, -0.18); u.add(pouch);
    const pack = new THREE.Mesh(box(0.34, 0.36, 0.14), mV); pack.position.set(0, 0.34, 0.22); u.add(pack);
    const belt = new THREE.Mesh(box(0.46, 0.08, 0.27), mB); belt.position.y = 0.03; u.add(belt);

    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    u.add(this.head);
    const neck = new THREE.Mesh(box(0.1, 0.1, 0.1), mS); neck.position.y = -0.04; this.head.add(neck);
    const head = new THREE.Mesh(box(0.2, 0.23, 0.22), mS); head.position.y = 0.1; this.head.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mH);
    helmet.position.y = 0.16; helmet.scale.set(1, 0.85, 1.08); this.head.add(helmet);
    const rim = new THREE.Mesh(box(0.31, 0.03, 0.33), mH); rim.position.y = 0.16; this.head.add(rim);
    const goggles = new THREE.Mesh(box(0.21, 0.05, 0.04), mB); goggles.position.set(0, 0.13, -0.12); this.head.add(goggles);

    // Arme
    const gun = new THREE.Group();
    gun.position.set(0.08, 0.36, -0.2);
    u.add(gun);
    const gbody = new THREE.Mesh(box(0.07, 0.1, 0.55), mG); gbody.position.z = -0.1; gun.add(gbody);
    const barrel = new THREE.Mesh(box(0.03, 0.03, 0.25), mG); barrel.position.set(0, 0.01, -0.48); gun.add(barrel);
    const gmag = new THREE.Mesh(box(0.05, 0.15, 0.07), mG); gmag.position.set(0, -0.1, -0.08); gmag.rotation.x = 0.2; gun.add(gmag);
    const stock = new THREE.Mesh(box(0.06, 0.09, 0.18), mG); stock.position.set(0, -0.02, 0.25); gun.add(stock);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.01, -0.62); gun.add(this.muzzle);
    this.gun = gun;

    // Bras (tenant l'arme)
    const sR = [0.25, 0.5, 0], sL = [-0.25, 0.5, 0];
    const eR = [0.27, 0.28, -0.02], eL = [-0.14, 0.3, -0.26];
    const hR = [0.09, 0.3, -0.12], hL = [0.07, 0.34, -0.44];
    limb(u, sR, eR, 0.12, mU); limb(u, eR, hR, 0.1, mU);
    limb(u, sL, eL, 0.12, mU); limb(u, eL, hL, 0.1, mU);
    for (const p of [hR, hL]) { const h = new THREE.Mesh(box(0.08, 0.08, 0.09), mB); h.position.set(...p); u.add(h); }
    for (const x of [-0.25, 0.25]) { const s = new THREE.Mesh(box(0.15, 0.12, 0.2), mV); s.position.set(x, 0.52, 0); u.add(s); }

    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.phase = Math.random() * 10;
    this.flinch = 0;
    this.crouchT = 0;
  }

  addTag(text, color = '#5aa9ff') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 28px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, 128, 26); ctx.fillStyle = color; ctx.fillText(text, 128, 26);
    ctx.beginPath(); ctx.moveTo(116, 40); ctx.lineTo(140, 40); ctx.lineTo(128, 56); ctx.closePath(); ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.1, 0.275, 1);
    sp.position.y = 2.25;
    sp.renderOrder = 10;
    this.group.add(sp);
    this.tag = sp;
  }

  animate(dt, speed, aimPitch, crouch) {
    this.phase += dt * speed * 2.4;
    const amp = Math.min(1, speed / 4.5) * 0.7;
    const s = Math.sin(this.phase);
    this.crouchT += ((crouch ? 1 : 0) - this.crouchT) * Math.min(1, dt * 8);
    const c = this.crouchT;
    this.legL.leg.rotation.x = s * amp + 1.0 * c;
    this.legR.leg.rotation.x = -s * amp + 1.0 * c;
    this.legL.knee.rotation.x = -Math.max(0, -s) * amp * 1.4 - 1.8 * c;
    this.legR.knee.rotation.x = -Math.max(0, s) * amp * 1.4 - 1.8 * c;
    const bob = Math.abs(Math.cos(this.phase)) * 0.04 * amp;
    this.hips.position.y = 0.95 - 0.38 * c + bob;
    this.upper.position.y = 0.95 - 0.38 * c + bob;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.upper.rotation.x = aimPitch * 0.85 - this.flinch * 0.3 + c * 0.15;
    this.upper.rotation.z = Math.sin(this.phase) * 0.04 * amp;
    this.head.rotation.x = aimPitch * 0.15;
  }
}
